import type { FeedConfig, FeedItem } from "../state/types";

export const SEARCH_ENGINES: Record<string, string> = {
  brave: "https://search.brave.com/search?q={query}",
  google: "https://www.google.com/search?q={query}",
  ddg: "https://duckduckgo.com/?q={query}",
  bing: "https://www.bing.com/search?q={query}",
};

import { KEYS } from "./keys";

// ------------------------------------------------------------------
// Strategy types
// ------------------------------------------------------------------

type ThumbMethod =
  | "enclosure"       // <enclosure type^="image">
  | "media-thumb"     // <media:thumbnail>
  | "media-content"   // <media:content[medium="image"]>
  | "itunes"          // <itunes:image>
  | "child-img"       // <image> child of item/entry
  | "og"              // og:image in content HTML
  | "first-img";      // first <img> in content HTML

type ContentSource = "content-encoded" | "description" | "content" | "summary";

type FeedFormat = "rss" | "atom";

interface StrategyProfile {
  name: string;
  format: FeedFormat;
  contentOrder: ContentSource[];
  thumbOrder: ThumbMethod[];
}

// ------------------------------------------------------------------
// Strategy profiles
// ------------------------------------------------------------------

const RSS_PROFILES: StrategyProfile[] = [
  {
    name: "rss-standard",
    format: "rss",
    contentOrder: ["description"],
    thumbOrder: ["og", "first-img"],
  },
  {
    name: "rss-content-encoded",
    format: "rss",
    contentOrder: ["content-encoded", "description"],
    thumbOrder: ["og", "first-img"],
  },
  {
    name: "rss-enclosure",
    format: "rss",
    contentOrder: ["content-encoded", "description"],
    thumbOrder: [
      "enclosure",
      "media-thumb",
      "media-content",
      "itunes",
      "child-img",
      "og",
      "first-img",
    ],
  },
  {
    name: "rss-media",
    format: "rss",
    contentOrder: ["content-encoded", "description"],
    thumbOrder: [
      "media-thumb",
      "media-content",
      "enclosure",
      "itunes",
      "child-img",
      "og",
      "first-img",
    ],
  },
  {
    name: "rss-description-html",
    format: "rss",
    contentOrder: ["description"],
    thumbOrder: ["first-img", "og"],
  },
];

const ATOM_PROFILES: StrategyProfile[] = [
  {
    name: "atom-standard",
    format: "atom",
    contentOrder: ["summary", "content"],
    thumbOrder: [
      "enclosure",
      "media-thumb",
      "media-content",
      "itunes",
      "og",
      "first-img",
    ],
  },
  {
    name: "atom-content",
    format: "atom",
    contentOrder: ["content", "summary"],
    thumbOrder: [
      "enclosure",
      "media-thumb",
      "media-content",
      "itunes",
      "og",
      "first-img",
    ],
  },
];

const ALL_PROFILES: StrategyProfile[] = [...RSS_PROFILES, ...ATOM_PROFILES];

function findProfile(name: string): StrategyProfile | undefined {
  return ALL_PROFILES.find((p) => p.name === name);
}

// ------------------------------------------------------------------
// Namespaced element lookup. CSS selectors like "content\\:encoded" never match
// in XML documents (selectors see the local name only), so look elements up by
// namespace URI, falling back to the literal qualified name for feeds that
// declare a nonstandard URI.
// ------------------------------------------------------------------

const NS = {
  content: "http://purl.org/rss/1.0/modules/content/",
  media: "http://search.yahoo.com/mrss/",
  itunes: "http://www.itunes.com/dtds/podcast-1.0.dtd",
} as const;

function nsAll(el: Element, prefix: keyof typeof NS, local: string): Element[] {
  const byNs = Array.from(el.getElementsByTagNameNS(NS[prefix], local));
  return byNs.length ? byNs : Array.from(el.getElementsByTagName(`${prefix}:${local}`));
}

function nsFirst(el: Element, prefix: keyof typeof NS, local: string): Element | null {
  return nsAll(el, prefix, local)[0] ?? null;
}

// Matches the qualified name exactly, so "content" won't match "media:content".
function tagFirst(el: Element, name: string): Element | null {
  return el.getElementsByTagName(name)[0] ?? null;
}

function mediaImage(el: Element): Element | null {
  return (
    nsAll(el, "media", "content").find(
      (m) =>
        m.getAttribute("medium") === "image" ||
        (m.getAttribute("type") ?? "").startsWith("image"),
    ) ?? null
  );
}

// ------------------------------------------------------------------
// Fast structural detection (no full parse)
// ------------------------------------------------------------------

function detectProfile(xml: Document, format: FeedFormat): StrategyProfile {
  if (format === "rss") return detectRSSProfile(xml);
  return detectAtomProfile(xml);
}

function detectRSSProfile(xml: Document): StrategyProfile {
  const item = xml.querySelector("item");
  if (!item) return RSS_PROFILES[0];

  const hasContentEncoded = nsFirst(item, "content", "encoded") !== null;
  const hasEnclosure = tagFirst(item, "enclosure") !== null;
  const hasMediaThumb = nsFirst(item, "media", "thumbnail") !== null;
  const hasMediaContent = nsFirst(item, "media", "content") !== null;

  if (hasContentEncoded && (hasEnclosure || hasMediaThumb || hasMediaContent))
    return RSS_PROFILES[2]; // rss-enclosure
  if (hasContentEncoded) return RSS_PROFILES[1]; // rss-content-encoded
  if (hasMediaThumb || hasMediaContent) return RSS_PROFILES[3]; // rss-media
  if (hasEnclosure) return RSS_PROFILES[2]; // rss-enclosure

  const desc = item.querySelector("description");
  const descText = desc?.textContent || "";
  if (/<img[\s>]/i.test(descText)) return RSS_PROFILES[4]; // rss-description-html

  return RSS_PROFILES[0]; // rss-standard
}

function detectAtomProfile(xml: Document): StrategyProfile {
  const entry = xml.querySelector("entry");
  if (!entry) return ATOM_PROFILES[0];

  const hasContent = tagFirst(entry, "content") !== null;
  const hasEnclosure =
    entry.querySelector('link[rel="enclosure"]') !== null;
  const hasMedia =
    nsFirst(entry, "media", "thumbnail") !== null ||
    nsFirst(entry, "media", "content") !== null;

  if (hasContent || hasEnclosure || hasMedia) return ATOM_PROFILES[1];
  return ATOM_PROFILES[0];
}

// ------------------------------------------------------------------
// Quality scoring (used for trial-all fallback)
// ------------------------------------------------------------------

function scoreItems(items: FeedItem[]): number {
  if (!items.length) return 0;
  let total = 0;
  for (const item of items) {
    total += 1;
    if (item.title) total += 2;
    if (item.url) total += 2;
    if (item.excerpt) total += 1.5;
    if (item.thumbnailUrl) total += 3;
    if (item.publishedAt && item.publishedAt !== "Invalid Date") total += 1.5;
  }
  return +(total / items.length).toFixed(2);
}

// ------------------------------------------------------------------
// Trial all strategies (for unknown feeds, first encounter)
// ------------------------------------------------------------------

function tryAllProfiles(
  xml: Document,
  feedConfig: FeedConfig,
  format: FeedFormat,
): { profile: StrategyProfile; items: FeedItem[]; score: number } {
  const profiles = format === "rss" ? RSS_PROFILES : ATOM_PROFILES;
  let best = { profile: profiles[0], items: [] as FeedItem[], score: -1 };

  for (const profile of profiles) {
    const items = format === "rss"
      ? parseRSSWithProfile(xml, feedConfig, profile)
      : parseAtomWithProfile(xml, feedConfig, profile);
    const s = scoreItems(items);
    if (s > best.score) best = { profile, items, score: s };
  }

  return best;
}

// ------------------------------------------------------------------
// Strategy cache
// ------------------------------------------------------------------

async function getCachedStrategy(
  feedId: string,
): Promise<string | null> {
  const data = await chrome.storage?.local?.get(KEYS.FEED_STRATEGIES);
  const cache: Record<string, string> = (data?.[KEYS.FEED_STRATEGIES] || {}) as Record<string, string>;
  return cache[feedId] || null;
}

async function setCachedStrategy(
  feedId: string,
  strategyName: string,
): Promise<void> {
  const data = await chrome.storage?.local?.get(KEYS.FEED_STRATEGIES);
  const cache: Record<string, string> = (data?.[KEYS.FEED_STRATEGIES] || {}) as Record<string, string>;
  cache[feedId] = strategyName;
  await chrome.storage.local.set({ [KEYS.FEED_STRATEGIES]: cache });
}

// ------------------------------------------------------------------
// Content extraction helpers
// ------------------------------------------------------------------

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function sha1Like(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

function cdata(text: string): string {
  if (text.startsWith("<![CDATA[")) return text.slice(9, -3);
  return text;
}

function resolveUrl(src: string, base: string): string {
  if (!src || src.startsWith("http:") || src.startsWith("https:")) return src;
  if (!base) return src;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

// ------------------------------------------------------------------
// Content extraction driven by profile
// ------------------------------------------------------------------

function pickContent(
  item: Element,
  order: ContentSource[],
): string {
  for (const source of order) {
    if (source === "content-encoded") {
      const el = nsFirst(item, "content", "encoded");
      const text = el?.textContent;
      if (text) return cdata(text);
    }
    if (source === "description") {
      const el = item.querySelector("description");
      const text = el?.textContent;
      if (text) return cdata(text);
    }
    if (source === "content") {
      const el = tagFirst(item, "content");
      const text = el?.textContent;
      if (text) return cdata(text);
    }
    if (source === "summary") {
      const el = item.querySelector("summary");
      const text = el?.textContent;
      if (text) return cdata(text);
    }
  }
  return "";
}

// ------------------------------------------------------------------
// Thumbnail extraction driven by profile
// ------------------------------------------------------------------

// Feeds with a missing or unparseable date get "" instead of throwing,
// so one bad item can't drop the whole feed.
function toIsoDate(raw: string): string {
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function extractFirstImg(html: string): string {
  if (!html) return "";
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function extractOgImage(html: string): string {
  if (!html) return "";
  const m =
    html.match(
      /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    ) ||
    html.match(
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i,
    );
  return m ? m[1] : "";
}

function localGet<T>(key: string, fallback: T): Promise<T> {
  const store = chrome.storage?.local;
  if (!store) return Promise.resolve(fallback);
  return store.get(key).then((r) => (r[key] === undefined ? fallback : (r[key] as T)));
}

function localSet(key: string, value: unknown): Promise<void> {
  const store = chrome.storage?.local;
  if (!store) return Promise.resolve();
  return store.set({ [key]: value });
}

async function getImageCache(): Promise<Record<string, string>> {
  return localGet(KEYS.ARTICLE_IMAGES, {});
}

const IMAGE_CACHE_MAX = 500;

// Returns the article's og:image (or first <img>), "" if the page has none,
// or null on a network error/timeout so transient failures aren't cached.
async function fetchArticleImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return "";
    const html = await res.text();
    const og = extractOgImage(html);
    if (og) return resolveUrl(og, url);
    const img = extractFirstImg(html);
    return img ? resolveUrl(img, url) : "";
  } catch {
    return null;
  }
}

/**
 * Fills thumbnails for items that have none by scraping article pages.
 * Runs after the feed is rendered. Lookups (including misses) are cached,
 * and the cache keeps only the newest IMAGE_CACHE_MAX entries.
 * Returns the updated items, or null if nothing changed.
 */
export async function fillMissingThumbnails(
  items: FeedItem[],
): Promise<FeedItem[] | null> {
  const missing = items.filter((i) => !i.thumbnailUrl && i.url);
  if (!missing.length) return null;

  const cache = await getImageCache();
  const toFetch = [...new Set(missing.map((i) => i.url))].filter(
    (url) => !(url in cache),
  );
  for (let i = 0; i < toFetch.length; i += 3) {
    const batch = toFetch.slice(i, i + 3);
    const images = await Promise.all(batch.map(fetchArticleImage));
    batch.forEach((url, j) => {
      if (images[j] !== null) cache[url] = images[j];
    });
  }
  if (toFetch.length) {
    const entries = Object.entries(cache);
    await localSet(
      KEYS.ARTICLE_IMAGES,
      Object.fromEntries(entries.slice(-IMAGE_CACHE_MAX)),
    );
  }

  // Skip images shared by several articles (usually a site logo).
  const seen = new Set<string>();
  let changed = false;
  const updated = items.map((item) => {
    if (item.thumbnailUrl || !item.url) return item;
    const img = cache[item.url];
    if (!img || seen.has(img)) return item;
    seen.add(img);
    changed = true;
    return { ...item, thumbnailUrl: img };
  });
  return changed ? updated : null;
}

function extractThumbnail(
  item: Element,
  contentHtml: string,
  link: string,
  order: ThumbMethod[],
): string {
  for (const method of order) {
    if (method === "enclosure") {
      const el = item.querySelector('enclosure[type^="image"]');
      const url = el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "media-thumb") {
      const el = nsFirst(item, "media", "thumbnail");
      const url = el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "media-content") {
      const el = mediaImage(item);
      const url = el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "itunes") {
      const el = nsFirst(item, "itunes", "image") ?? tagFirst(item, "image");
      const url =
        el?.getAttribute("href") || el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "child-img") {
      const el = item.querySelector("image");
      const url =
        el?.getAttribute("href") || el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "og") {
      const url = extractOgImage(contentHtml);
      if (url) return resolveUrl(url, link);
    }
    if (method === "first-img") {
      const url = extractFirstImg(contentHtml);
      if (url) return resolveUrl(url, link);
    }
  }
  return "";
}

function extractThumbnailAtom(
  entry: Element,
  contentHtml: string,
  link: string,
  order: ThumbMethod[],
): string {
  for (const method of order) {
    if (method === "enclosure") {
      const el = entry.querySelector(
        'link[rel="enclosure"][type^="image"]',
      );
      const url = el?.getAttribute("href");
      if (url) return resolveUrl(url, link);
    }
    if (method === "media-thumb") {
      const el = nsFirst(entry, "media", "thumbnail");
      const url = el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "media-content") {
      const el = mediaImage(entry);
      const url = el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "itunes") {
      const el = nsFirst(entry, "itunes", "image") ?? tagFirst(entry, "image");
      const url =
        el?.getAttribute("href") || el?.getAttribute("url");
      if (url) return resolveUrl(url, link);
    }
    if (method === "og") {
      const url = extractOgImage(contentHtml);
      if (url) return resolveUrl(url, link);
    }
    if (method === "first-img") {
      const url = extractFirstImg(contentHtml);
      if (url) return resolveUrl(url, link);
    }
  }
  return "";
}

// ------------------------------------------------------------------
// RSS parsing driven by profile
// ------------------------------------------------------------------

function parseRSSWithProfile(
  xml: Document,
  feedConfig: FeedConfig,
  profile: StrategyProfile,
): FeedItem[] {
  const items = xml.querySelectorAll("item");
  return Array.from(items).map((item) => {
    const title = tagFirst(item, "title")?.textContent?.trim() || "";
    const link = tagFirst(item, "link")?.textContent?.trim() || "";
    const dateRaw =
      item.querySelector("pubDate")?.textContent ||
      item.getElementsByTagName("dc:date")[0]?.textContent ||
      "";
    const contentHtml = pickContent(item, profile.contentOrder);

    let thumbnailUrl = extractThumbnail(
      item,
      contentHtml,
      link || feedConfig.url,
      profile.thumbOrder,
    );

    return {
      id: sha1Like(feedConfig.id + link),
      feedId: feedConfig.id,
      feedLabel: feedConfig.label,
      feedCategory: feedConfig.category,
      title,
      url: link,
      excerpt: stripHtml(contentHtml).slice(0, 200),
      thumbnailUrl,
      sourceUrl: feedConfig.url,
      publishedAt: toIsoDate(dateRaw),
      saved: false,
      savedAt: null,
    };
  });
}

// ------------------------------------------------------------------
// Atom parsing driven by profile
// ------------------------------------------------------------------

function parseAtomWithProfile(
  xml: Document,
  feedConfig: FeedConfig,
  profile: StrategyProfile,
): FeedItem[] {
  const entries = xml.querySelectorAll("entry");
  return Array.from(entries).map((entry) => {
    const title =
      tagFirst(entry, "title")?.textContent?.trim() || "";
    const linkEl =
      entry.querySelector('link[rel="alternate"]') ||
      entry.querySelector("link");
    const link = linkEl?.getAttribute("href") || "";
    const dateRaw =
      entry.querySelector("updated, published")?.textContent || "";
    const contentHtml = pickContent(entry, profile.contentOrder);

    let thumbnailUrl = extractThumbnailAtom(
      entry,
      contentHtml,
      link || feedConfig.url,
      profile.thumbOrder,
    );

    return {
      id: sha1Like(feedConfig.id + link),
      feedId: feedConfig.id,
      feedLabel: feedConfig.label,
      feedCategory: feedConfig.category,
      title,
      url: link,
      excerpt: stripHtml(contentHtml).slice(0, 200),
      thumbnailUrl,
      sourceUrl: feedConfig.url,
      publishedAt: toIsoDate(dateRaw),
      saved: false,
      savedAt: null,
    };
  });
}

// ------------------------------------------------------------------
// Main entry point — parse a single feed XML with strategy
// ------------------------------------------------------------------

async function parseWithStrategy(
  xml: Document,
  feedConfig: FeedConfig,
): Promise<FeedItem[]> {
  const format: FeedFormat =
    xml.querySelector("feed") !== null ? "atom" : "rss";

  // Check cache first
  const cachedName = await getCachedStrategy(feedConfig.id);
  if (cachedName) {
    const profile = findProfile(cachedName);
    if (profile && profile.format === format) {
      const items =
        format === "rss"
          ? parseRSSWithProfile(xml, feedConfig, profile)
          : parseAtomWithProfile(xml, feedConfig, profile);
      return items.slice(0, feedConfig.maxArticles ?? 20);
    }
  }

  // No cache — detect structurally (fast)
  const detected = detectProfile(xml, format);

  // Trial parse with detected profile to score
  const trialItems =
    format === "rss"
      ? parseRSSWithProfile(xml, feedConfig, detected)
      : parseAtomWithProfile(xml, feedConfig, detected);
  const trialScore = scoreItems(trialItems);

  // If score is poor, try all profiles and pick the best
  if (trialScore < 3) {
    const best = tryAllProfiles(xml, feedConfig, format);
    await setCachedStrategy(feedConfig.id, best.profile.name);
    return best.items.slice(0, feedConfig.maxArticles ?? 20);
  }

  // Detected profile is good enough
  await setCachedStrategy(feedConfig.id, detected.name);
  return trialItems.slice(0, feedConfig.maxArticles ?? 20);
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/** Asks the worker to refresh due feeds; `force` refetches every feed. */
export async function requestRefresh(force = false): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
    return false;
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "refreshFeeds",
      force,
    });
    return !!resp?.ok;
  } catch {
    return false;
  }
}

export async function newestFetchedAt(): Promise<number> {
  const raw = await chrome.storage?.local?.get(KEYS.RAW_FEEDS);
  const feeds = raw?.[KEYS.RAW_FEEDS] as
    | Record<string, { fetchedAt?: number }>
    | undefined;
  if (!feeds) return 0;
  return Math.max(
    0,
    ...Object.values(feeds).map((f) => f.fetchedAt ?? 0),
  );
}

export async function fetchFeed(
  url: string,
  feedConfig: FeedConfig,
): Promise<FeedItem[]> {
  const res = await fetch(url, { cache: "no-cache" });
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const items = await parseWithStrategy(xml, feedConfig);
  return items.slice(0, feedConfig.maxArticles ?? 20);
}

export async function parseStoredFeeds(
  feedConfigs: FeedConfig[],
): Promise<FeedItem[]> {
  const raw = await chrome.storage?.local?.get(KEYS.RAW_FEEDS);
  const rawFeeds = raw?.[KEYS.RAW_FEEDS] as
    | Record<
        string,
        { url: string; xml: string; fetchedAt: number }
      >
    | undefined;
  if (!rawFeeds) return [];

  const allItems: FeedItem[] = [];
  for (const [feedId, data] of Object.entries(rawFeeds)) {
    const feedConfig = feedConfigs.find((f) => f.id === feedId);
    if (!feedConfig?.enabled) continue;
    try {
      const xml = new DOMParser().parseFromString(data.xml, "text/xml");
      const items = await parseWithStrategy(xml, feedConfig);
      allItems.push(...items);
    } catch (err) {
      console.error(`Failed to parse feed ${feedId}:`, err);
    }
  }

  allItems.sort(
    (a, b) =>
      (new Date(b.publishedAt).getTime() || 0) -
      (new Date(a.publishedAt).getTime() || 0),
  );

  return allItems;
}

export async function saveParsedFeeds(
  items: FeedItem[],
): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.FEED_CACHE]: { fetchedAt: Date.now(), items },
  });
}

export function relativeTime(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ------------------------------------------------------------------
// Exposed for testing / debugging
// ------------------------------------------------------------------

export { scoreItems, detectProfile, ALL_PROFILES, tryAllProfiles };
