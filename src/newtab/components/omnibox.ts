import type { SyncStorageSettings } from "../state/types";
import { SEARCH_ENGINES } from "../services/rss";
import { feedStore, uiStore } from "../state/store";
import { escapeHtml, svgIcon, showToast } from "../utils";
import { triggerAI } from "./ai-chat";
import { aiConfigured } from "./article-row";
import { clearFeedSearch, matchesFilter } from "./feed-sidebar";
import { moveSelection } from "./feed-list";

const ENGINE_NAMES: Record<SyncStorageSettings["searchEngine"], string> = {
  brave: "Brave",
  google: "Google",
  ddg: "DuckDuckGo",
  bing: "Bing",
  custom: "the web",
};

const isMac = navigator.platform.toUpperCase().includes("MAC");
const MOD = isMac ? "⌘" : "Ctrl";

type ActionId = "open" | "web" | "ai";

let settings: SyncStorageSettings;
let built = false;

function searchWeb(query: string): void {
  const engine = settings.searchEngine === "custom"
    ? settings.customSearchUrl
    : SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.brave;
  const url = engine.replace("{query}", encodeURIComponent(query));
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
  let active: ActionId = "web";
  let filterTimer: ReturnType<typeof setTimeout> | undefined;

  const actions = (): ActionId[] => {
    const list: ActionId[] = queryToUrl(input.value.trim()) ? ["open", "web"] : ["web"];
    if (aiConfigured(settings)) list.push("ai");
    return list;
  };

  function renderMenu(): void {
    const q = input.value.trim();
    const open = !!q && document.activeElement === input;
    menu.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (!open) return;

    const quoted = `“${escapeHtml(q)}”`;
    const list = actions();
    const count = feedMatchCount(q);
    const option = (id: ActionId, icon: string, label: string, key: string) => `
      <div class="omnibox-option${id === active ? " is-active" : ""}" role="option" id="nt-opt-${id}" data-action="${id}" aria-selected="${id === active}">
        <span class="omnibox-option-icon">${icon}</span>
        <span class="omnibox-option-label">${label}</span>
        ${key ? `<kbd>${key}</kbd>` : ""}
      </div>`;

    menu.innerHTML = `
      ${list.includes("open") ? option("open", svgIcon("open-in-new", 14), `Open ${quoted}`, "↵") : ""}
      ${option("web", svgIcon("search", 14), `Search ${ENGINE_NAMES[settings.searchEngine]} for ${quoted}`, list.includes("open") ? "⇧ ↵" : "↵")}
      ${list.includes("ai") ? option("ai", svgIcon("sparkles", 14), `Ask AI about ${quoted}`, `${MOD} ↵`) : ""}
      <div class="omnibox-menu-note">
        ${count
          ? `${count} matching ${count === 1 ? "article" : "articles"} shown below`
          : "No matching articles in your feed"}
      </div>
    `;
    input.setAttribute("aria-activedescendant", `nt-opt-${active}`);
  }

  function run(action: ActionId): void {
    const q = input.value.trim();
    if (!q) return;
    if (action === "open") openUrl(queryToUrl(q) ?? q);
    else if (action === "web") searchWeb(q);
    else askAI(q);
    if (settings.clearSearchOnSubmit) {
      clearTimeout(filterTimer);
      input.value = "";
      clearFeedSearch();
    }
    input.blur();
  }

  input.addEventListener("input", () => {
    active = actions()[0];
    renderMenu();
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q) uiStore.set((s) => ({ ...s, feedSearchQuery: q }));
      else clearFeedSearch();
    }, 120);
  });

  input.addEventListener("focus", renderMenu);
  input.addEventListener("blur", () => {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
  });

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
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const list = actions();
      if (menu.hidden || list.length < 2) return;
      e.preventDefault();
      const i = list.indexOf(active);
      active = list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length];
      renderMenu();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      run(e.metaKey || e.ctrlKey ? "ai" : e.shiftKey ? "web" : active);
      return;
    }
    if (e.key === "Escape") {
      // Handled here so the page-level Escape doesn't also close panels.
      e.stopPropagation();
      if (input.value) {
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
    const option = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!option) return;
    e.preventDefault();
    run(option.dataset.action as ActionId);
  });

  feedStore.subscribe(() => {
    if (!menu.hidden) renderMenu();
  });
}
