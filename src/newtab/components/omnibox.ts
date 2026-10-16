import type { SyncStorageSettings } from "../state/types";
import { SEARCH_ENGINES } from "../services/rss";
import { feedStore, uiStore } from "../state/store";
import { escapeHtml, svgIcon, showToast } from "../utils";
import { triggerAI } from "./ai-chat";
import { aiConfigured } from "./article-row";
import { clearFeedSearch, matchesFilter } from "./feed-sidebar";
import { afterFilterRender, moveSelection } from "./feed-list";
import { addHistory, loadHistory, type HistoryEntry } from "../services/history";
import { fetchSuggestions } from "../services/suggest";
import { getDomain, resolveFavicons } from "../services/favicon";

const ENGINE_NAMES: Record<SyncStorageSettings["searchEngine"], string> = {
  brave: "Brave",
  google: "Google",
  ddg: "DuckDuckGo",
  bing: "Bing",
  custom: "the web",
};

const isMac = navigator.platform.toUpperCase().includes("MAC");
const MOD = isMac ? "⌘" : "Ctrl";

interface MenuOption {
  id: string;
  kind: "open" | "web" | "ai" | "history" | "visit" | "suggest";
  /** What the option acts on: the typed query, or a history/suggestion entry. */
  text: string;
  /** History entries that were opened URLs rather than searches. */
  isUrl?: boolean;
  /** Page title for browser-history visits. */
  title?: string;
}

const MAX_HISTORY_SHOWN = 4;
const MAX_VISITS_SHOWN = 6;
const SUGGEST_DELAY_MS = 150;

let settings: SyncStorageSettings;
let built = false;

function searchUrl(query: string): string {
  const engine = settings.searchEngine === "custom"
    ? settings.customSearchUrl
    : SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.brave;
  return engine.replace("{query}", encodeURIComponent(query));
}

function searchWeb(query: string): void {
  const url = searchUrl(query);
  window.open(url, settings.openLinksIn === "new_tab" ? "_blank" : "_self");
}

// Schemes typed out in full are opened as-is; javascript: and data: never match.
const SCHEME_RE = /^(https?|ftp|file|chrome|edge|brave|about|view-source):\S+$/i;
const HOST_RE =
  /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63})(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/** The URL a query points at, or null if it reads as search terms. */
function queryToUrl(query: string): string | null {
  if (/\s/.test(query)) return null;
  if (SCHEME_RE.test(query)) return query;
  const host = HOST_RE.exec(query)?.[1];
  if (!host) return null;
  const local = host === "localhost" || /^\d/.test(host);
  return `${local ? "http" : "https"}://${query}`;
}

/** Comparable form of a URL: no scheme, "www.", or trailing slash. */
function urlKey(url: string): string {
  return url.toLowerCase().replace(/^[a-z]+:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/**
 * Roughly how the address bar ranks history: pages you typed in beat pages you
 * clicked through to, and a host that starts with the query beats a title match.
 */
function visitScore(v: chrome.history.HistoryItem, query: string): number {
  const q = query.toLowerCase();
  const host = getDomain(v.url ?? "").replace(/^www\./, "");
  const hostBonus = host.startsWith(q) ? 1000 : urlKey(v.url ?? "").includes(q) ? 100 : 0;
  return hostBonus + (v.typedCount ?? 0) * 20 + (v.visitCount ?? 0);
}

function openUrl(url: string): void {
  const newTab = settings.openLinksIn === "new_tab";
  // Pages can't window.open browser-internal URLs (chrome://, about:), but the tabs API can.
  if (/^(https?|ftp):/i.test(url) || !chrome.tabs) {
    window.open(url, newTab ? "_blank" : "_self");
  } else if (newTab) {
    void chrome.tabs.create({ url });
  } else {
    void chrome.tabs.update({ url });
  }
}

function askAI(query: string): void {
  if (!aiConfigured(settings)) {
    showToast("Turn on AI in Settings first", "red");
    return;
  }
  triggerAI(query);
}

function feedMatchCount(query: string): number {
  const q = query.toLowerCase();
  const { activeFilter } = uiStore.get();
  return feedStore.get().filter(
    (i) =>
      matchesFilter(i, activeFilter) &&
      (i.title.toLowerCase().includes(q) ||
        i.excerpt.toLowerCase().includes(q) ||
        i.feedLabel.toLowerCase().includes(q)),
  ).length;
}

export function renderOmnibox(next: SyncStorageSettings): void {
  settings = next;
  const container = document.getElementById("nt-omnibox");
  if (!container) return;
  // Built once: re-rendering would drop focus and the typed query on settings saves.
  if (built) return;
  built = true;

  container.innerHTML = `
    <div class="omnibox-row">
      <span class="omnibox-icon">${svgIcon("search", 16)}</span>
      <input
        class="omnibox-input"
        id="nt-search-input"
        type="text"
        placeholder="Search your feed or the web"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-expanded="false"
        aria-controls="nt-omnibox-menu"
        aria-autocomplete="list"
        aria-label="Search"
      />
      <kbd class="omnibox-kbd">${MOD}K</kbd>
      <span class="omnibox-browse-hint" aria-hidden="true"><kbd>↓</kbd> to browse</span>
    </div>
    <div class="omnibox-menu" id="nt-omnibox-menu" role="listbox" aria-label="Search actions" hidden></div>
  `;

  const input = container.querySelector<HTMLInputElement>("#nt-search-input")!;
  const menu = container.querySelector<HTMLElement>("#nt-omnibox-menu")!;
  let active = "web";
  let filterTimer: ReturnType<typeof setTimeout> | undefined;
  let history: HistoryEntry[] = [];
  let visits: { query: string; items: chrome.history.HistoryItem[] } = { query: "", items: [] };
  // Resolved favicon per domain (null = none); a domain is only looked up once.
  const favicons = new Map<string, string | null>();
  let suggestions: { query: string; items: string[] } = { query: "", items: [] };
  let suggestTimer: ReturnType<typeof setTimeout> | undefined;
  let suggestAbort: AbortController | undefined;

  const options = (): MenuOption[] => {
    const q = input.value.trim();
    const lq = q.toLowerCase();
    const list: MenuOption[] = [];
    if (queryToUrl(q)) list.push({ id: "open", kind: "open", text: q });
    list.push({ id: "web", kind: "web", text: q });
    if (aiConfigured(settings)) list.push({ id: "ai", kind: "ai", text: q });

    const seen = new Set([lq]);
    if (settings.browsingHistory && visits.query === q) {
      // Results pages of the current engine are already covered by search history and suggestions.
      const engineUrl = urlKey(searchUrl(""));
      let shown = 0;
      for (const v of visits.items) {
        if (shown === MAX_VISITS_SHOWN) break;
        const key = urlKey(v.url ?? "");
        // Different URLs of one page (fast.com, fast.com/en/) share a host and title.
        const pageKey = `${getDomain(v.url ?? "")}\n${v.title ?? ""}`;
        if (!key || seen.has(key) || (v.title && seen.has(pageKey)) || (engineUrl && key.startsWith(engineUrl))) continue;
        seen.add(key);
        seen.add(pageKey);
        shown++;
        list.push({ id: `v${list.length}`, kind: "visit", text: v.url!, isUrl: true, title: v.title || undefined });
      }
    }
    if (settings.searchHistory) {
      let shown = 0;
      for (const e of history) {
        if (shown === MAX_HISTORY_SHOWN) break;
        const key = e.kind === "url" ? urlKey(e.text) : e.text.toLowerCase();
        if (seen.has(key) || !e.text.toLowerCase().includes(lq)) continue;
        seen.add(key);
        shown++;
        list.push({ id: `h${list.length}`, kind: "history", text: e.text, isUrl: e.kind === "url" });
      }
    }
    // Stale suggestions stay up while the next request is in flight, as long as they still fit.
    if (settings.searchSuggestions) {
      for (const text of suggestions.items) {
        const key = text.toLowerCase();
        if (seen.has(key) || !key.startsWith(lq)) continue;
        seen.add(key);
        list.push({ id: `s${list.length}`, kind: "suggest", text });
      }
    }
    return list;
  };

  function siteIcon(url: string): string {
    const src = favicons.get(getDomain(url));
    return src
      ? `<img class="omnibox-favicon" src="${escapeHtml(src)}" alt="" width="14" height="14" />`
      : svgIcon("link", 14);
  }

  function loadFavicons(list: readonly MenuOption[]): void {
    const missing = [...new Set(list.filter((o) => o.isUrl).map((o) => getDomain(o.text)))]
      .filter((d) => d && !favicons.has(d));
    if (!missing.length) return;
    missing.forEach((d) => favicons.set(d, null));
    void resolveFavicons(missing).then((map) => {
      map.forEach((src, d) => favicons.set(d, src));
      if ([...map.values()].some(Boolean) && !menu.hidden) renderMenu();
    });
  }

  function requestVisits(q: string): void {
    // chrome.history only exists once the optional "history" permission is granted.
    if (!settings.browsingHistory || !q || !chrome.history) return;
    void chrome.history.search({ text: q, startTime: 0, maxResults: 20 }).then((items) => {
      if (input.value.trim() !== q) return;
      visits = { query: q, items: items.sort((a, b) => visitScore(b, q) - visitScore(a, q)) };
      if (!menu.hidden) renderMenu();
    });
  }

  function requestSuggestions(q: string): void {
    clearTimeout(suggestTimer);
    suggestAbort?.abort();
    // Typed-out URLs (file paths, internal pages) never leave the browser.
    if (!settings.searchSuggestions || !q || SCHEME_RE.test(q)) return;
    suggestTimer = setTimeout(() => {
      const ctrl = new AbortController();
      suggestAbort = ctrl;
      void fetchSuggestions(settings.searchEngine, q, ctrl.signal).then((items) => {
        if (ctrl.signal.aborted) return;
        suggestions = { query: q, items };
        if (!menu.hidden) renderMenu();
      });
    }, SUGGEST_DELAY_MS);
  }

  function renderMenu(): void {
    const q = input.value.trim();
    const open = !!q && document.activeElement === input;
    menu.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (!open) return;

    const quoted = `“${escapeHtml(q)}”`;
    const list = options();
    if (!list.some((o) => o.id === active)) active = list[0].id;
    const hasOpen = list.some((o) => o.kind === "open");
    const count = feedMatchCount(q);
    const option = (o: MenuOption, icon: string, label: string, key: string, url = "") => `
      <div class="omnibox-option${o.id === active ? " is-active" : ""}" role="option" id="nt-opt-${o.id}" data-id="${o.id}" aria-selected="${o.id === active}">
        <span class="omnibox-option-icon">${icon}</span>
        <span class="omnibox-option-label">${label}</span>
        ${url ? `<span class="omnibox-option-url">${url}</span>` : ""}
        ${key ? `<kbd>${key}</kbd>` : ""}
      </div>`;
    const optionHtml = (o: MenuOption): string => {
      switch (o.kind) {
        case "open":
          return option(o, svgIcon("open-in-new", 14), `Open ${quoted}`, "↵");
        case "web":
          return option(o, svgIcon("search", 14), `Search ${ENGINE_NAMES[settings.searchEngine]} for ${quoted}`, hasOpen ? "⇧ ↵" : "↵");
        case "ai":
          return option(o, svgIcon("sparkles", 14), `Ask AI about ${quoted}`, `${MOD} ↵`);
        case "history":
          return option(o, o.isUrl ? siteIcon(o.text) : svgIcon("history", 14), escapeHtml(o.text), "↵");
        case "visit":
          return option(o, siteIcon(o.text), escapeHtml(o.title ?? o.text), "↵", escapeHtml(getDomain(o.text) || o.text));
        case "suggest":
          return option(o, svgIcon("search", 14), escapeHtml(o.text), "↵");
      }
    };
    loadFavicons(list);
    const actionsHtml = list.filter((o) => o.kind === "open" || o.kind === "web" || o.kind === "ai").map(optionHtml).join("");
    const extrasHtml = list.filter((o) => o.kind === "history" || o.kind === "visit" || o.kind === "suggest").map(optionHtml).join("");

    menu.innerHTML = `
      ${actionsHtml}
      ${extrasHtml ? `<div class="omnibox-menu-sep" role="separator"></div>${extrasHtml}` : ""}
      <div class="omnibox-menu-note">
        ${count
          ? `${count} matching ${count === 1 ? "article" : "articles"} shown below · <kbd>Tab</kbd> to browse them, <kbd>Esc</kbd> to hide this`
          : "No matching articles in your feed"}
      </div>
    `;
    input.setAttribute("aria-activedescendant", `nt-opt-${active}`);
  }

  function record(kind: HistoryEntry["kind"], text: string): void {
    if (settings.searchHistory) void addHistory(kind, text);
  }

  function run(o: MenuOption): void {
    const q = input.value.trim();
    if (!q) return;
    if (o.kind === "open") {
      const url = queryToUrl(q) ?? q;
      record("url", url);
      openUrl(url);
    } else if (o.kind === "ai") {
      askAI(q);
    } else if (o.isUrl) {
      record("url", o.text);
      openUrl(o.text);
    } else {
      record("search", o.text);
      searchWeb(o.text);
    }
    if (settings.clearSearchOnSubmit) {
      clearTimeout(filterTimer);
      input.value = "";
      clearFeedSearch();
    }
    input.blur();
  }

  input.addEventListener("input", () => {
    active = options()[0].id;
    renderMenu();
    requestVisits(input.value.trim());
    requestSuggestions(input.value.trim());
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q) uiStore.set((s) => ({ ...s, feedSearchQuery: q }));
      else clearFeedSearch();
    }, 120);
  });

  input.addEventListener("focus", () => {
    renderMenu();
    // Re-read on each focus so searches made in other tabs show up.
    if (!settings.searchHistory) return;
    void loadHistory().then((h) => {
      history = h;
      if (!menu.hidden) renderMenu();
    });
  });
  input.addEventListener("blur", () => {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
  });

  /** Hands the keyboard to the filtered article list, keeping the query. */
  async function browseResults(): Promise<void> {
    if (filterTimer !== undefined) {
      clearTimeout(filterTimer);
      filterTimer = undefined;
      uiStore.set((s) => ({ ...s, feedSearchQuery: input.value.trim() }));
    }
    input.blur();
    await afterFilterRender();
    moveSelection(1);
  }

  input.addEventListener("keydown", (e) => {
    // From an empty box, ↓ hands the keyboard to the article list.
    if (e.key === "ArrowDown" && !input.value) {
      e.preventDefault();
      // Focus lands in the list now; don't let the page-level ↓ handler move it again.
      e.stopPropagation();
      input.blur();
      moveSelection(1);
      return;
    }
    const q = input.value.trim();
    // Tab, or ↓ once the menu is dismissed, moves into the matching articles.
    if (q && feedMatchCount(q) > 0 && ((e.key === "Tab" && !e.shiftKey) || (e.key === "ArrowDown" && menu.hidden))) {
      e.preventDefault();
      e.stopPropagation();
      void browseResults();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const list = options().map((o) => o.id);
      if (menu.hidden || list.length < 2) return;
      e.preventDefault();
      const i = list.indexOf(active);
      active = list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length];
      renderMenu();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim();
      if (e.metaKey || e.ctrlKey) run({ id: "ai", kind: "ai", text: q });
      else if (e.shiftKey) run({ id: "web", kind: "web", text: q });
      else {
        const o = options().find((x) => x.id === active);
        if (o) run(o);
      }
      return;
    }
    if (e.key === "Escape") {
      // Handled here so the page-level Escape doesn't also close panels.
      e.stopPropagation();
      // First Esc hides the menu and keeps the search filtering the list.
      if (!menu.hidden) {
        menu.hidden = true;
        input.setAttribute("aria-expanded", "false");
      } else if (input.value) {
        input.value = "";
        clearFeedSearch();
        renderMenu();
      } else {
        input.blur();
      }
    }
  });

  // mousedown keeps focus in the input, so blur doesn't hide the menu first.
  menu.addEventListener("mousedown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
    const o = el && options().find((x) => x.id === el.dataset.id);
    if (!o) return;
    e.preventDefault();
    run(o);
  });

  feedStore.subscribe(() => {
    if (!menu.hidden) renderMenu();
  });
}
