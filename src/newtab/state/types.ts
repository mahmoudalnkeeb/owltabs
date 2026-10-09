export interface FeedConfig {
  id: string;
  url: string;
  label: string;
  category: string;
  enabled: boolean;
  /** Minutes between background refreshes; 0 = only on manual refresh. */
  refreshIntervalMins: 30 | 60 | 120 | 0;
  maxArticles?: number;
}

export interface QuickLink {
  id: string;
  url: string;
  label: string;
  faviconUrl?: string;
}

export const AI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export type AIModel = (typeof AI_MODELS)[number];

export interface AIConfig {
  enabled: boolean;
  geminiKey: string;
  model: AIModel;
  systemPrompt: string;
}

export interface AppearanceConfig {
  showThumbnails: boolean;
  /** Re-open the page once so the search box gets focus instead of the address bar. */
  focusSearchOnOpen: boolean;
  fontScale: 0.9 | 1.0 | 1.1 | 1.2;
  showClock: boolean;
  clockFormat: "12" | "24";
  showQuickLinks: boolean;
  accentColor: string;
  grayscale: boolean;
}

export interface SyncStorageSettings {
  searchEngine: "brave" | "google" | "ddg" | "bing" | "custom";
  customSearchUrl: string;
  openLinksIn: "new_tab" | "same_tab";
  openFeedLinksIn: "new_tab" | "same_tab";
  feedsConfig: FeedConfig[];
  quickLinks: QuickLink[];
  ai: AIConfig;
  appearance: AppearanceConfig;
}

export interface FeedItem {
  id: string;
  feedId: string;
  feedLabel: string;
  feedCategory: string;
  title: string;
  url: string;
  excerpt: string;
  thumbnailUrl: string;
  sourceUrl: string;
  publishedAt: string;
  saved: boolean;
  savedAt: string | null;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface AIResponseBlock {
  type: "user" | "text" | "cards" | "streaming";
  content: string;
  cardIds?: string[];
}

export interface LocalStorageCache {
  fetchedAt: number;
  items: FeedItem[];
}

export interface LocalStorageData {
  feed_cache: LocalStorageCache;
  saved_articles: FeedItem[];
}
