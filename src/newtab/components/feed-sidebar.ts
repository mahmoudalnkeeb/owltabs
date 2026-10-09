import type { FeedItem, SyncStorageSettings } from "../state/types";
import { feedStore, readStore, uiStore } from "../state/store";
import { storage } from "../services/storage";
import { requestRefresh } from "../services/rss";
import { getDomain, resolveFavicons } from "../services/favicon";
import { escapeHtml, svgIcon, showToast } from "../utils";
import { toggleShortcuts } from "./shortcuts";

// Filter values: "all", "saved", a category name, or "feed:<id>".
const FEED_PREFIX = "feed:";

let settings: SyncStorageSettings | null = null;
let savedCount = 0;
const faviconCache = new Map<string, string | null>();
let subscribed = false;

export function matchesFilter(item: FeedItem, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "saved") return item.saved;
  if (filter.startsWith(FEED_PREFIX)) return item.feedId === filter.slice(FEED_PREFIX.length);
  return item.feedCategory === filter;
}

/** Topic names are user-typed ("tech", "ai"): sentence case, short ones as acronyms. */
export function topicLabel(name: string): string {
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function filterLabel(filter: string, s: SyncStorageSettings | null): string {
  if (filter === "all") return "All articles";
  if (filter === "saved") return "Saved";
  if (filter.startsWith(FEED_PREFIX)) {
    const id = filter.slice(FEED_PREFIX.length);
    return s?.feedsConfig.find((f) => f.id === id)?.label ?? "Feed";
  }
  return topicLabel(filter);
}

export function clearFeedSearch(): void {
  if (!uiStore.get().feedSearchQuery) return;
  uiStore.set((s) => ({ ...s, feedSearchQuery: "" }));
  const input = document.getElementById("nt-search-input") as HTMLInputElement | null;
  if (input) input.value = "";
}

function setFilter(filter: string): void {
  uiStore.set((s) => ({ ...s, activeFilter: filter }));
}

function filterExists(filter: string, s: SyncStorageSettings): boolean {
  if (filter === "all" || filter === "saved") return true;
  if (filter.startsWith(FEED_PREFIX)) {
    return s.feedsConfig.some((f) => f.id === filter.slice(FEED_PREFIX.length));
  }
  return s.feedsConfig.some((f) => f.category === filter);
}

function render(): void {
  const container = document.getElementById("nt-feed-sidebar");
  if (!container || !settings) return;

  const items = feedStore.get();
  const read = readStore.get();
  const { activeFilter } = uiStore.get();
  const unreadWhere = (pred: (i: FeedItem) => boolean) =>
    items.filter((i) => pred(i) && !read.has(i.id)).length;

  const enabledFeeds = settings.feedsConfig.filter((f) => f.enabled);
  const feedDomain = new Map(enabledFeeds.map((f) => [f.id, getDomain(f.url)]));
  const categories = [...new Set(enabledFeeds.map((f) => f.category).filter(Boolean))];

  const entry = (filter: string, label: string, count: number | string, icon = "") => {
    const active = filter === activeFilter;
    return `
      <button class="side-item${active ? " is-active" : ""}" data-filter="${escapeHtml(filter)}" aria-current="${active ? "true" : "false"}">
        ${icon}
        <span class="side-label">${escapeHtml(label)}</span>
        ${count ? `<span class="side-count">${count}</span>` : ""}
      </button>`;
  };

  const feedIcon = (feedId: string, label: string) => {
    const domain = feedDomain.get(feedId) ?? "";
    const src = faviconCache.get(domain);
    return src
      ? `<img class="side-icon" src="${escapeHtml(src)}" alt="" width="14" height="14" loading="lazy" />`
      : `<span class="side-icon side-icon--letter" aria-hidden="true">${escapeHtml(label.charAt(0).toUpperCase())}</span>`;
  };

  container.innerHTML = `
    <div class="side-group">
      ${entry("all", "All articles", unreadWhere(() => true))}
      ${entry("saved", "Saved", savedCount)}
    </div>
    ${categories.length > 1 ? `
      <div class="side-group">
        <h3 class="side-heading">Topics</h3>
        ${categories.map((c) => entry(c, topicLabel(c), unreadWhere((i) => i.feedCategory === c))).join("")}
      </div>` : ""}
    ${enabledFeeds.length ? `
      <div class="side-group">
        <h3 class="side-heading">Sources</h3>
        ${enabledFeeds.map((f) => entry(FEED_PREFIX + f.id, f.label, unreadWhere((i) => i.feedId === f.id), feedIcon(f.id, f.label))).join("")}
      </div>` : ""}
    ${enabledFeeds.length ? `
    <div class="side-foot">
      <button class="btn btn-ghost btn-sm side-refresh" id="nt-feed-refresh-btn">
        ${svgIcon("refresh", 13)} Refresh feeds
      </button>
      <button class="btn btn-ghost btn-sm side-shortcuts" id="nt-shortcuts-btn">
        ${svgIcon("keyboard", 13)} Keyboard shortcuts <kbd>?</kbd>
      </button>
    </div>` : ""}
  `;

  // Resolve source favicons once, then re-render with them.
  const missing = [...new Set(feedDomain.values())].filter((d) => d && !faviconCache.has(d));
  if (missing.length) {
    missing.forEach((d) => faviconCache.set(d, null));
    void resolveFavicons(missing).then((resolved) => {
      resolved.forEach((url, domain) => faviconCache.set(domain, url));
      render();
    });
  }
}

async function refreshSavedCount(): Promise<void> {
  savedCount = (await storage.getSavedArticles()).length;
  render();
}

export function renderFeedSidebar(next: SyncStorageSettings): void {
  settings = next;
  const container = document.getElementById("nt-feed-sidebar");
  if (!container) return;

  if (!filterExists(uiStore.get().activeFilter, next)) setFilter("all");

  if (!subscribed) {
    subscribed = true;
    feedStore.subscribe(() => void refreshSavedCount());
    readStore.subscribe(render);
    let lastFilter = uiStore.get().activeFilter;
    uiStore.subscribe((s) => {
      if (s.activeFilter === lastFilter) return;
      lastFilter = s.activeFilter;
      render();
    });

    container.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest<HTMLButtonElement>("[data-filter]");
      if (item) {
        setFilter(item.dataset.filter || "all");
        return;
      }
      if (target.closest("#nt-shortcuts-btn")) {
        toggleShortcuts();
        return;
      }
      const refresh = target.closest<HTMLButtonElement>("#nt-feed-refresh-btn");
      if (refresh) {
        refresh.classList.add("is-busy");
        refresh.disabled = true;
        const ok = await requestRefresh(true);
        refresh.classList.remove("is-busy");
        refresh.disabled = false;
        showToast(ok ? "Feeds refreshed" : "Couldn't refresh feeds", ok ? "mint" : "red");
      }
    });
  }

  void refreshSavedCount();
}
