import type { SyncStorageSettings } from "../state/types";
import { uiStore } from "../state/store";
import { $, svgIcon, escapeHtml, showToast } from "../utils";
import { requestRefresh } from "../services/rss";

export function renderFeedFilterbar(settings: SyncStorageSettings) {
  const container = $("#nt-feed-filterbar");
  if (!container) return;

  const categories = Array.from(
    new Set(settings.feedsConfig.map((f) => f.category).filter(Boolean))
  );

  container.innerHTML = `
    <div class="feed-tabs" role="tablist" aria-label="Feed filter">
      <button class="pill active" role="tab" data-filter="all" aria-selected="true">All</button>
      ${categories.map((cat) => `
        <button class="pill" role="tab" data-filter="${escapeHtml(cat)}" aria-selected="false">${escapeHtml(cat)}</button>
      `).join("")}
      <button class="pill" role="tab" data-filter="saved" aria-selected="false">
        ${svgIcon("bookmark", 12)} Saved
      </button>
      <span class="feed-read-badge" id="nt-read-badge"></span>
    </div>
    <div class="feed-search-wrap">
      <button class="nt-icon-btn" id="nt-feed-refresh-btn" aria-label="Refresh feeds" title="Refresh feeds">
        ${svgIcon("refresh", 15)}
      </button>
    </div>
  `;

  // Tab switching
  container.querySelectorAll<HTMLButtonElement>(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      container.querySelectorAll(".pill").forEach((p) => {
        const btn = p as HTMLButtonElement;
        const active = btn === pill;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      uiStore.set((s) => ({ ...s, activeFilter: pill.dataset.filter || "all", feedPage: 0 }));
    });
  });

  // Feed refresh
  $("#nt-feed-refresh-btn")?.addEventListener("click", async () => {
    const btn = $("#nt-feed-refresh-btn") as HTMLButtonElement;
    btn.style.animation = "spin 0.6s linear";
    const ok = await requestRefresh();
    btn.style.animation = "";
    if (ok) showToast("Feeds refreshed", "mint");
    else showToast("Refresh failed", "red");
  });
}
