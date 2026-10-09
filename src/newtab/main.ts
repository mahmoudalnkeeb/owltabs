import type { FeedItem } from "./state/types";
import { initKeyboard } from "./keyboard";
import { renderTopbar } from "./components/topbar";
import { renderOmnibox } from "./components/omnibox";
import { renderQuickLinks } from "./components/quick-links";
import { renderFeedList, setFeedSettings, moveSelection, actOnSelection } from "./components/feed-list";
import { renderFeedSidebar, clearFeedSearch } from "./components/feed-sidebar";
import { loadReadState } from "./services/read";
import { shortcutsOpen, toggleShortcuts } from "./components/shortcuts";
import { setAISettings, initAIChat, toggleAIChat } from "./components/ai-chat";
import { renderSettingsDrawer } from "./components/settings-drawer";
import { storage } from "./services/storage";
import { feedStore, uiStore } from "./state/store";
import {
  requestRefresh,
  newestFetchedAt,
  parseStoredFeeds,
  saveParsedFeeds,
  fillMissingThumbnails,
} from "./services/rss";

import "./styles/tokens.css";
import "./styles/newtab-tokens.css";
import "./styles/ambient.css";
import "./styles/layout.css";
import "./styles/components/topbar.css";
import "./styles/components/omnibox.css";
import "./styles/components/quick-links.css";
import "./styles/components/feed-list.css";
import "./styles/components/feed-sidebar.css";
import "./styles/components/shortcuts.css";
import "./styles/components/ai-chat.css";
import "./styles/components/settings-drawer.css";

const FEED_STALE_MS = 5 * 60 * 1000;
import { KEYS } from "./services/keys";
import { migrateIfNeeded } from "./services/migrate";
import { showToast } from "./utils";

// Settings writes can fail (e.g. chrome.storage.sync quota). Callers don't catch,
// so surface those failures here instead of dropping them silently.
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  if (/quota/i.test(msg)) showToast("Couldn't save settings: storage limit reached", "red");
});

function applyAppearance(settings: Awaited<ReturnType<typeof storage.getSettings>>) {
  const { appearance } = settings;
  document.documentElement.style.setProperty("font-size", `${appearance.fontScale * 100}%`);
  if (appearance.accentColor) {
    document.documentElement.style.setProperty("--accent", appearance.accentColor);
  }
  document.body.classList.toggle("grayscale", !!appearance.grayscale);
}

async function mergeSavedStatus(items: FeedItem[]) {
  const saved = await storage.getSavedArticles();
  const savedIds = new Set(saved.map((s) => s.id));
  return items.map((item) => ({
    ...item,
    saved: savedIds.has(item.id),
  }));
}

let parseSeq = 0;

async function loadAndParseFeeds(settings: Awaited<ReturnType<typeof storage.getSettings>>) {
  const seq = ++parseSeq;
  const items = await parseStoredFeeds(settings.feedsConfig);
  if (seq !== parseSeq) return;
  if (items.length) {
    await saveParsedFeeds(items);
    const merged = await mergeSavedStatus(items);
    feedStore.set(() => merged);

    // Scrape missing thumbnails after rendering instead of blocking on it.
    void fillMissingThumbnails(items)
      .then(async (filled) => {
        if (!filled || seq !== parseSeq) return;
        await saveParsedFeeds(filled);
        const withSaved = await mergeSavedStatus(filled);
        if (seq === parseSeq) feedStore.set(() => withSaved);
      })
      .catch((err) => console.error("Thumbnail fill failed:", err));
  } else {
    // No feeds configured or no raw data yet — clear the store
    feedStore.set(() => []);
  }
}

async function cleanupRawFeeds(feedConfigs: import("./state/types").FeedConfig[]): Promise<boolean> {
  const raw = await chrome.storage?.local?.get(KEYS.RAW_FEEDS);
  const rawFeeds = raw?.[KEYS.RAW_FEEDS] as Record<string, unknown> | undefined;
  if (!rawFeeds) return false;
  const activeIds = new Set(feedConfigs.filter((f) => f.enabled).map((f) => f.id));
  let changed = false;
  for (const id of Object.keys(rawFeeds)) {
    if (!activeIds.has(id)) {
      delete rawFeeds[id];
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ [KEYS.RAW_FEEDS]: rawFeeds });
  }
  return changed;
}

async function init() {
  try {
    await migrateIfNeeded();
    let settings = await storage.getSettings();

    // Chrome gives the address bar focus on new-tab override pages, and the
    // page can't take it back. A page-initiated navigation to the same page
    // makes it an ordinary tab, so the search box can be focused.
    const focusRequested = new URLSearchParams(location.search).has("focus");
    if (settings.appearance.focusSearchOnOpen && !focusRequested && chrome.runtime?.id) {
      location.replace(`${location.pathname}?focus`);
      return;
    }
    applyAppearance(settings);

    await loadReadState();

    renderTopbar(settings);
    renderOmnibox(settings);
    renderQuickLinks(settings);
    renderFeedSidebar(settings);
    setFeedSettings(settings);
    renderFeedList();
    setAISettings(settings);
    renderSettingsDrawer(settings);

    const topbar = document.getElementById("nt-topbar");
    const markScrolled = () => topbar?.classList.toggle("is-scrolled", window.scrollY > 4);
    window.addEventListener("scroll", markScrolled, { passive: true });
    markScrolled();

    // AI chat is a side panel; on wide screens the page makes room for it.
    const aiChat = document.getElementById("nt-ai-chat");
    if (aiChat) {
      initAIChat(aiChat);
      uiStore.subscribe(({ aiActive }) => {
        document.body.classList.toggle("ai-open", aiActive);
        document.getElementById("nt-ai-btn")?.setAttribute("aria-pressed", String(aiActive));
      });
    }

    initKeyboard({
      escape: () => {
        // The shortcuts dialog closes itself on Esc; don't also close panels behind it.
        if (shortcutsOpen()) return;
        if (uiStore.get().settingsOpen) {
          uiStore.set((s) => ({ ...s, settingsOpen: false }));
          return;
        }
        if (uiStore.get().aiActive) {
          uiStore.set((s) => ({ ...s, aiActive: false }));
          return;
        }
        clearFeedSearch();
      },
      moveSelection,
      rowAction: actOnSelection,
      toggleShortcuts,
      focusSearch: () => {
        const input = document.getElementById("nt-search-input") as HTMLInputElement | null;
        input?.focus();
      },
      toggleSettings: () => {
        uiStore.set((s) => ({ ...s, settingsOpen: !s.settingsOpen }));
      },
      toggleAI: () => {
        if (!settings.ai.enabled || !settings.ai.geminiKey) return;
        toggleAIChat();
      },
      isPanelOpen: () => uiStore.get().settingsOpen || shortcutsOpen(),
      activateQuickLink: (index: number) => {
        const links = document.querySelectorAll<HTMLAnchorElement>(".ql-tile[href]");
        links[index]?.click();
      },
    });

    // Backdrop click to close
    document.getElementById("nt-backdrop")?.addEventListener("click", () => {
      uiStore.set((s) => ({ ...s, settingsOpen: false }));
    });

    document.getElementById("nt-search-input")?.focus();

    // Load cached feed immediately (for instant render)
    const cache = await storage.getFeedCache();
    if (cache?.items) {
      const merged = await mergeSavedStatus(cache.items);
      feedStore.set(() => merged);
    }

    // Parse raw feeds from background (may be newer than cache)
    await loadAndParseFeeds(settings);

    // Background refresh if stale
    newestFetchedAt().then((newest) => {
      if (Date.now() - newest > FEED_STALE_MS) {
        requestRefresh().catch(() => {});
      }
    });

    // Listen for raw feed updates from background
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!Object.prototype.hasOwnProperty.call(changes, KEYS.RAW_FEEDS)) return;
        loadAndParseFeeds(settings);
      });
    }

    // Listen for settings changes and re-render affected components
    storage.onSettingsChange(async (newSettings) => {
      const feedsChanged =
        JSON.stringify(newSettings.feedsConfig) !== JSON.stringify(settings.feedsConfig);
      settings = newSettings;
      applyAppearance(settings);
      renderTopbar(settings);
      renderOmnibox(settings);
      renderQuickLinks(settings);
      renderFeedSidebar(settings);
      setFeedSettings(settings);
      setAISettings(settings);
      renderSettingsDrawer(settings);

      // Clock, accent, etc. don't touch feeds: skip the re-parse and refetch.
      if (!feedsChanged) return;

      // Drop raw XML for removed feeds. That write fires the RAW_FEEDS listener,
      // which re-parses, so only parse here when nothing was removed.
      const removed = await cleanupRawFeeds(settings.feedsConfig);
      if (!removed) await loadAndParseFeeds(settings);

      // Trigger background refresh so newly-added feeds are fetched
      requestRefresh().catch(() => {});
    });
  } catch (err) {
    console.error("Failed to initialize OwlTabs:", err);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#a0a0a0;font-family:system-ui;font-size:14px;">Something went wrong. Please try reloading.</div>';
  }
}

init();
