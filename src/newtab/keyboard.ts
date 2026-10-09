export interface KeyboardHandlers {
  escape: () => void;
  focusSearch: () => void;
  toggleSettings: () => void;
  toggleAI: () => void;
  activateQuickLink: (index: number) => void;
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
      if (e.key >= "1" && e.key <= "9") {
        handlers.activateQuickLink(parseInt(e.key) - 1);
        return;
      }
    }
  });
}
