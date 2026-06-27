import { KEYS } from "./keys";
const DAY = 24 * 60 * 60 * 1000;

interface FaviconCacheEntry {
  url: string;
  ts: number;
}

interface FaviconCache {
  [domain: string]: FaviconCacheEntry | { url: "fail"; ts: number };
}

// In-memory session cache — prevents repeated reads from chrome.storage
const memoryCache = new Map<string, string | null>();
// In-flight fetches — dedup parallel requests for the same domain
const inFlight = new Map<string, Promise<string | null>>();

export function faviconUrl(domain: string): string {
  const target = `https://${domain}`;
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(target)}&size=64`;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function monogram(label: string): string {
  const ch = (label || "?").trim()[0] || "?";
  return ch.toUpperCase();
}

async function readDiskCache(): Promise<FaviconCache> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return {};
  const result = await chrome.storage.local.get(KEYS.FAVICON_CACHE);
  return (result?.[KEYS.FAVICON_CACHE] as FaviconCache) || {};
}

async function writeDiskCache(cache: FaviconCache): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const entries = Object.entries(cache);
  if (entries.length > 100) {
    const sorted = entries.sort((a, b) => {
      const aTs = (a[1] as FaviconCacheEntry).ts || 0;
      const bTs = (b[1] as FaviconCacheEntry).ts || 0;
      return aTs - bTs;
    });
    const trimmed = Object.fromEntries(sorted.slice(entries.length - 100));
    await chrome.storage.local.set({ [KEYS.FAVICON_CACHE]: trimmed });
  } else {
    await chrome.storage.local.set({ [KEYS.FAVICON_CACHE]: cache });
  }
}

function tryLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function fetchFavicon(domain: string): Promise<string | null> {
  const url = faviconUrl(domain);
  const ok = await tryLoadImage(url);
  return ok ? url : null;
}

/**
 * Resolve a single domain's favicon with full caching.
 */
async function resolveOne(domain: string): Promise<string | null> {
  if (!domain) return null;

  // 1. Memory cache
  if (memoryCache.has(domain)) {
    return memoryCache.get(domain)!;
  }

  // 2. In-flight dedup
  if (inFlight.has(domain)) {
    return inFlight.get(domain)!;
  }

  const promise = (async () => {
    // 3. Disk cache
    const disk = await readDiskCache();
    const cached = disk[domain];
    const now = Date.now();

    if (cached) {
      if (cached.url !== "fail") {
        memoryCache.set(domain, cached.url);
        return cached.url;
      }
      if (now - cached.ts < DAY) {
        memoryCache.set(domain, null);
        return null;
      }
      // Stale negative cache — retry
    }

    // 4. Fetch
    const url = await fetchFavicon(domain);
    disk[domain] = url ? { url, ts: now } : { url: "fail", ts: now };
    await writeDiskCache(disk);
    memoryCache.set(domain, url);
    return url;
  })();

  inFlight.set(domain, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(domain);
  }
}

/**
 * Batch-resolve favicons for a list of domains.
 * Reads cache once, fetches missing ones in parallel, writes cache once.
 * Returns a Map<domain, faviconUrl | null>.
 */
export async function resolveFavicons(domains: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const unique = [...new Set(domains)].filter(Boolean);

  await Promise.all(
    unique.map(async (domain) => {
      const url = await resolveOne(domain);
      results.set(domain, url);
    })
  );

  return results;
}
