import type { FeedItem, SyncStorageSettings } from "../state/types";
import { getDomain } from "../services/favicon";
import { relativeTime } from "../services/rss";
import { escapeHtml, svgIcon } from "../utils";

export function renderCard(
  item: FeedItem,
  settings: SyncStorageSettings,
  faviconCache: Map<string, string | null>,
): string {
  const domain = getDomain(item.url);
  const favicon = faviconCache.get(domain) || "";
  const time = relativeTime(item.publishedAt);
  const target = settings.openFeedLinksIn === "same_tab" ? "_self" : "_blank";
  const hasThumb = !!item.thumbnailUrl;

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
