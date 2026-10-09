import { storage } from "../newtab/services/storage";
import type { FeedConfig } from "../newtab/state/types";

import { KEYS } from "../newtab/services/keys";

interface RawFeed {
  url: string;
  xml: string;
  fetchedAt: number;
}

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_MINS = 30;
// The alarm fires every 30 min, a little after the last fetch; allow for that drift.
const DUE_SLACK_MS = 60_000;

// A feed is due if it has never been fetched (or its URL changed), or its
// refresh interval has elapsed. Interval 0 means manual refresh only.
function isDue(feed: FeedConfig, prev: RawFeed | undefined, now: number): boolean {
  if (!prev || prev.url !== feed.url) return true;
  const mins = feed.refreshIntervalMins ?? DEFAULT_INTERVAL_MINS;
  if (mins === 0) return false;
  return now - prev.fetchedAt >= mins * 60_000 - DUE_SLACK_MS;
}

let refreshInFlight: Promise<unknown> | null = null;

async function getFeedsFromSettings(): Promise<FeedConfig[]> {
  const settings = await storage.getSettings();
  return settings.feedsConfig.filter((f) => f.enabled);
}

async function refreshAllFeeds(force = false) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const feeds = await getFeedsFromSettings();
      const stored = await chrome.storage.local.get(KEYS.RAW_FEEDS);
      const previous = (stored[KEYS.RAW_FEEDS] ?? {}) as Record<string, RawFeed>;
      const rawFeeds: Record<string, RawFeed> = {};
      const now = Date.now();
      await Promise.all(
        feeds.map(async (feed) => {
          const prev = previous[feed.id];
          if (!force && !isDue(feed, prev, now)) {
            rawFeeds[feed.id] = prev;
            return;
          }
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
    refreshAllFeeds(msg.force === true)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

// Top-level code runs on every service-worker wake; recreating the alarm
// would restart its 30-minute timer each time, so only create it if missing.
void chrome.alarms.get("refreshFeeds").then((alarm) => {
  if (!alarm) chrome.alarms.create("refreshFeeds", { periodInMinutes: 30 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshFeeds") refreshAllFeeds();
});
