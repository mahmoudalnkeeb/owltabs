import { storage } from "../newtab/services/storage";
import type { FeedConfig } from "../newtab/state/types";

import { KEYS } from "../newtab/services/keys";

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
      const rawFeeds: Record<string, { url: string; xml: string; fetchedAt: number }> = {};
      for (const feed of feeds) {
        try {
          const res = await fetch(feed.url, { cache: "no-cache" });
          const xml = await res.text();
          rawFeeds[feed.id] = { url: feed.url, xml, fetchedAt: Date.now() };
        } catch (err) {
          console.error(`Failed to fetch feed ${feed.url}:`, err);
        }
      }
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
