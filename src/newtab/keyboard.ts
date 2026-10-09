import type { RowAction } from "./components/feed-list";

const ROW_KEYS: Record<string, RowAction> = {
  o: "open",
  Enter: "open",
  s: "save",
  a: "ask",
  m: "toggle-read",
};

export interface KeyboardHandlers {
  escape: () => void;
  focusSearch: () => void;
  toggleSettings: () => void;
  toggleAI: () => void;
  activateQuickLink: (index: number) => void;
  moveSelection: (delta: 1 | -1, opts?: { searchAtTop?: boolean }) => void;
  toggleShortcuts: () => void;
  rowAction: (action: RowAction) => void;
  // True while the settings drawer or AI chat covers the page.
  isPanelOpen: () => boolean;
}

export function initKeyboard(handlers: KeyboardHandlers) {
  document.addEventListener("keydown", (e) => {
    const inInput = document.activeElement?.matches(
      "input, textarea, select, [contenteditable]"
    );

    if (e.key === "Escape") {
      handlers.escape();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      handlers.focusSearch();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      handlers.toggleSettings();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      handlers.toggleAI();
      return;
    }
    // Space is left alone so it can scroll the page and press focused buttons.
    if (!inInput && !handlers.isPanelOpen() && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "/") {
        e.preventDefault();
        handlers.focusSearch();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        handlers.toggleShortcuts();
        return;
      }
      // Arrow keys browse once focus is in the article list (↓ from search puts it there);
      // elsewhere they keep scrolling the page.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey &&
          document.activeElement?.closest("#nt-feed-list")) {
        e.preventDefault();
        handlers.moveSelection(e.key === "ArrowDown" ? 1 : -1, { searchAtTop: true });
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        handlers.moveSelection(1);
        return;
      }
      if (e.key === "k") {
        e.preventDefault();
        handlers.moveSelection(-1);
        return;
      }
      // Enter on a focused button or link keeps its native meaning.
      const onControl = document.activeElement?.matches("button, a, [role=button]");
      if (e.key in ROW_KEYS && !(e.key === "Enter" && onControl)) {
        e.preventDefault();
        handlers.rowAction(ROW_KEYS[e.key]);
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        handlers.activateQuickLink(parseInt(e.key) - 1);
        return;
      }
    }
  });
}
