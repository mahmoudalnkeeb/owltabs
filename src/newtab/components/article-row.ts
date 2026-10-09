import type { FeedItem, SyncStorageSettings } from "../state/types";
import { getDomain } from "../services/favicon";
import { relativeTime } from "../services/rss";
import { escapeHtml, svgIcon } from "../utils";

export interface RowOptions {
  read: boolean;
  /** Show the "Ask AI" action; false when AI isn't configured. */
  canAsk: boolean;
}

/** "3h ago" → "3h", "just now" → "now"; dates pass through. */
function shortTime(iso: string): string {
  return relativeTime(iso).replace(/ ago$/, "").replace("just now", "now");
}

export function aiConfigured(settings: SyncStorageSettings | null): boolean {
  return !!settings?.ai.enabled && !!settings.ai.geminiKey;
}

export function renderRow(
  item: FeedItem,
  settings: SyncStorageSettings | null,
  faviconCache: Map<string, string | null>,
  opts: RowOptions,
): string {
  const favicon = faviconCache.get(getDomain(item.url)) || "";
  const target = settings?.openFeedLinksIn === "same_tab" ? "_self" : "_blank";
  const showThumb = (settings?.appearance.showThumbnails ?? true) && !!item.thumbnailUrl;
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  const saveLabel = item.saved ? "Remove from saved" : "Save article";

  const classes = [
    "row",
    opts.read ? "is-read" : "",
    ageMs < 30 * 60 * 1000 ? "is-fresh" : "",
  ].filter(Boolean).join(" ");

  return `
    <article class="${classes}" role="listitem" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}">
      <time class="row-time" datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(shortTime(item.publishedAt))}</time>
      <div class="row-main">
        <h3 class="row-title">
          <a href="${escapeHtml(item.url)}" target="${target}" rel="noopener">${escapeHtml(item.title)}</a>
        </h3>
        <div class="row-meta">
          ${favicon ? `<img class="row-favicon" src="${escapeHtml(favicon)}" alt="" width="14" height="14" loading="lazy" />` : ""}
          <span class="row-source">${escapeHtml(item.feedLabel)}</span>
          ${item.saved ? `<span class="row-saved" title="Saved" aria-label="Saved">${svgIcon("bookmark", 12)}</span>` : ""}
          ${item.excerpt ? `<span class="row-excerpt">${escapeHtml(item.excerpt)}</span>` : ""}
        </div>
      </div>
      <div class="row-actions">
        ${opts.canAsk ? `
          <button class="row-action" data-action="ask" aria-label="Ask AI about this article" title="Ask AI (a)">
            ${svgIcon("sparkles", 15)}
          </button>` : ""}
        <button class="row-action row-save" data-action="save" data-saved="${item.saved}" aria-label="${saveLabel}" title="${saveLabel} (s)">
          ${svgIcon("bookmark", 15)}
        </button>
      </div>
      ${showThumb ? `
        <div class="row-thumb">
          <img class="row-thumb-img" src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" />
        </div>` : ""}
    </article>
  `;
}

/**
 * Drop thumbnails that fail to load. Inline `onerror` is blocked by the
 * extension CSP, and error events don't bubble, so listen in the capture phase.
 */
export function handleThumbErrors(root: HTMLElement): void {
  root.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement && img.classList.contains("row-thumb-img")) {
        img.parentElement?.remove();
      }
    },
    true,
  );
}
