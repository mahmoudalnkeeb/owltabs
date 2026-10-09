import type { SyncStorageSettings } from "../state/types";
import { SEARCH_ENGINES } from "../services/rss";
import { uiStore, feedStore } from "../state/store";
import { $, svgIcon, showToast } from "../utils";
import { focusAIInput, triggerAI } from "./ai-chat";
import { clearFeedSearch } from "./feed-filterbar";

interface SearchMode {
  id: string;
  label: string;
  hint: (s: SyncStorageSettings) => string;
  onEnter: (query: string, settings: SyncStorageSettings) => void;
}

const SEARCH_MODES: SearchMode[] = [
  {
    id: "web",
    label: "Web",
    hint: (s) => `via ${s.searchEngine}`,
    onEnter: (query, settings) => {
      const engine = settings.searchEngine === "custom"
        ? settings.customSearchUrl
        : SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.brave;
      const url = engine.replace("{query}", encodeURIComponent(query));
      window.open(url, settings.openLinksIn === "new_tab" ? "_blank" : "_self");
    },
  },
  {
    id: "feed",
    label: "Feed",
    hint: () => "in your feed",
    onEnter: (query) => {
      uiStore.set((s) => ({ ...s, feedSearchQuery: query, feedPage: 0 }));
    },
  },
  {
    id: "ai",
    label: "AI",
    hint: (s) => s.ai.enabled && s.ai.geminiKey ? "ask anything" : "not configured",
    onEnter: (query, settings) => {
      if (!settings.ai.enabled || !settings.ai.geminiKey) {
        showToast("Configure AI in Settings first", "red");
        return;
      }
      if (!feedStore.get().length) {
        showToast("No feed data available for AI", "red");
        return;
      }
      uiStore.set((s) => ({
        ...s,
        aiActive: true,
      }));
      triggerAI(query);
    },
  },
];

export function renderOmnibox(settings: SyncStorageSettings) {
  const found = $("#nt-omnibox") as HTMLElement | null;
  if (!found) return;
  const container: HTMLElement = found;

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
        ${SEARCH_MODES.map((mode, i) => `
          <button class="pill ${i === 0 ? "active" : ""}" role="tab" data-mode="${mode.id}" aria-selected="${i === 0}">${mode.label}</button>
        `).join("")}
      </div>
      <span class="omnibox-engine-hint" id="nt-engine-hint">${SEARCH_MODES[0].hint(settings)}</span>
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

  function setMode(modeId: string) {
    const pills = container.querySelectorAll<HTMLButtonElement>(".pill");
    pills.forEach((p) => {
      const active = p.dataset.mode === modeId;
      p.classList.toggle("active", active);
      p.setAttribute("aria-selected", String(active));
    });
    container.dataset.mode = modeId;
    const mode = SEARCH_MODES.find((m) => m.id === modeId);
    if (mode && engineHint) {
      engineHint.textContent = mode.hint(settings);
    }
    if (modeId === "ai") {
      const { aiResponseBlocks } = uiStore.get();
      if (aiResponseBlocks.length > 0) {
        // Restore existing conversation
        uiStore.set((s) => ({ ...s, aiActive: true }));
        focusAIInput();
      }
    } else {
      // Collapse AI takeover when switching away
      uiStore.set((s) => ({ ...s, aiActive: false }));
      requestAnimationFrame(() => {
        input.focus();
      });
    }
  }

  container.addEventListener("click", (e) => {
    const pill = (e.target as HTMLElement).closest(".pill") as HTMLButtonElement | null;
    if (!pill) return;
    setMode(pill.dataset.mode || SEARCH_MODES[0].id);
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    // Shift+Tab cycles search modes while the search input is focused.
    if (e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      const currentMode = container.dataset.mode || SEARCH_MODES[0].id;
      const currentIndex = SEARCH_MODES.findIndex((m) => m.id === currentMode);
      const nextIndex = (currentIndex + 1) % SEARCH_MODES.length;
      setMode(SEARCH_MODES[nextIndex].id);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const modeId = container.dataset.mode || SEARCH_MODES[0].id;
      const query = input.value.trim();
      if (!query) {
        if (modeId === "feed") clearFeedSearch();
        return;
      }
      const mode = SEARCH_MODES.find((m) => m.id === modeId);
      if (mode) mode.onEnter(query, settings);
      input.blur();
      foot.hidden = true;
    }
  });
}
