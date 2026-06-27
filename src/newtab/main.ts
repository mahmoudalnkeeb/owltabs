import type { FeedItem } from "./state/types";
import { initKeyboard } from "./keyboard";
import { renderTopbar } from "./components/topbar";
import { renderOmnibox } from "./components/omnibox";
import { renderQuickLinks } from "./components/quick-links";
import { renderFeedGrid, setFeedSettings } from "./components/feed-grid";
import { renderFeedFilterbar } from "./components/feed-filterbar";
import { renderAIPanel } from "./components/ai-panel";
import { renderSettingsDrawer } from "./components/settings-drawer";
import { storage } from "./services/storage";
import { feedStore, uiStore } from "./state/store";
import {
  requestRefresh,
  newestFetchedAt,
  parseStoredFeeds,
  saveParsedFeeds,
} from "./services/rss";

import "./styles/tokens.css";
import "./styles/newtab-tokens.css";
import "./styles/ambient.css";
import "./styles/layout.css";
import "./styles/components/topbar.css";
import "./styles/components/omnibox.css";
import "./styles/components/quick-links.css";
import "./styles/components/feed-card.css";
import "./styles/components/feed-filterbar.css";
import "./styles/components/ai-panel.css";
import "./styles/components/settings-drawer.css";

const FEED_STALE_MS = 5 * 60 * 1000;
import { KEYS } from "./services/keys";
import { migrateIfNeeded } from "./services/migrate";

function applyAppearance(settings: Awaited<ReturnType<typeof storage.getSettings>>) {
  const { appearance } = settings;
  document.documentElement.style.setProperty("--feed-cols", String(appearance.feedColumns));
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

async function loadAndParseFeeds(settings: Awaited<ReturnType<typeof storage.getSettings>>) {
  const items = await parseStoredFeeds(settings.feedsConfig);
  if (items.length) {
    await saveParsedFeeds(items);
    const merged = await mergeSavedStatus(items);
    feedStore.set(() => merged);
  } else {
    // No feeds configured or no raw data yet — clear the store
    feedStore.set(() => []);
  }
}

async function cleanupRawFeeds(feedConfigs: import("./state/types").FeedConfig[]) {
  const raw = await chrome.storage?.local?.get(KEYS.RAW_FEEDS);
  const rawFeeds = raw?.[KEYS.RAW_FEEDS] as Record<string, unknown> | undefined;
  if (!rawFeeds) return;
  const activeIds = new Set(feedConfigs.map((f) => f.id));
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
}

async function init() {
  try {
    await migrateIfNeeded();
    let settings = await storage.getSettings();
    applyAppearance(settings);

    renderTopbar(settings);
    renderOmnibox(settings);
    renderQuickLinks(settings);
    renderFeedFilterbar(settings);
    setFeedSettings(settings);
    renderFeedGrid();
    renderAIPanel(settings);
    renderSettingsDrawer(settings);

    initKeyboard({
      escape: () => {
        if (uiStore.get().aiPanelOpen) {
          uiStore.set((s) => ({ ...s, aiPanelOpen: false }));
          return;
        }
        if (uiStore.get().settingsOpen) {
          uiStore.set((s) => ({ ...s, settingsOpen: false }));
          return;
        }
        const feedSearch = document.getElementById("nt-feed-search-input") as HTMLInputElement | null;
        if (feedSearch && !feedSearch.hidden) {
          feedSearch.value = "";
          feedSearch.hidden = true;
          uiStore.set((s) => ({ ...s, feedSearchQuery: "", feedPage: 0 }));
          return;
        }
        const searchInput = document.getElementById("nt-search-input") as HTMLInputElement | null;
        if (searchInput && document.activeElement === searchInput) {
          searchInput.blur();
          searchInput.value = "";
          return;
        }
      },
      focusSearch: () => {
        const input = document.getElementById("nt-search-input") as HTMLInputElement | null;
        input?.focus();
      },
      focusFeedSearch: () => {
        const feedSearch = document.getElementById("nt-feed-search-input") as HTMLInputElement | null;
        if (feedSearch) {
          feedSearch.hidden = false;
          feedSearch.focus();
        }
      },
      toggleSettings: () => {
        uiStore.set((s) => ({ ...s, settingsOpen: !s.settingsOpen }));
      },
      toggleAI: () => {
        if (!settings.ai.enabled || !settings.ai.geminiKey) return;
        uiStore.set((s) => ({ ...s, aiPanelOpen: !s.aiPanelOpen }));
      },
      activateQuickLink: (index: number) => {
        const links = document.querySelectorAll<HTMLAnchorElement>(".ql-tile[href]");
        links[index]?.click();
      },
    });

    // Backdrop click to close
    document.getElementById("nt-backdrop")?.addEventListener("click", () => {
      uiStore.set((s) => ({ ...s, aiPanelOpen: false, settingsOpen: false }));
    });

    // Spotlight — dim page when omnibox is focused
    const searchInput = document.getElementById("nt-search-input") as HTMLInputElement | null;
    const mainEl = document.querySelector<HTMLElement>(".nt-main");
    searchInput?.addEventListener("focus", () => mainEl?.classList.add("is-spotlight"));
    searchInput?.addEventListener("blur", () => mainEl?.classList.remove("is-spotlight"));

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
      settings = newSettings;
      applyAppearance(settings);
      renderTopbar(settings);
      renderOmnibox(settings);
      renderQuickLinks(settings);
      renderFeedFilterbar(settings);
      setFeedSettings(settings);
      renderAIPanel(settings);
      renderSettingsDrawer(settings);

      // Re-parse with new feed config — drops removed feeds immediately
      await loadAndParseFeeds(settings);

      // Clean up raw XML cache for removed feeds
      await cleanupRawFeeds(settings.feedsConfig);

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
