export interface KeyboardHandlers {
  escape: () => void;
  focusSearch: () => void;
  focusFeedSearch: () => void;
  toggleSettings: () => void;
  toggleAI: () => void;
  activateQuickLink: (index: number) => void;
}

export function initKeyboard(handlers: KeyboardHandlers) {
  document.addEventListener("keydown", (e) => {
    const inInput = document.activeElement?.matches(
      "input, textarea, [contenteditable]"
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

    if (!inInput) {
      if (e.key === "/" || e.key === " ") {
        e.preventDefault();
        handlers.focusSearch();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        handlers.focusFeedSearch();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        handlers.activateQuickLink(parseInt(e.key) - 1);
        return;
      }
    }
  });
}
