import type { SyncStorageSettings } from "../state/types";
import { uiStore } from "../state/store";
import { $ } from "../utils";

let clockIs24 = false;
let prevClockChars: string[] = [];

export function renderTopbar(settings: SyncStorageSettings) {
  clockIs24 = settings.appearance.clockFormat === "24";
  const header = $("#nt-topbar");
  if (!header) return;

  header.innerHTML = `
    <div class="topbar-clock">
      ${settings.appearance.showClock ? `
        <time class="clock-time" id="topbar-time" aria-live="off" aria-atomic="true"></time>
        <span class="clock-sep" aria-hidden="true">·</span>
        <time class="clock-date" id="topbar-date"></time>
      ` : ""}
    </div>
    <div class="topbar-controls">
      ${settings.ai.enabled && settings.ai.geminiKey ? `
        <button class="topbar-ai-btn" id="nt-ai-btn" aria-label="Open AI Assistant">
          <svg class="topbar-ai-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 0.6L7.08 4.42L11 5.5L7.08 6.58L6 10.4L4.92 6.58L1 5.5L4.92 4.42L6 0.6Z"
                  fill="currentColor"/>
          </svg>
          <span>Assistant</span>
        </button>
        <div class="topbar-divider" role="separator" aria-hidden="true"></div>
      ` : ""}
      <button class="topbar-icon-btn" id="nt-settings-btn" aria-label="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm-1.5 2.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"
            fill="currentColor"/>
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M8 1a.75.75 0 00-.75.75v.618a5.52 5.52 0 00-1.953.808l-.437-.437a.75.75 0 00-1.06 0l-1.414 1.414a.75.75 0 000 1.06l.437.437A5.52 5.52 0 002.018 7.25H1.4A.75.75 0 00.65 8c0 .414.336.75.75.75h.618c.14.693.41 1.34.805 1.91l-.437.437a.75.75 0 000 1.06l1.414 1.414a.75.75 0 001.06 0l.437-.437c.57.395 1.217.665 1.91.805v.618c0 .414.336.75.75.75s.75-.336.75-.75v-.618a5.52 5.52 0 001.91-.805l.437.437a.75.75 0 001.06 0l1.414-1.414a.75.75 0 000-1.06l-.437-.437A5.52 5.52 0 0013.632 8.75h.618a.75.75 0 000-1.5h-.618a5.52 5.52 0 00-.805-1.91l.437-.437a.75.75 0 000-1.06l-1.414-1.414a.75.75 0 00-1.06 0l-.437.437A5.52 5.52 0 008.75 2.368V1.75A.75.75 0 008 1z"
            fill="currentColor"/>
        </svg>
      </button>
    </div>
  `;

  if (settings.appearance.showClock) {
    prevClockChars = [];
    updateClock();
    setInterval(updateClock, 1000);
  }

  $("#nt-settings-btn")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, settingsOpen: !s.settingsOpen }));
  });

  $("#nt-ai-btn")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, aiPanelOpen: !s.aiPanelOpen }));
  });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  const timeEl = $("#topbar-time");
  const dateEl = $("#topbar-date");

  if (timeEl) {
    let h = now.getHours();
    const ampm = clockIs24 ? "" : h >= 12 ? " PM" : " AM";
    if (!clockIs24) h = h % 12 || 12;
    const timeStr = `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${ampm}`;

    const chars = timeStr.split("");
    const prevLen = prevClockChars.length;

    let html = "";
    chars.forEach((ch, i) => {
      const changed = prevLen > 0 && i < prevLen && ch !== prevClockChars[i];
      const cls = changed ? "clock-digit is-changed" : "clock-digit";
      html += `<span class="${cls}">${ch === " " ? "\u00a0" : ch}</span>`;
    });
    timeEl.innerHTML = html;
    prevClockChars = chars;

    setTimeout(() => {
      timeEl.querySelectorAll(".is-changed").forEach((el) => {
        el.classList.remove("is-changed");
      });
    }, 260);
  }

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
}
