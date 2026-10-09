import { storage } from "../newtab/services/storage";
import type { FeedConfig } from "../newtab/state/types";

import { KEYS } from "../newtab/services/keys";

interface RawFeed {
  url: string;
  xml: string;
  fetchedAt: number;
}

const FETCH_TIMEOUT_MS = 15_000;

let refreshInFlight: Promise<unknown> | null = null;

async function getFeedsFromSettings(): Promise<FeedConfig[]> {
  const settings = await storage.getSettings();
  return settings.feedsConfig.filter((f) => f.enabled);
}

async function refreshAllFeeds() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const feeds = await getFeedsFromSettings();
      const stored = await chrome.storage.local.get(KEYS.RAW_FEEDS);
      const previous = (stored[KEYS.RAW_FEEDS] ?? {}) as Record<string, RawFeed>;
      const rawFeeds: Record<string, RawFeed> = {};
      await Promise.all(
        feeds.map(async (feed) => {
          try {
            const res = await fetch(feed.url, {
              cache: "no-cache",
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            rawFeeds[feed.id] = { url: feed.url, xml, fetchedAt: Date.now() };
          } catch (err) {
            console.error(`Failed to fetch feed ${feed.url}:`, err);
            // Keep the last good copy so a transient failure doesn't empty the feed.
            const prev = previous[feed.id];
            if (prev && prev.url === feed.url) rawFeeds[feed.id] = prev;
          }
        }),
      );
      await chrome.storage.local.set({ [KEYS.RAW_FEEDS]: rawFeeds });
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

chrome.runtime.onInstalled.addListener(async () => {
  await refreshAllFeeds();
});

chrome.runtime.onStartup.addListener(() => {
  refreshAllFeeds();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse): boolean => {
  if (msg.type === "refreshFeeds") {
    refreshAllFeeds()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

chrome.alarms.create("refreshFeeds", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshFeeds") refreshAllFeeds();
});
