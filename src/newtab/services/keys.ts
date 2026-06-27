/**
 * Centralized storage key registry.
 *
 * To rename the app: change APP_PREFIX, then run migration (migrate.ts)
 * which handles renaming old keys in chrome.storage for existing users.
 */
const APP_PREFIX = "owltabs";

export const KEYS = {
  SETTINGS:        `${APP_PREFIX}_settings_v2`,
  FEED_CACHE:      `${APP_PREFIX}_feed_cache_v2`,
  SAVED_ARTICLES:  `${APP_PREFIX}_saved_articles_v2`,
  RAW_FEEDS:       `${APP_PREFIX}_raw_feeds_v2`,
  FEED_STRATEGIES: `${APP_PREFIX}_feed_strategies_v2`,
  ARTICLE_IMAGES:  `${APP_PREFIX}_article_images_v2`,
  FAVICON_CACHE:   `${APP_PREFIX}_favicon_cache_v2`,
  MIGRATED:        `${APP_PREFIX}_migrated_v1`,
} as const;
