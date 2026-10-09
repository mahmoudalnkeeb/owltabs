import type { SyncStorageSettings } from "../state/types";
import { uiStore } from "../state/store";
import { $, svgIcon } from "../utils";
import { toggleAIChat } from "./ai-chat";

let clockIs24 = false;
let clockTimer: ReturnType<typeof setInterval> | undefined;

export function renderTopbar(settings: SyncStorageSettings) {
  clockIs24 = settings.appearance.clockFormat === "24";
  const clock = $("#nt-clock");
  const controls = $("#nt-controls");
  if (!clock || !controls) return;

  clock.innerHTML = settings.appearance.showClock ? `
    <time class="clock-time" id="topbar-time" aria-live="off" aria-atomic="true"></time>
    <time class="clock-date" id="topbar-date"></time>
  ` : "";

  const aiOn = settings.ai.enabled && settings.ai.geminiKey;
  controls.innerHTML = `
    ${aiOn ? `
      <button class="topbar-ai-btn" id="nt-ai-btn" aria-label="Open AI assistant" aria-pressed="${uiStore.get().aiActive}" title="AI assistant (${navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl+"}/)">
        ${svgIcon("sparkles", 14)}<span>Ask AI</span>
      </button>
    ` : ""}
    <button class="topbar-icon-btn" id="nt-settings-btn" aria-label="Settings" title="Settings">
      ${svgIcon("settings", 16)}
    </button>
  `;

  clearInterval(clockTimer);
  clockTimer = undefined;
  if (settings.appearance.showClock) {
    updateClock();
    clockTimer = setInterval(updateClock, 15_000);
  }

  $("#nt-settings-btn")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, settingsOpen: !s.settingsOpen }));
  });

  $("#nt-ai-btn")?.addEventListener("click", () => {
    toggleAIChat();
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
    const suffix = clockIs24 ? "" : h >= 12 ? " PM" : " AM";
    if (!clockIs24) h = h % 12 || 12;
    const text = `${clockIs24 ? pad(h) : h}:${pad(now.getMinutes())}${suffix}`;
    if (timeEl.textContent !== text) timeEl.textContent = text;
  }

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
}
