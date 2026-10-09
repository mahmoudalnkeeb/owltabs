import type { SyncStorageSettings } from "../state/types";
import { uiStore } from "../state/store";
import { $, svgIcon, escapeHtml, showToast } from "../utils";
import { requestRefresh } from "../services/rss";

let querySubscribed = false;

// Shows the active feed search as a chip that clears it on click.
function renderQueryChip() {
  const slot = $("#nt-feed-query");
  if (!slot) return;
  const q = uiStore.get().feedSearchQuery;
  slot.innerHTML = q
    ? `<button class="chip" id="nt-feed-query-clear" aria-label="Clear feed search">“${escapeHtml(q)}” ${svgIcon("close", 12)}</button>`
    : "";
  $("#nt-feed-query-clear")?.addEventListener("click", clearFeedSearch);
}

export function clearFeedSearch() {
  if (!uiStore.get().feedSearchQuery) return;
  uiStore.set((s) => ({ ...s, feedSearchQuery: "", feedPage: 0 }));
}

export function renderFeedFilterbar(settings: SyncStorageSettings) {
  const container = $("#nt-feed-filterbar");
  if (!container) return;

  const categories = Array.from(
    new Set(settings.feedsConfig.map((f) => f.category).filter(Boolean))
  );

  // Keep the current filter unless its category no longer exists.
  let { activeFilter } = uiStore.get();
  if (activeFilter !== "all" && activeFilter !== "saved" && !categories.includes(activeFilter)) {
    activeFilter = "all";
    uiStore.set((s) => ({ ...s, activeFilter, feedPage: 0 }));
  }
  const pill = (filter: string, label: string) => {
    const active = filter === activeFilter;
    return `<button class="pill${active ? " active" : ""}" role="tab" data-filter="${escapeHtml(filter)}" aria-selected="${active}">${label}</button>`;
  };

  container.innerHTML = `
    <div class="feed-tabs" role="tablist" aria-label="Feed filter">
      ${pill("all", "All")}
      ${categories.map((cat) => pill(cat, escapeHtml(cat))).join("")}
      ${pill("saved", `${svgIcon("bookmark", 12)} Saved`)}
      <span class="feed-read-badge" id="nt-read-badge"></span>
    </div>
    <div class="feed-search-wrap">
      <span id="nt-feed-query"></span>
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

  renderQueryChip();
  if (!querySubscribed) {
    querySubscribed = true;
    let lastQuery = uiStore.get().feedSearchQuery;
    uiStore.subscribe((s) => {
      if (s.feedSearchQuery === lastQuery) return;
      lastQuery = s.feedSearchQuery;
      renderQueryChip();
    });
  }

  // Feed refresh
  $("#nt-feed-refresh-btn")?.addEventListener("click", async () => {
    const btn = $("#nt-feed-refresh-btn") as HTMLButtonElement;
    btn.style.animation = "spin 0.6s linear";
    const ok = await requestRefresh(true);
    btn.style.animation = "";
    if (ok) showToast("Feeds refreshed", "mint");
    else showToast("Refresh failed", "red");
  });
}
