import type { FeedConfig } from "../state/types";
import { storage } from "./storage";

/**
 * Feed list changes for the assistant. Saving settings is enough: main.ts
 * refetches, re-parses, and re-renders whenever feedsConfig changes.
 */

const TIMEOUT_MS = 12000;
// Where sites commonly publish their feed when the page doesn't link it.
const COMMON_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml", "/feed/"];

export interface DiscoveredFeed {
  url: string;
  title: string;
  itemCount: number;
}

function parseFeed(text: string): { title: string; itemCount: number } | null {
  const xml = new DOMParser().parseFromString(text, "text/xml");
  if (xml.querySelector("parsererror")) return null;
  const root = xml.documentElement?.localName;
  if (root !== "rss" && root !== "feed" && root !== "RDF") return null;
  const title =
    xml.querySelector("channel > title")?.textContent?.trim() ||
    xml.querySelector("feed > title")?.textContent?.trim() ||
    "";
  return { title, itemCount: xml.querySelectorAll("item, entry").length };
}

async function get(url: string): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: "omit" });
    if (!res.ok) return null;
    return { text: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/** Finds the RSS/Atom feed for a feed URL or a regular site URL. */
export async function discoverFeed(input: string): Promise<DiscoveredFeed> {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`"${input}" isn't a valid URL`);
  }

  const page = await get(parsedUrl.href);
  if (!page) throw new Error(`Couldn't load ${parsedUrl.href}`);

  // Already a feed.
  const direct = parseFeed(page.text);
  if (direct) return { url: page.finalUrl, ...direct };

  // A web page: follow the feeds it advertises, then try the usual paths.
  const doc = new DOMParser().parseFromString(page.text, "text/html");
  const advertised = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"]')]
    .filter((l) => /rss|atom|feed\+json|xml/i.test(l.getAttribute("type") ?? ""))
    .map((l) => new URL(l.getAttribute("href") ?? "", page.finalUrl).href);
  const origin = new URL(page.finalUrl).origin;
  const candidates = [...new Set([...advertised, ...COMMON_PATHS.map((p) => origin + p)])];

  for (const candidate of candidates) {
    const res = await get(candidate);
    const feed = res && parseFeed(res.text);
    if (feed) return { url: res.finalUrl, ...feed };
  }
  throw new Error(`No RSS or Atom feed found on ${parsedUrl.hostname}`);
}

export async function getFeeds(): Promise<FeedConfig[]> {
  return (await storage.getSettings()).feedsConfig;
}

export async function setFeeds(feedsConfig: FeedConfig[]): Promise<void> {
  await storage.saveSettings({ feedsConfig });
}

/** Finds a feed by id, name, or URL; names match loosely ("hacker news" → "Hacker News"). */
export function findFeed(feeds: FeedConfig[], ref: string): FeedConfig | undefined {
  const needle = ref.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    feeds.find((f) => f.id === ref.trim() || f.label.toLowerCase() === needle || f.url.toLowerCase() === needle) ??
    feeds.find((f) => f.label.toLowerCase().includes(needle) || f.url.toLowerCase().includes(needle))
  );
}

export const REFRESH_OPTIONS = [0, 30, 60, 120] as const;
