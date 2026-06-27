import type { FeedItem, LocalStorageCache, SyncStorageSettings } from "../state/types";
import { KEYS } from "./keys";

export const DEFAULT_SETTINGS: SyncStorageSettings = {
  searchEngine: "brave",
  customSearchUrl: "",
  openLinksIn: "new_tab",
  openFeedLinksIn: "new_tab",
  feedsConfig: [],
  quickLinks: [
    { id: "ql-01", url: "https://github.com", label: "GitHub" },
    { id: "ql-02", url: "https://mail.google.com", label: "Gmail" },
    { id: "ql-03", url: "https://calendar.google.com", label: "Calendar" },
  ],
  ai: {
    enabled: false,
    geminiKey: "",
    model: "gemini-2.0-flash-lite",
    systemPrompt: "",
  },
  appearance: {
    feedColumns: 3,
    fontScale: 1.0,
    showClock: true,
    clockFormat: "12",
    showQuickLinks: true,
    accentColor: "#FFC799",
    grayscale: false,
  },
};

async function syncGet<T>(key: string, fallback: T): Promise<T> {
  const store = chrome.storage?.sync;
  if (!store) return fallback;
  const result = await store.get(key);
  const value = result?.[key];
  return value === undefined ? fallback : (value as T);
}

async function syncSet(key: string, value: unknown): Promise<void> {
  const store = chrome.storage?.sync;
  if (!store) return;
  await store.set({ [key]: value });
}

async function localGet<T>(key: string, fallback: T): Promise<T> {
  const store = chrome.storage?.local;
  if (!store) return fallback;
  const result = await store.get(key);
  const value = result?.[key];
  return value === undefined ? fallback : (value as T);
}

async function localSet(key: string, value: unknown): Promise<void> {
  const store = chrome.storage?.local;
  if (!store) return;
  await store.set({ [key]: value });
}

export const storage = {
  async getSettings(): Promise<SyncStorageSettings> {
    return syncGet(KEYS.SETTINGS, DEFAULT_SETTINGS);
  },
  async saveSettings(partial: Partial<SyncStorageSettings>): Promise<void> {
    const current = await this.getSettings();
    await syncSet(KEYS.SETTINGS, { ...current, ...partial });
  },
  async getFeedCache(): Promise<LocalStorageCache | null> {
    return localGet<LocalStorageCache | null>(KEYS.FEED_CACHE, null);
  },
  async saveFeedCache(cache: LocalStorageCache): Promise<void> {
    await localSet(KEYS.FEED_CACHE, cache);
  },
  async getSavedArticles(): Promise<FeedItem[]> {
    return localGet<FeedItem[]>(KEYS.SAVED_ARTICLES, []);
  },
  async saveArticle(item: FeedItem): Promise<void> {
    const saved = await this.getSavedArticles();
    if (saved.some((s) => s.id === item.id)) return;
    saved.unshift({ ...item, saved: true, savedAt: new Date().toISOString() });
    await localSet(KEYS.SAVED_ARTICLES, saved);
  },
  async unsaveArticle(id: string): Promise<void> {
    const saved = await this.getSavedArticles();
    await localSet(KEYS.SAVED_ARTICLES, saved.filter((s) => s.id !== id));
  },
  onSettingsChange(callback: (settings: SyncStorageSettings) => void): () => void {
    if (!chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "sync") return;
      if (!Object.prototype.hasOwnProperty.call(changes, KEYS.SETTINGS)) return;
      callback(changes[KEYS.SETTINGS].newValue as SyncStorageSettings);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
  onFeedCacheChange(callback: (cache: LocalStorageCache | null) => void): () => void {
    if (!chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return;
      if (!Object.prototype.hasOwnProperty.call(changes, KEYS.FEED_CACHE)) return;
      callback(changes[KEYS.FEED_CACHE].newValue as LocalStorageCache | null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
};
