import { KEYS } from "./keys";

export interface HistoryEntry {
  kind: "search" | "url";
  text: string;
  at: number;
}

// Oldest entries are dropped past this, so the list can't grow without bound.
const MAX_HISTORY = 200;

function isEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (e.kind === "search" || e.kind === "url") && typeof e.text === "string" && typeof e.at === "number";
}

/** Newest first. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const store = chrome.storage?.local;
  if (!store) return [];
  const result = await store.get(KEYS.SEARCH_HISTORY);
  const list: unknown = result?.[KEYS.SEARCH_HISTORY];
  return Array.isArray(list) ? list.filter(isEntry) : [];
}

/** Moves a repeat to the front instead of storing it twice. */
export async function addHistory(kind: HistoryEntry["kind"], text: string): Promise<void> {
  const store = chrome.storage?.local;
  if (!store) return;
  const current = await loadHistory();
  const key = text.toLowerCase();
  const next = [
    { kind, text, at: Date.now() },
    ...current.filter((e) => e.kind !== kind || e.text.toLowerCase() !== key),
  ].slice(0, MAX_HISTORY);
  await store.set({ [KEYS.SEARCH_HISTORY]: next });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage?.local?.remove(KEYS.SEARCH_HISTORY);
}
