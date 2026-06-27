export interface FeedConfig {
  id: string;
  url: string;
  label: string;
  category: string;
  enabled: boolean;
  refreshIntervalMins: 30 | 60 | 120 | 0;
}

export interface QuickLink {
  id: string;
  url: string;
  label: string;
  faviconUrl?: string;
}

export interface AIConfig {
  enabled: boolean;
  geminiKey: string;
  model: "gemini-2.5-flash-lite" | "gemini-2.0-flash-lite" | "gemini-2.0-flash" | "gemini-1.5-pro";
  systemPrompt: string;
}

export interface AppearanceConfig {
  feedColumns: 2 | 3 | 4;
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

export interface LocalStorageCache {
  fetchedAt: number;
  items: FeedItem[];
}

export interface LocalStorageData {
  feed_cache: LocalStorageCache;
  saved_articles: FeedItem[];
}
