import type { FeedItem, SyncStorageSettings } from "../state/types";
import { feedStore, readStore, uiStore } from "../state/store";
import { storage } from "../services/storage";
import { setArticleSaved } from "../services/saved";
import { markRead, markUnread } from "../services/read";
import { getDomain, resolveFavicons } from "../services/favicon";
import { escapeHtml, svgIcon, showToast } from "../utils";
import { aiConfigured, handleThumbErrors, renderRow } from "./article-row";
import { triggerAI } from "./ai-chat";
import { addFeed, openSettings, PUBLIC_FEED_CATALOG } from "./settings-drawer";
import { clearFeedSearch, filterLabel, matchesFilter } from "./feed-sidebar";

// Rows rendered per batch; more load as the sentinel scrolls into view.
const BATCH = 40;

let settings: SyncStorageSettings | null = null;
const faviconCache = new Map<string, string | null>();
let visibleCount = BATCH;
let selectedId: string | null = null;
// Where the selection sat, so it can stay put when its article leaves the list.
let selectedIndex = 0;
let lastMoveAt = 0;
let listEl: HTMLElement | null = null;
let headEl: HTMLElement | null = null;
let renderSeq = 0;
let sentinelObserver: IntersectionObserver | null = null;
// Items behind the current render, in display order, for keyboard navigation.
let currentItems: FeedItem[] = [];

export function setFeedSettings(next: SyncStorageSettings): void {
  const prev = settings;
  settings = next;
  if (prev && listEl) void render();
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Older";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startOfToday.getTime()) return "Today";
  if (t >= startOfToday.getTime() - dayMs) return "Yesterday";
  if (t >= startOfToday.getTime() - 6 * dayMs) return "This week";
  return "Older";
}

async function currentFiltered(): Promise<FeedItem[]> {
  const { activeFilter, feedSearchQuery } = uiStore.get();
  let items: FeedItem[];
  if (activeFilter === "saved") {
    // Saved reads storage so articles that left the feed still show.
    items = (await storage.getSavedArticles())
      .map((i) => ({ ...i, saved: true }))
      .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
  } else {
    items = feedStore.get().filter((i) => matchesFilter(i, activeFilter));
  }
  const q = feedSearchQuery.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.excerpt.toLowerCase().includes(q) ||
        i.feedLabel.toLowerCase().includes(q),
    );
  }
  return items;
}

function renderHead(items: FeedItem[]): void {
  if (!headEl) return;
  // The onboarding card speaks for itself; a "0 unread" header above it is noise.
  if (!settings?.feedsConfig.length) {
    headEl.innerHTML = "";
    return;
  }
  const { activeFilter, feedSearchQuery } = uiStore.get();
  const read = readStore.get();
  const unread = items.filter((i) => !read.has(i.id)).length;
  const title = feedSearchQuery
    ? `Results for “${escapeHtml(feedSearchQuery)}”`
    : escapeHtml(filterLabel(activeFilter, settings));
  const count = feedSearchQuery
    ? `${items.length} ${items.length === 1 ? "article" : "articles"}`
    : activeFilter === "saved"
      ? `${items.length} saved`
      : `${unread} unread`;

  headEl.innerHTML = `
    <div class="list-head-title">
      <h2>${title}</h2>
      <span class="list-head-count">${count}</span>
    </div>
    <div class="list-head-actions">
      ${feedSearchQuery ? `<button class="btn btn-ghost btn-sm" data-head="clear-search">${svgIcon("close", 13)} Clear search</button>` : ""}
      ${activeFilter !== "saved" && unread > 0 ? `<button class="btn btn-ghost btn-sm" data-head="mark-all">Mark all as read</button>` : ""}
    </div>
  `;
}

function renderEmpty(): string {
  const { activeFilter, feedSearchQuery } = uiStore.get();
  if (feedSearchQuery) {
    return `<div class="list-empty"><p>No articles match “${escapeHtml(feedSearchQuery)}”.</p>
      <button class="btn btn-secondary btn-sm" data-head="clear-search">Clear search</button></div>`;
  }
  if (activeFilter === "saved") {
    return `<div class="list-empty"><p>Nothing saved yet. Press <kbd>s</kbd> on an article, or use its bookmark button, to keep it here.</p></div>`;
  }
  if (!settings?.feedsConfig.length) {
    const picks = Object.entries(PUBLIC_FEED_CATALOG).flatMap(([cat, feeds]) =>
      feeds.map((f) => ({ ...f, cat })),
    );
    return `
      <div class="list-empty list-empty--onboard">
        <h3>Add a feed to start reading</h3>
        <p>Paste any RSS or Atom URL in settings, or start with one of these.</p>
        <div class="list-empty-picks">
          ${picks.map((f) => `
            <button class="chip" data-add-feed="${escapeHtml(f.url)}" data-label="${escapeHtml(f.label)}" data-cat="${escapeHtml(f.cat)}">
              ${svgIcon("plus", 12)} ${escapeHtml(f.label)}
            </button>`).join("")}
        </div>
        <button class="btn btn-primary btn-sm" data-head="open-feeds">Add a feed URL</button>
      </div>`;
  }
  if (!feedStore.get().length) {
    return `<div class="list-empty"><p>Fetching your feeds…</p></div>`;
  }
  return `<div class="list-empty"><p>No articles here yet.</p></div>`;
}

async function render(): Promise<void> {
  if (!listEl) return;
  const seq = ++renderSeq;
  const items = await currentFiltered();
  if (seq !== renderSeq) return;

  // Rebuilding the list drops focus; remember whether the reader was in it.
  const hadFocus = listEl.contains(document.activeElement);
  currentItems = items;
  renderHead(items);

  // The selected article left the list (unsaved in Saved, feed removed):
  // select whatever now sits in its place instead of jumping back to the top.
  if (selectedId && !items.some((i) => i.id === selectedId)) {
    selectedId = items.length ? items[Math.min(selectedIndex, items.length - 1)].id : null;
  }

  if (!items.length) {
    listEl.innerHTML = renderEmpty();
    return;
  }

  const shown = items.slice(0, visibleCount);
  const unresolved = [...new Set(shown.map((i) => getDomain(i.url)).filter(Boolean))]
    .filter((d) => !faviconCache.has(d));
  if (unresolved.length) {
    const resolved = await resolveFavicons(unresolved);
    resolved.forEach((url, domain) => faviconCache.set(domain, url));
    if (seq !== renderSeq) return;
  }

  const read = readStore.get();
  const canAsk = aiConfigured(settings);
  // Saved is ordered by save time, so day groups would repeat.
  const grouped = uiStore.get().activeFilter !== "saved";
  let html = "";
  let lastGroup = "";
  for (const item of shown) {
    if (grouped) {
      const group = dayGroup(item.publishedAt);
      if (group !== lastGroup) {
        html += `<h4 class="list-group" role="presentation">${group}</h4>`;
        lastGroup = group;
      }
    }
    html += renderRow(item, settings, faviconCache, { read: read.has(item.id), canAsk });
  }
  if (items.length > shown.length) {
    html += `<div class="list-sentinel" aria-hidden="true"></div>`;
  }
  listEl.innerHTML = html;
  applySelection({ focus: hadFocus });

  const sentinel = listEl.querySelector(".list-sentinel");
  if (sentinel && sentinelObserver) sentinelObserver.observe(sentinel);
}

function rowFor(id: string | null): HTMLElement | null {
  if (!id || !listEl) return null;
  return listEl.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`);
}

function headerHeight(): number {
  return document.getElementById("nt-topbar")?.offsetHeight ?? 64;
}

function isInView(row: HTMLElement): boolean {
  const r = row.getBoundingClientRect();
  return r.bottom > headerHeight() + 8 && r.top < window.innerHeight - 8;
}

/** The first row not hidden under the header, for starting from where the reader is looking. */
function firstVisibleRow(): HTMLElement | null {
  const top = headerHeight() + 8;
  for (const row of listEl?.querySelectorAll<HTMLElement>(".row[data-id]") ?? []) {
    if (row.getBoundingClientRect().bottom > top) return row;
  }
  return null;
}

interface SelectOptions {
  scroll?: boolean;
  /** Move keyboard focus to the row's link (screen readers, Tab, Enter). */
  focus?: boolean;
  instant?: boolean;
}

function applySelection({ scroll = false, focus = false, instant = false }: SelectOptions = {}): void {
  listEl?.querySelectorAll(".row.is-selected").forEach((el) => el.classList.remove("is-selected"));
  const row = rowFor(selectedId);
  if (!row) return;
  row.classList.add("is-selected");
  const index = currentItems.findIndex((i) => i.id === selectedId);
  if (index >= 0) selectedIndex = index;
  if (focus) row.querySelector<HTMLElement>(".row-title a")?.focus({ preventScroll: true });
  // scroll-margin on .row keeps it clear of the fixed header.
  if (scroll) row.scrollIntoView({ block: "nearest", behavior: instant ? "auto" : "smooth" });
}

/** j/k and ↑/↓ navigation. Loads the next batch when moving past the last rendered row. */
export function moveSelection(delta: 1 | -1, opts: { searchAtTop?: boolean } = {}): void {
  if (!currentItems.length || !listEl) return;
  listEl.classList.add("is-keyboard");
  // Held keys or fast taps: jump instead of queueing smooth scrolls.
  const now = performance.now();
  const instant = now - lastMoveAt < 180;
  lastMoveAt = now;

  // No selection yet, or it was scrolled out of view with the mouse: start
  // from the first row on screen rather than jumping back to the old spot.
  const current = rowFor(selectedId);
  if (!current || !isInView(current)) {
    const start = firstVisibleRow();
    if (start) {
      selectedId = start.dataset.id!;
      applySelection({ scroll: true, focus: true, instant });
      return;
    }
  }

  const index = currentItems.findIndex((i) => i.id === selectedId);
  // ↑ on the first article goes back to the search box it came from.
  if (index === 0 && delta < 0 && opts.searchAtTop) {
    selectedId = null;
    applySelection();
    window.scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
    document.getElementById("nt-search-input")?.focus();
    return;
  }
  const next = Math.max(0, Math.min(currentItems.length - 1, index + delta));
  // At the top, k reveals the quick links and header area again.
  if (next === 0 && delta < 0) window.scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
  selectedId = currentItems[next].id;
  if (next >= visibleCount) {
    visibleCount += BATCH;
    void render().then(() => applySelection({ scroll: true, focus: true, instant }));
    return;
  }
  applySelection({ scroll: next !== 0 || delta > 0, focus: true, instant });
}

export function hasSelection(): boolean {
  return !!rowFor(selectedId);
}

export type RowAction = "open" | "save" | "ask" | "toggle-read";

export function actOnSelection(action: RowAction): void {
  const row = rowFor(selectedId);
  if (row) void runAction(row, action);
}

async function runAction(row: HTMLElement, action: RowAction): Promise<void> {
  const id = row.dataset.id;
  if (!id) return;
  const item =
    currentItems.find((i) => i.id === id) ?? feedStore.get().find((i) => i.id === id);
  if (!item) return;

  switch (action) {
    case "open": {
      const link = row.querySelector<HTMLAnchorElement>(".row-title a");
      if (!link) return;
      void markRead([id]);
      if (settings?.openFeedLinksIn === "same_tab") location.href = link.href;
      else window.open(link.href, "_blank", "noopener");
      return;
    }
    case "save": {
      const saved = !item.saved;
      await setArticleSaved(item, saved);
      showToast(saved ? "Saved" : "Removed from saved", saved ? "mint" : "accent");
      return;
    }
    case "ask": {
      if (!aiConfigured(settings)) {
        showToast("Turn on AI in Settings first", "red");
        return;
      }
      triggerAI(`Summarize this article: ${item.title}`);
      return;
    }
    case "toggle-read": {
      if (readStore.get().has(id)) await markUnread(id);
      else await markRead([id]);
      return;
    }
  }
}

export function renderFeedList(): void {
  listEl = document.getElementById("nt-feed-list");
  headEl = document.getElementById("nt-feed-head");
  if (!listEl || !headEl) return;
  const list = listEl;

  list.innerHTML = Array.from({ length: 8 }, () => `
    <div class="row is-skeleton" aria-hidden="true">
      <span class="row-time"></span>
      <div class="row-main"><span class="sk sk-title"></span><span class="sk sk-meta"></span></div>
    </div>`).join("");

  sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      sentinelObserver?.disconnect();
      visibleCount += BATCH;
      void render();
    },
    { rootMargin: "600px 0px" },
  );

  handleThumbErrors(list);

  feedStore.subscribe(() => void render());

  // Read state changes only flip classes and counts; no full re-render.
  readStore.subscribe((read) => {
    list.querySelectorAll<HTMLElement>(".row[data-id]").forEach((row) => {
      row.classList.toggle("is-read", read.has(row.dataset.id!));
    });
    renderHead(currentItems);
  });

  let last = uiStore.get();
  uiStore.subscribe((s) => {
    const changed = s.activeFilter !== last.activeFilter || s.feedSearchQuery !== last.feedSearchQuery;
    const filterChanged = s.activeFilter !== last.activeFilter;
    last = s;
    if (!changed) return;
    visibleCount = BATCH;
    selectedId = null;
    void render();
    if (filterChanged) {
      const top = document.querySelector<HTMLElement>(".reader")?.offsetTop ?? 0;
      if (window.scrollY > top) window.scrollTo({ top: top - 72 });
    }
  });

  const onClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const head = target.closest<HTMLElement>("[data-head]");
    if (head) {
      const kind = head.dataset.head;
      if (kind === "clear-search") clearFeedSearch();
      if (kind === "mark-all") void markRead(currentItems.map((i) => i.id));
      if (kind === "open-feeds") openSettings("feeds");
      return;
    }

    const pick = target.closest<HTMLButtonElement>("[data-add-feed]");
    if (pick) {
      pick.disabled = true;
      await addFeed({
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: pick.dataset.addFeed!,
        label: pick.dataset.label!,
        category: pick.dataset.cat!,
        enabled: true,
        refreshIntervalMins: 60,
        maxArticles: 32,
      });
      return;
    }

    const row = target.closest<HTMLElement>(".row[data-id]");
    if (!row) return;
    selectedId = row.dataset.id!;
    applySelection();

    const actionBtn = target.closest<HTMLButtonElement>("[data-action]");
    if (actionBtn) {
      e.preventDefault();
      await runAction(row, actionBtn.dataset.action as RowAction);
      return;
    }

    // The title link covers the row; let the browser open it, just record the read.
    if (target.closest(".row-title a")) {
      void markRead([row.dataset.id!]);
      if (settings?.openFeedLinksIn === "same_tab") {
        e.preventDefault();
        location.href = (target.closest(".row-title a") as HTMLAnchorElement).href;
      }
    }
  };
  list.addEventListener("click", onClick);
  headEl.addEventListener("click", onClick);
  // Tabbing into a row selects it, so keyboard focus and selection never disagree.
  list.addEventListener("focusin", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".row[data-id]");
    if (!row || row.dataset.id === selectedId) return;
    selectedId = row.dataset.id!;
    applySelection();
  });
  // Mouse use ends keyboard mode, so hover styles come back.
  list.addEventListener("mousemove", (e) => {
    if (e.movementX || e.movementY) list.classList.remove("is-keyboard");
  });

  // Middle-click opens in a background tab; still counts as read.
  list.addEventListener("auxclick", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".row[data-id]");
    if (row && (e.target as HTMLElement).closest(".row-title a")) void markRead([row.dataset.id!]);
  });

  // Until the first feedStore update, keep the skeleton up.
  if (feedStore.get().length) void render();
}
