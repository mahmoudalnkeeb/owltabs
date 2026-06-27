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
  aiPanelOpen: boolean;
  settingsOpen: boolean;
  activeFilter: string;
  searchQuery: string;
  feedSearchQuery: string;
  feedPage: number;
}

export const feedStore = createStore<import("./types").FeedItem[]>([]);
export const uiStore = createStore<UIState>({
  aiPanelOpen: false,
  settingsOpen: false,
  activeFilter: "all",
  searchQuery: "",
  feedSearchQuery: "",
  feedPage: 0,
});
