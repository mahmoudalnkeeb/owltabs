export type Listener<T> = (val: T) => void;

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set: (updater: (s: T) => T) => {
      state = updater(state);
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn: Listener<T>) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export interface UIState {
  settingsOpen: boolean;
  activeFilter: string;
  feedSearchQuery: string;
  aiActive: boolean;
  aiResponseBlocks: import("./types").AIResponseBlock[];
  aiStreaming: boolean;
}

export const feedStore = createStore<import("./types").FeedItem[]>([]);
export const uiStore = createStore<UIState>({
  settingsOpen: false,
  activeFilter: "all",
  feedSearchQuery: "",
  aiActive: false,
  aiResponseBlocks: [],
  aiStreaming: false,
});

/** IDs of articles the user has opened, persisted in chrome.storage.local. */
export const readStore = createStore<ReadonlySet<string>>(new Set());
