import type { SyncStorageSettings } from "../state/types";
import { feedStore, readStore, uiStore } from "../state/store";
import { aiReady } from "../services/ai";
import { markRead } from "../services/read";
import {
  type Briefing,
  briefingArticles,
  generateBriefing,
  getBriefing,
  MIN_ARTICLES,
  needsBriefing,
  onBriefingChange,
  today,
  updateBriefing,
} from "../services/briefing";
import { escapeHtml, svgIcon, showToast } from "../utils";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Feeds settle in a few steps on open (cache, re-parse, background refresh);
// wait for them to go quiet so the briefing covers the freshest articles.
const SETTLE_MS = 4000;

let settings: SyncStorageSettings | null = null;
let briefing: Briefing | null = null;
let el: HTMLElement | null = null;
let generating = false;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

function enabled(): boolean {
  return !!settings && settings.ai.dailyBriefing && aiReady(settings.ai);
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: settings?.appearance.clockFormat !== "24",
  });
}

function render(): void {
  if (!el) return;
  const { activeFilter, feedSearchQuery } = uiStore.get();
  const b = briefing;
  const show = enabled() && activeFilter === "all" && !feedSearchQuery && b?.day === today() && !b.dismissed;
  el.hidden = !show;
  if (!show || !b) return;

  const pending = b.status === "pending";
  const meta =
    b.status === "error"
      ? "Couldn't write it"
      : pending
        ? "Writing…"
        : `${b.articleCount} unread · ${timeLabel(b.createdAt)}`;
  let body = "";
  if (b.status === "error") {
    body = `<p class="briefing-error">${escapeHtml(b.error ?? "Something went wrong.")}</p>`;
  } else if (b.text) {
    body = DOMPurify.sanitize(marked.parse(b.text) as string) + (pending ? '<span class="cursor"></span>' : "");
  } else {
    body = `<span class="sk sk-title"></span><span class="sk sk-meta"></span><span class="sk sk-title"></span>`;
  }

  el.classList.toggle("is-collapsed", b.collapsed);
  el.innerHTML = `
    <header class="briefing-head">
      <button class="briefing-toggle" data-briefing="collapse" aria-expanded="${!b.collapsed}" aria-controls="nt-briefing-body">
        <span class="briefing-icon">${svgIcon("sparkles", 14)}</span>
        <span class="briefing-title">Today's briefing</span>
        <span class="briefing-meta">${escapeHtml(meta)}</span>
        <span class="briefing-chevron">${svgIcon("chevron-down", 14)}</span>
      </button>
      <div class="briefing-actions">
        <button class="set-icon-btn" data-briefing="regenerate" aria-label="Write it again" title="Write it again" ${pending ? "disabled" : ""}>${svgIcon("refresh", 14)}</button>
        <button class="set-icon-btn" data-briefing="dismiss" aria-label="Hide for today" title="Hide for today">${svgIcon("close", 14)}</button>
      </div>
    </header>
    <div class="briefing-body" id="nt-briefing-body" ${b.collapsed ? "hidden" : ""}>${body}</div>`;
}

async function run(force = false): Promise<void> {
  if (generating || !settings || !enabled()) return;
  const stored = await getBriefing();
  if (!force && !needsBriefing(stored)) return;
  const articles = briefingArticles(feedStore.get(), readStore.get());
  if (articles.length < MIN_ARTICLES) {
    if (force) showToast("Not enough new unread articles for a briefing", "accent");
    return;
  }
  generating = true;
  try {
    await generateBriefing(settings.ai, articles, stored);
  } finally {
    generating = false;
  }
}

/** Writes a fresh briefing now, even if today's already exists. */
export function catchMeUp(): void {
  void run(true);
}

export function setBriefingSettings(next: SyncStorageSettings): void {
  const wasEnabled = enabled();
  settings = next;
  render();
  // Just turned on: write today's if feeds are already here.
  if (!wasEnabled && enabled() && feedStore.get().length) void run();
}

export async function initBriefing(): Promise<void> {
  el = document.getElementById("nt-briefing");
  if (!el) return;
  const card = el;

  briefing = await getBriefing();
  render();
  onBriefingChange((b) => {
    briefing = b;
    render();
  });

  let last = uiStore.get();
  uiStore.subscribe((s) => {
    if (s.activeFilter === last.activeFilter && s.feedSearchQuery === last.feedSearchQuery) return;
    last = s;
    render();
  });

  feedStore.subscribe((items) => {
    if (!items.length) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => void run(), SETTLE_MS);
  });
  if (feedStore.get().length) settleTimer = setTimeout(() => void run(), SETTLE_MS);

  card.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-briefing]")?.dataset.briefing;
    if (action === "collapse" && briefing) void updateBriefing({ collapsed: !briefing.collapsed });
    if (action === "regenerate") void run(true);
    if (action === "dismiss") {
      void updateBriefing({ dismissed: true });
      showToast("Briefing hidden for today", "accent", {
        label: "Undo",
        onClick: () => void updateBriefing({ dismissed: false }),
      });
    }

    // Opening an article from the briefing counts as reading it.
    const link = target.closest<HTMLAnchorElement>(".briefing-body a[href]");
    if (link) {
      const article = feedStore.get().find((i) => i.url === link.href || i.url === link.getAttribute("href"));
      if (article) void markRead([article.id]);
    }
  });
}
