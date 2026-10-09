import { readStore } from "../state/store";
import { KEYS } from "./keys";

// Oldest IDs are dropped past this, so the list can't grow without bound.
const MAX_READ_IDS = 3000;

export async function loadReadState(): Promise<void> {
  const store = chrome.storage?.local;
  if (!store) return;
  const result = await store.get(KEYS.READ_ARTICLES);
  const ids = result?.[KEYS.READ_ARTICLES];
  if (Array.isArray(ids)) readStore.set(() => new Set(ids.filter((id) => typeof id === "string")));
}

export async function markRead(ids: readonly string[]): Promise<void> {
  const current = readStore.get();
  const fresh = ids.filter((id) => !current.has(id));
  if (!fresh.length) return;
  const next = [...current, ...fresh].slice(-MAX_READ_IDS);
  readStore.set(() => new Set(next));
  await chrome.storage?.local?.set({ [KEYS.READ_ARTICLES]: next });
}

export async function markUnread(id: string): Promise<void> {
  const current = readStore.get();
  if (!current.has(id)) return;
  const next = [...current].filter((i) => i !== id);
  readStore.set(() => new Set(next));
  await chrome.storage?.local?.set({ [KEYS.READ_ARTICLES]: next });
}
