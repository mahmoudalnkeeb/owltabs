import { KEYS } from "./keys";

/**
 * One-time migration: renames legacy "vesper_*" storage keys to current keys.
 * Runs on install/startup. Uses a flag key so it only executes once.
 */
export async function migrateIfNeeded(): Promise<void> {
  try {
    const flagResult = await chrome.storage.local.get(KEYS.MIGRATED);
    if (flagResult[KEYS.MIGRATED]) return;

    const LEGACY_MAP: Record<string, string> = {
      vesper_settings_v2:        KEYS.SETTINGS,
      vesper_feed_cache_v2:      KEYS.FEED_CACHE,
      vesper_saved_articles_v2:  KEYS.SAVED_ARTICLES,
      vesper_raw_feeds_v2:       KEYS.RAW_FEEDS,
      vesper_feed_strategies_v2: KEYS.FEED_STRATEGIES,
      vesper_article_images_v2:  KEYS.ARTICLE_IMAGES,
      vesper_favicon_cache_v2:   KEYS.FAVICON_CACHE,
    };

    // Migrate sync storage (settings)
    const syncOldKeys = ["vesper_settings_v2"];
    const syncData = await chrome.storage.sync.get(syncOldKeys);
    const syncUpdates: Record<string, unknown> = {};
    for (const oldKey of syncOldKeys) {
      if (syncData[oldKey] !== undefined) {
        syncUpdates[LEGACY_MAP[oldKey]] = syncData[oldKey];
      }
    }
    if (Object.keys(syncUpdates).length) {
      await chrome.storage.sync.set(syncUpdates);
      await chrome.storage.sync.remove(syncOldKeys);
    }

    // Migrate local storage (everything else)
    const localOldKeys = [
      "vesper_feed_cache_v2",
      "vesper_saved_articles_v2",
      "vesper_raw_feeds_v2",
      "vesper_feed_strategies_v2",
      "vesper_article_images_v2",
      "vesper_favicon_cache_v2",
    ];
    const localData = await chrome.storage.local.get(localOldKeys);
    const localUpdates: Record<string, unknown> = {};
    for (const oldKey of localOldKeys) {
      if (localData[oldKey] !== undefined) {
        localUpdates[LEGACY_MAP[oldKey]] = localData[oldKey];
      }
    }
    if (Object.keys(localUpdates).length) {
      await chrome.storage.local.set(localUpdates);
      await chrome.storage.local.remove(localOldKeys);
    }

    // Mark migration complete
    await chrome.storage.local.set({ [KEYS.MIGRATED]: true });
  } catch (err) {
    console.error("OwlTabs migration failed:", err);
  }
}
