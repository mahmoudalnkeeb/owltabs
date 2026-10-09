import type { FeedItem, LocalStorageCache, SyncStorageSettings } from "../state/types";
import { AI_MODELS } from "../state/types";
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
    model: "gemini-3.1-flash-lite",
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

// chrome.storage.sync caps each item at 8KB (QUOTA_BYTES_PER_ITEM) but allows
// ~100KB total, so settings are stored as a JSON string split across chunk keys.
const SYNC_ITEM_BYTES = 8192;
const chunkKey = (i: number) => `${KEYS.SETTINGS_CHUNKS}_${i}`;
const encoder = new TextEncoder();

function itemBytes(key: string, value: string): number {
  return encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
}

function splitIntoChunks(json: string): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < json.length) {
    const key = chunkKey(chunks.length);
    let len = Math.min(json.length - pos, SYNC_ITEM_BYTES);
    while (itemBytes(key, json.slice(pos, pos + len)) > SYNC_ITEM_BYTES) {
      len = Math.floor(len * 0.8);
    }
    chunks.push(json.slice(pos, pos + len));
    pos += len;
  }
  return chunks;
}

async function readRawSettings(): Promise<Partial<SyncStorageSettings> | undefined> {
  const store = chrome.storage?.sync;
  if (!store) return undefined;
  const meta = await store.get(KEYS.SETTINGS_CHUNKS);
  const count = meta?.[KEYS.SETTINGS_CHUNKS];
  if (typeof count !== "number") {
    // Not yet written in chunked form: fall back to the legacy single item.
    const legacy = await store.get(KEYS.SETTINGS);
    return legacy?.[KEYS.SETTINGS] as Partial<SyncStorageSettings> | undefined;
  }
  const keys = Array.from({ length: count }, (_, i) => chunkKey(i));
  const parts = await store.get(keys);
  return JSON.parse(keys.map((k) => parts[k] ?? "").join("")) as Partial<SyncStorageSettings>;
}

async function writeRawSettings(settings: SyncStorageSettings): Promise<void> {
  const store = chrome.storage?.sync;
  if (!store) return;
  const chunks = splitIntoChunks(JSON.stringify(settings));
  const meta = await store.get(KEYS.SETTINGS_CHUNKS);
  const prev = meta?.[KEYS.SETTINGS_CHUNKS];
  const prevCount = typeof prev === "number" ? prev : 0;
  const items: Record<string, unknown> = { [KEYS.SETTINGS_CHUNKS]: chunks.length };
  chunks.forEach((c, i) => (items[chunkKey(i)] = c));
  await store.set(items);
  const stale: string[] = [KEYS.SETTINGS];
  for (let i = chunks.length; i < prevCount; i++) stale.push(chunkKey(i));
  await store.remove(stale);
}

// Fill in fields missing from older stored settings and drop retired models.
function withDefaults(stored: Partial<SyncStorageSettings> | undefined): SyncStorageSettings {
  const merged: SyncStorageSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    ai: { ...DEFAULT_SETTINGS.ai, ...stored?.ai },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...stored?.appearance },
  };
  if (!(AI_MODELS as readonly string[]).includes(merged.ai.model)) {
    merged.ai.model = DEFAULT_SETTINGS.ai.model;
  }
  return merged;
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
    return withDefaults(await readRawSettings());
  },
  async saveSettings(partial: Partial<SyncStorageSettings>): Promise<void> {
    const current = await this.getSettings();
    await writeRawSettings({ ...current, ...partial });
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
      // A save writes the chunk count and chunks in one set(), so one event per save.
      if (!Object.keys(changes).some((k) => k.startsWith(KEYS.SETTINGS_CHUNKS))) return;
      void storage.getSettings().then(callback);
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
