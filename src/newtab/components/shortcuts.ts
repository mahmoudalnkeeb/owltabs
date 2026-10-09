import { escapeHtml, svgIcon } from "../utils";

const MOD = navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Articles",
    keys: [
      [["j", "or", "↓"], "Next article"],
      [["k", "or", "↑"], "Previous article"],
      [["o"], "Open"],
      [["s"], "Save or unsave"],
      [["m"], "Mark read or unread"],
      [["a"], "Ask AI about it"],
    ],
  },
  {
    title: "Anywhere",
    keys: [
      [["/", "or", MOD, "K"], "Search"],
      [["↓"], "From search to articles"],
      [[MOD, "/"], "Toggle AI"],
      [[MOD, ","], "Settings"],
      [["1", "to", "9"], "Quick link"],
      [["Esc"], "Close or clear"],
    ],
  },
];

let dialog: HTMLDialogElement | null = null;

function build(): HTMLDialogElement {
  const el = document.createElement("dialog");
  el.className = "shortcuts";
  el.setAttribute("aria-labelledby", "nt-shortcuts-title");
  el.innerHTML = `
    <header class="shortcuts-head">
      <h2 id="nt-shortcuts-title">Keyboard shortcuts</h2>
      <button class="nt-icon-btn" data-close aria-label="Close">${svgIcon("close", 16)}</button>
    </header>
    <div class="shortcuts-body">
      ${GROUPS.map((g) => `
        <section>
          <h3>${g.title}</h3>
          <dl>
            ${g.keys.map(([keys, label]) => `
              <div>
                <dt>${keys.map((k) => (k === "or" || k === "to" ? `<span>${k}</span>` : `<kbd>${escapeHtml(k)}</kbd>`)).join("")}</dt>
                <dd>${escapeHtml(label)}</dd>
              </div>`).join("")}
          </dl>
        </section>`).join("")}
    </div>
  `;
  el.addEventListener("click", (e) => {
    // Clicks on the backdrop land on the dialog element itself.
    if (e.target === el || (e.target as HTMLElement).closest("[data-close]")) el.close();
  });
  document.body.appendChild(el);
  return el;
}

export function toggleShortcuts(): void {
  dialog ??= build();
  if (dialog.open) dialog.close();
  else dialog.showModal();
}

export function shortcutsOpen(): boolean {
  return !!dialog?.open;
}
