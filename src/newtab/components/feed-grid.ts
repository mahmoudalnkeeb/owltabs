import type { FeedItem, SyncStorageSettings } from "../state/types";
import { feedStore, uiStore } from "../state/store";
import { storage } from "../services/storage";
import { relativeTime } from "../services/rss";
import { $, $$, escapeHtml, svgIcon, showToast } from "../utils";
import { getDomain, resolveFavicons } from "../services/favicon";

const ITEMS_PER_PAGE = 16;

let currentFeedSettings: SyncStorageSettings | null = null;
let faviconCache = new Map<string, string | null>();

export function setFeedSettings(settings: SyncStorageSettings) {
  currentFeedSettings = settings;
}

export function renderFeedGrid() {
  const grid = $("#nt-feed-grid");
  if (!grid) return;

  grid.innerHTML = Array.from({ length: 6 })
    .map(() => `
      <article class="feed-card is-skeleton">
        <div class="feed-card-thumb"></div>
        <div class="feed-card-body">
          <div class="feed-card-source"></div>
          <h3 class="feed-card-title"></h3>
          <p class="feed-card-excerpt"></p>
        </div>
      </article>
    `).join("");

  const render = async () => {
    const items = feedStore.get();
    const { activeFilter, feedSearchQuery, feedPage } = uiStore.get();

    let filtered = items;

    if (activeFilter === "saved") {
      filtered = items.filter((i) => i.saved);
    } else if (activeFilter !== "all") {
      filtered = items.filter((i) => i.feedCategory === activeFilter);
    }

    if (feedSearchQuery) {
      const q = feedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.excerpt.toLowerCase().includes(q)
      );
    }

    if (!items.length) {
      grid.innerHTML = `<div class="feed-empty">Add an RSS feed in settings to get started.</div>`;
      return;
    }

    if (!filtered.length) {
      grid.innerHTML = `<div class="feed-empty">No articles match your filter.</div>`;
      return;
    }

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const page = Math.min(feedPage, totalPages - 1);
    const start = page * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

    // Batch-resolve favicons for visible items only
    const domains = [...new Set(pageItems.map((i) => getDomain(i.url)).filter(Boolean))];
    const unresolved = domains.filter((d) => !faviconCache.has(d));
    if (unresolved.length) {
      const resolved = await resolveFavicons(unresolved);
      resolved.forEach((url, domain) => faviconCache.set(domain, url));
    }

    const cardsHtml = pageItems.map((item) => renderCard(item)).join("");
    const paginationHtml = paginate(page, totalPages);
    grid.innerHTML = cardsHtml + paginationHtml;

    // Staggered entrance — each card fades in with offset delay
    grid.querySelectorAll<HTMLElement>(".feed-card:not(.is-skeleton)").forEach((card, idx) => {
      card.style.animationDelay = `${idx * 60}ms`;
      // Trigger reflow so animation plays after innerHTML insert
      requestAnimationFrame(() => card.classList.add("is-visible"));
    });

    // Update read count badge
    updateReadCount();
  };

  feedStore.subscribe(render);
  uiStore.subscribe(() => render());

  grid.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    // Pagination
    const pageBtn = target.closest<HTMLButtonElement>("[data-page]");
    if (pageBtn) {
      e.preventDefault();
      const dir = pageBtn.dataset.page;
      const { feedPage } = uiStore.get();
      uiStore.set((s) => ({ ...s, feedPage: dir === "next" ? feedPage + 1 : feedPage - 1 }));
      return;
    }

    // Save / unsave
    const saveBtn = target.closest<HTMLButtonElement>(".feed-card-save");
    if (saveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const card = saveBtn.closest<HTMLElement>(".feed-card");
      const id = card?.dataset.id;
      if (!id) return;
      const isSaved = saveBtn.dataset.saved === "true";
      if (isSaved) {
        await storage.unsaveArticle(id);
        showToast("Removed from saved", "accent");
      } else {
        const item = feedStore.get().find((i) => i.id === id);
        if (item) {
          await storage.saveArticle({ ...item, saved: true });
          showToast("Saved", "mint");
        }
      }
      saveBtn.dataset.saved = String(!isSaved);
      saveBtn.classList.toggle("is-saving", true);
      setTimeout(() => saveBtn.classList.remove("is-saving"), 300);
      return;
    }

    // Ask AI
    const askBtn = target.closest<HTMLButtonElement>(".feed-card-ask-ai");
    if (askBtn) {
      e.preventDefault();
      e.stopPropagation();
      const card = askBtn.closest<HTMLElement>(".feed-card");
      const title = card?.dataset.title || "";
      uiStore.set((s) => ({ ...s, aiPanelOpen: true }));
      const aiInput = $("#nt-ai-input") as HTMLTextAreaElement | null;
      if (aiInput) {
        aiInput.value = `Summarize this article: ${title}`;
        aiInput.focus();
      }
      return;
    }

    // Open link
    const openLink = target.closest<HTMLAnchorElement>(".feed-card-open, .feed-card-title a");
    if (openLink) {
      const card = openLink.closest<HTMLElement>(".feed-card");
      if (card) {
        card.classList.add("is-read");
        updateReadCount();
      }
      if (currentFeedSettings?.openFeedLinksIn === "same_tab") {
        e.preventDefault();
        location.href = openLink.href;
      }
      return;
    }
  });

  if (feedStore.get().length) render();
}

function updateReadCount() {
  const badge = $("#nt-read-badge");
  if (!badge) return;
  const readCount = $$(".feed-card.is-read").length;
  badge.textContent = readCount ? `${readCount} read` : "";
}

function paginate(current: number, total: number): string {
  if (total <= 1) return "";
  return `
    <div class="feed-pagination">
      <button class="btn btn-ghost btn-sm" data-page="prev" ${current === 0 ? "disabled" : ""}>
        ${svgIcon("chevron-left", 14)} Prev
      </button>
      <span class="feed-pagination-info">Page ${current + 1} of ${total}</span>
      <button class="btn btn-ghost btn-sm" data-page="next" ${current >= total - 1 ? "disabled" : ""}>
        Next ${svgIcon("chevron-right", 14)}
      </button>
    </div>
  `;
}

function renderCard(item: FeedItem): string {
  const domain = getDomain(item.url);
  const favicon = faviconCache.get(domain) || "";
  const time = relativeTime(item.publishedAt);
  const target = currentFeedSettings?.openFeedLinksIn === "same_tab" ? "_self" : "_blank";
  const hasThumb = !!item.thumbnailUrl;

  // Age-based classes: fresh (< 5 min), recent (< 30 min)
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  const isFresh = ageMs < 5 * 60 * 1000;
  const isRecent = ageMs < 30 * 60 * 1000;
  const ageClasses = [
    isFresh ? "is-fresh" : "",
    isRecent ? "is-recent" : "",
  ].filter(Boolean).join(" ");

  const thumbHtml = hasThumb
    ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('feed-card-thumb--fallback');this.remove()" />`
    : "";

  const faviconHtml = favicon
    ? `<img class="feed-card-favicon" src="${escapeHtml(favicon)}" alt="" width="14" height="14" loading="lazy" />`
    : `<span style="width:14px;height:14px;display:inline-block"></span>`;

  return `
    <article class="feed-card ${ageClasses}" data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title)}">
      <div class="feed-card-thumb ${hasThumb ? "" : "feed-card-thumb--fallback"}">
        ${thumbHtml}
      </div>
      <div class="feed-card-body">
        <div class="feed-card-source">
          ${faviconHtml}
          <span class="feed-card-source-name">${escapeHtml(item.feedLabel)}</span>
          <span class="feed-card-dot">·</span>
          <time class="feed-card-time" datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(time)}</time>
        </div>
        <h3 class="feed-card-title">
          <a href="${escapeHtml(item.url)}" target="${target}" rel="noopener">${escapeHtml(item.title)}</a>
        </h3>
        <p class="feed-card-excerpt">${escapeHtml(item.excerpt)}</p>
      </div>
      <div class="feed-card-actions">
        <a class="btn btn-ghost btn-sm feed-card-open" href="${escapeHtml(item.url)}" target="${target}" rel="noopener">
          ${svgIcon("open-in-new", 14)} Open
        </a>
        <button class="feed-card-save" aria-label="Save article" data-saved="${item.saved}">
          ${svgIcon("bookmark", 15)}
        </button>
      </div>
    </article>
  `;
}
