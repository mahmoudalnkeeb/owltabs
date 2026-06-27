import type { SyncStorageSettings } from "../state/types";
import { uiStore } from "../state/store";
import { $, svgIcon } from "../utils";

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
          ${svgIcon("sparkles", 12)}
          <span>Assistant</span>
        </button>
        <div class="topbar-divider" role="separator" aria-hidden="true"></div>
      ` : ""}
      <button class="topbar-icon-btn" id="nt-settings-btn" aria-label="Settings">
        ${svgIcon("settings", 16)}
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
