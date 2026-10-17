import { Readability } from "@mozilla/readability";

// Enough for a long article; keeps a request well inside model context limits.
const MAX_CHARS = 12000;
const TIMEOUT_MS = 15000;

const cache = new Map<string, ArticleText>();

export interface ArticleText {
  title: string;
  byline: string | null;
  text: string;
  truncated: boolean;
}

/** Fetches a page and extracts its readable text, like a browser's reader view. */
export async function readArticle(url: string): Promise<ArticleText> {
  const hit = cache.get(url);
  if (hit) return hit;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    credentials: "omit",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`The page returned ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml/i.test(type)) throw new Error(`Not a web page (${type.split(";")[0]})`);

  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  // Relative links and images resolve against the article, not the extension.
  const base = doc.createElement("base");
  base.href = res.url || url;
  doc.head.prepend(base);

  const parsed = new Readability(doc).parse();
  const raw = parsed?.textContent ?? doc.body?.textContent ?? "";
  const text = raw.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  if (text.length < 200) throw new Error("Couldn't find the article text on that page");

  const article: ArticleText = {
    title: parsed?.title || doc.title,
    byline: parsed?.byline ?? null,
    text: text.slice(0, MAX_CHARS),
    truncated: text.length > MAX_CHARS,
  };
  cache.set(url, article);
  return article;
}
