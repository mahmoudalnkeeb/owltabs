import type { SyncStorageSettings } from "../state/types";

// All of these answer in the OpenSearch suggestions format: [query, [suggestion, ...]].
// The extension's host permissions let the page fetch them without CORS headers.
const SUGGEST_URLS: Partial<Record<SyncStorageSettings["searchEngine"], string>> = {
  brave: "https://search.brave.com/api/suggest?q={query}",
  google: "https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q={query}",
  ddg: "https://duckduckgo.com/ac/?type=list&q={query}",
  bing: "https://api.bing.com/osjson.aspx?query={query}",
};

const MAX_SUGGESTIONS = 5;

/** Suggestions for a query, or [] for custom engines and failed requests. */
export async function fetchSuggestions(
  engine: SyncStorageSettings["searchEngine"],
  query: string,
  signal: AbortSignal,
): Promise<string[]> {
  const template = SUGGEST_URLS[engine];
  if (!template) return [];
  try {
    const res = await fetch(template.replace("{query}", encodeURIComponent(query)), {
      signal,
      credentials: "omit",
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].filter((s): s is string => typeof s === "string").slice(0, MAX_SUGGESTIONS);
  } catch {
    // Network errors and aborts both just mean no suggestions this time.
    return [];
  }
}
