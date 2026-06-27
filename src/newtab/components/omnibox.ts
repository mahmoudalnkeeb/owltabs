import type { SyncStorageSettings } from "../state/types";
import { SEARCH_ENGINES } from "../services/rss";
import { uiStore } from "../state/store";
import { $, svgIcon } from "../utils";

export function renderOmnibox(settings: SyncStorageSettings) {
  const container = $("#nt-omnibox") as HTMLElement | null;
  if (!container) return;

  container.innerHTML = `
    <div class="omnibox-row">
      <span class="omnibox-icon">${svgIcon("search", 16)}</span>
      <input
        class="omnibox-input"
        id="nt-search-input"
        type="text"
        placeholder="Search the web or your feed…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Search"
      />
      <kbd class="omnibox-kbd" id="nt-search-kbd">⌘K</kbd>
    </div>
    <div class="omnibox-foot" id="nt-omnibox-foot" hidden>
      <div class="pillrow" role="tablist" aria-label="Search mode">
        <button class="pill active" role="tab" data-mode="web" aria-selected="true">Web</button>
        <button class="pill" role="tab" data-mode="feed" aria-selected="false">Feed</button>
      </div>
      <span class="omnibox-engine-hint" id="nt-engine-hint">via ${settings.searchEngine}</span>
    </div>
  `;

  const input = $("#nt-search-input") as HTMLInputElement;
  const foot = $("#nt-omnibox-foot") as HTMLDivElement;
  const kbd = $("#nt-search-kbd") as HTMLElement;
  const engineHint = $("#nt-engine-hint") as HTMLElement;

  // Platform-aware shortcut label
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  kbd.textContent = isMac ? "⌘K" : "Ctrl+K";

  input.addEventListener("focus", () => {
    foot.hidden = false;
  });

  input.addEventListener("blur", () => {
    // Delay to allow clicking pills
    setTimeout(() => {
      if (!container.matches(":focus-within")) {
        foot.hidden = true;
      }
    }, 200);
  });

  container.addEventListener("click", (e) => {
    const pill = (e.target as HTMLElement).closest(".pill") as HTMLButtonElement | null;
    if (!pill) return;
    container.querySelectorAll<HTMLElement>(".pill").forEach((p) => {
      const btn = p as HTMLButtonElement;
      const active = btn === pill;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    const mode = pill.dataset.mode || "web";
    container.dataset.mode = mode;
    if (engineHint) {
      engineHint.textContent = mode === "web" ? `via ${settings.searchEngine}` : "in your feed";
    }
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const mode = container.dataset.mode || "web";
      const query = input.value.trim();
      if (!query) return;
      if (mode === "web") {
        const engine = settings.searchEngine === "custom"
          ? settings.customSearchUrl
          : SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.brave;
        const url = engine.replace("{query}", encodeURIComponent(query));
        window.open(url, settings.openLinksIn === "new_tab" ? "_blank" : "_self");
      } else {
        uiStore.set((s) => ({ ...s, searchQuery: query }));
      }
      input.blur();
      foot.hidden = true;
    }
  });
}
