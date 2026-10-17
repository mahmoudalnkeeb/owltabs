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

export const AI_PROVIDERS = ["gemini", "openai"] as const;
/** "openai" is any OpenAI-compatible chat completions API (Groq, OpenRouter, Mistral, Ollama…). */
export type AIProvider = (typeof AI_PROVIDERS)[number];

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
  geminiKey: string;
  model: AIModel;
  /** OpenAI-compatible base URL, e.g. https://api.groq.com/openai/v1 */
  openaiBaseUrl: string;
  /** Optional: local servers like Ollama need none. */
  openaiKey: string;
  openaiModel: string;
  systemPrompt: string;
  /** Write a short AI briefing of unread articles on the first new tab each day. */
  dailyBriefing: boolean;
}

/** Interface fonts, bundled with the extension; the stacks live in fonts.ts. */
export const FONT_FAMILIES = ["geist", "inter", "plex", "atkinson", "literata", "system"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export interface AppearanceConfig {
  showThumbnails: boolean;
  /** Re-open the page once so the search box gets focus instead of the address bar. */
  focusSearchOnOpen: boolean;
  fontScale: 0.9 | 1.0 | 1.1 | 1.2;
  fontFamily: FontFamily;
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
  /** Empty the search box after a search, URL open, or AI question. */
  clearSearchOnSubmit: boolean;
  /** Record searches and opened URLs, and offer matches from them while typing. */
  searchHistory: boolean;
  /** Offer pages from the browser's history while typing (needs the optional "history" permission). */
  browsingHistory: boolean;
  /** Ask the search engine for suggestions while typing (sends keystrokes to it). */
  searchSuggestions: boolean;
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
  type: "user" | "text" | "cards" | "streaming" | "error";
  content: string;
  cardIds?: string[];
  /** The answer's markdown, for Copy. */
  raw?: string;
}

export interface LocalStorageCache {
  fetchedAt: number;
  items: FeedItem[];
}

export interface LocalStorageData {
  feed_cache: LocalStorageCache;
  saved_articles: FeedItem[];
}
