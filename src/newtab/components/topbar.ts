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
    <div class="nt-topbar-left">
      ${settings.appearance.showClock ? `
        <span class="nt-clock" id="nt-clock"></span>
        <span class="nt-date" id="nt-date"></span>
      ` : ""}
    </div>
    <div class="nt-topbar-right">
      ${settings.ai.enabled && settings.ai.geminiKey ? `
        <button class="nt-icon-btn" id="nt-ai-btn" aria-label="Open AI assistant" title="AI assistant (⌘/)">
          <div class="orb-wrap is-idle" style="--orb-size:28px">
            <div class="orb"></div>
          </div>
        </button>
      ` : ""}
      <button class="nt-icon-btn" id="nt-settings-btn" aria-label="Open settings" title="Settings (⌘,)">
        ${svgIcon("settings", 18)}
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

function updateClock() {
  const now = new Date();
  const clockEl = $("#nt-clock");
  const dateEl = $("#nt-date");
  const hour12 = !clockIs24;
  if (clockEl) {
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12,
    });
    const chars = timeStr.split("");
    const prevLen = prevClockChars.length;

    let html = "";
    chars.forEach((ch, i) => {
      const changed = prevLen > 0 && i < prevLen && ch !== prevClockChars[i];
      const cls = changed ? "nt-clock-digit is-changed" : "nt-clock-digit";
      html += `<span class="${cls}">${ch === " " ? "\u00a0" : ch}</span>`;
    });
    clockEl.innerHTML = html;
    prevClockChars = chars;

    // Remove animation class after it plays so it can re-trigger next tick
    setTimeout(() => {
      clockEl.querySelectorAll(".is-changed").forEach((el) => {
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
