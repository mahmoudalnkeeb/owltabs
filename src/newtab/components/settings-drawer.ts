import type { SyncStorageSettings, FeedConfig } from "../state/types";
import { AI_MODELS } from "../state/types";
import { uiStore } from "../state/store";
import { storage } from "../services/storage";
import { KEYS } from "../services/keys";
import { getDomain, resolveFavicons } from "../services/favicon";
import { $, escapeHtml, svgIcon, showToast } from "../utils";

// ── Types ──

type Option = { label: string; value: string };

type FieldDef = {
  key: string;
  label: string;
  type: "segment" | "select" | "toggle" | "text" | "textarea";
  options?: Option[];
  placeholder?: string;
  hint?: string;
  rows?: number;
  /** Convert the control's string value before saving (e.g. to a number). */
  parse?: (v: string) => unknown;
  visible?: (s: SyncStorageSettings) => boolean;
};

type Part =
  | { kind: "fields"; title?: string; fields: FieldDef[] }
  | { kind: "custom"; render: () => string; init: () => void };

type SectionDef = {
  label: string;
  icon: string;
  description: string;
  parts: Part[];
};

// ── Constants ──

export const PUBLIC_FEED_CATALOG: Record<string, { label: string; url: string }[]> = {
  tech: [
    { label: "Hacker News", url: "https://hnrss.org/frontpage" },
    { label: "GitHub Blog", url: "https://github.blog/feed/" },
    { label: "Latent Space", url: "https://www.latent.space/feed" },
    {
      label: "TypeScript Blog",
      url: "https://devblogs.microsoft.com/typescript/feed/",
    },
  ],
  ai: [{ label: "The Decoder", url: "https://the-decoder.com/feed/" }],
};

const OPEN_IN: Option[] = [
  { label: "New tab", value: "new_tab" },
  { label: "This tab", value: "same_tab" },
];

const REFRESH_INTERVALS: Option[] = [
  { label: "Every 30 minutes", value: "30" },
  { label: "Every hour", value: "60" },
  { label: "Every 2 hours", value: "120" },
  { label: "Only when I refresh", value: "0" },
];

const ACCENTS: { label: string; value: string }[] = [
  { label: "Peach", value: "#FFC799" },
  { label: "Sky", value: "#7EB8FF" },
  { label: "Lilac", value: "#C49AFF" },
  { label: "Mint", value: "#99FFE4" },
];

const MAX_QUICK_LINKS = 12;

const SECTIONS: Record<string, SectionDef> = {
  general: {
    label: "General",
    icon: "settings",
    description: "Search, links, and what happens when a new tab opens.",
    parts: [
      {
        kind: "fields",
        title: "Search",
        fields: [
          {
            key: "searchEngine",
            label: "Search engine",
            type: "select",
            options: [
              { label: "Brave", value: "brave" },
              { label: "Google", value: "google" },
              { label: "DuckDuckGo", value: "ddg" },
              { label: "Bing", value: "bing" },
              { label: "Custom", value: "custom" },
            ],
          },
          {
            key: "customSearchUrl",
            label: "Custom search URL",
            type: "text",
            placeholder: "https://example.com/search?q={query}",
            hint: "Put {query} where the search terms go.",
            visible: (s) => s.searchEngine === "custom",
          },
          {
            key: "appearance.focusSearchOnOpen",
            label: "Focus search on new tab",
            type: "toggle",
            hint: "Chrome puts the cursor in the address bar. This reloads the page once so you can type right away; the address bar then shows the extension's URL.",
          },
          {
            key: "clearSearchOnSubmit",
            label: "Clear search after submitting",
            type: "toggle",
            hint: "Empty the box once you search, open a URL, or ask AI.",
          },
        ],
      },
      {
        kind: "fields",
        title: "Links",
        fields: [
          { key: "openLinksIn", label: "Search results and quick links open in", type: "segment", options: OPEN_IN },
          { key: "openFeedLinksIn", label: "Articles open in", type: "segment", options: OPEN_IN },
        ],
      },
    ],
  },
  feeds: {
    label: "Feeds",
    icon: "rss",
    description: "The sources in your reading list.",
    parts: [{ kind: "custom", render: renderFeedsCustom, init: initFeedsCustom }],
  },
  quicklinks: {
    label: "Quick links",
    icon: "link",
    description: "Sites pinned above your feed. Drag them on the page to reorder.",
    parts: [
      {
        kind: "fields",
        fields: [{ key: "appearance.showQuickLinks", label: "Show quick links", type: "toggle" }],
      },
      { kind: "custom", render: renderQuickLinksCustom, init: initQuickLinksCustom },
    ],
  },
  appearance: {
    label: "Appearance",
    icon: "palette",
    description: "Text size, color, and what's shown on the page.",
    parts: [
      {
        kind: "fields",
        fields: [
          {
            key: "appearance.fontScale",
            label: "Text size",
            type: "segment",
            options: [
              { label: "Small", value: "0.9" },
              { label: "Default", value: "1" },
              { label: "Large", value: "1.1" },
              { label: "Larger", value: "1.2" },
            ],
            parse: (v) => parseFloat(v),
          },
        ],
      },
      { kind: "custom", render: renderAccentCustom, init: initAccentCustom },
      {
        kind: "fields",
        title: "Page",
        fields: [
          { key: "appearance.showThumbnails", label: "Article thumbnails", type: "toggle" },
          {
            key: "appearance.grayscale",
            label: "Grayscale images",
            type: "toggle",
            hint: "Images return to color on hover.",
          },
          { key: "appearance.showClock", label: "Clock", type: "toggle" },
          {
            key: "appearance.clockFormat",
            label: "Clock format",
            type: "segment",
            options: [
              { label: "12-hour", value: "12" },
              { label: "24-hour", value: "24" },
            ],
            visible: (s) => s.appearance.showClock,
          },
        ],
      },
    ],
  },
  ai: {
    label: "AI assistant",
    icon: "sparkles",
    description: "Ask questions about your feed using Google Gemini with your own API key.",
    parts: [
      {
        kind: "fields",
        fields: [{ key: "ai.enabled", label: "AI assistant", type: "toggle" }],
      },
      { kind: "custom", render: renderAIKeyCustom, init: initAIKeyCustom },
      {
        kind: "fields",
        fields: [
          {
            key: "ai.model",
            label: "Model",
            type: "select",
            options: AI_MODELS.map((m) => ({ label: m, value: m })),
          },
          {
            key: "ai.systemPrompt",
            label: "Custom instructions",
            type: "textarea",
            rows: 4,
            placeholder: "For example: answer in short bullet points.",
            hint: "Added to every conversation. Optional.",
          },
        ],
      },
    ],
  },
  data: {
    label: "Data",
    icon: "database",
    description: "Export, clear, or reset what OwlTabs stores in this browser.",
    parts: [{ kind: "custom", render: renderDataCustom, init: initDataCustom }],
  },
};

let currentSettings: SyncStorageSettings;

// ── Helpers ──

function getVal(o: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (a, b) => (a != null && typeof a === "object" ? (a as Record<string, unknown>)[b] : undefined),
    o,
  );
}

function makePatch(key: string, value: unknown, ctx: unknown): Partial<SyncStorageSettings> {
  const [head, ...rest] = key.split(".");
  if (!rest.length) return { [head]: value } as Partial<SyncStorageSettings>;
  const sub = (ctx as Record<string, unknown> | undefined)?.[head];
  return {
    [head]: {
      ...((sub as object) || {}),
      ...makePatch(rest.join("."), value, sub),
    },
  } as Partial<SyncStorageSettings>;
}

let savedTimer: ReturnType<typeof setTimeout> | undefined;

/** Quiet confirmation in the drawer header instead of a toast per change. */
function flashSaved(): void {
  const el = $("#nt-settings-status") as HTMLElement | null;
  if (!el) return;
  el.classList.add("is-visible");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove("is-visible"), 1600);
}

async function save(patch: Partial<SyncStorageSettings>): Promise<void> {
  await storage.saveSettings(patch);
  currentSettings = await storage.getSettings();
  flashSaved();
}

async function saveField(key: string, value: unknown): Promise<void> {
  await save(makePatch(key, value, currentSettings));
}

function domId(key: string): string {
  return `s-${key.replace(/\./g, "-")}`;
}

function rowText(label: string, hint?: string, forId?: string): string {
  return `
    <div class="set-text">
      ${forId ? `<label class="set-label" for="${forId}">${label}</label>` : `<div class="set-label">${label}</div>`}
      ${hint ? `<div class="set-hint">${hint}</div>` : ""}
    </div>`;
}

function segmentHtml(name: string, options: Option[], current: string, label: string): string {
  return `
    <div class="seg" role="radiogroup" aria-label="${escapeHtml(label)}" data-seg="${escapeHtml(name)}">
      ${options.map((o) => `
        <button type="button" role="radio" class="seg-item" data-value="${escapeHtml(o.value)}" aria-checked="${o.value === current}">
          ${escapeHtml(o.label)}
        </button>`).join("")}
    </div>`;
}

function selectHtml(id: string, options: Option[], current: string, attrs = ""): string {
  return `
    <div class="select">
      <select class="field" id="${id}" ${attrs}>
        ${options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === current ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
      </select>
      ${svgIcon("chevron-down", 14)}
    </div>`;
}

function toggleHtml(id: string, checked: boolean, label: string, attrs = ""): string {
  return `<input type="checkbox" role="switch" class="toggle-switch" id="${id}" aria-label="${escapeHtml(label)}" ${checked ? "checked" : ""} ${attrs} />`;
}

function renderField(f: FieldDef): string {
  if (f.visible && !f.visible(currentSettings)) return "";
  const val = getVal(currentSettings, f.key);
  const id = domId(f.key);
  const str = val == null ? "" : String(val);

  switch (f.type) {
    case "segment":
      return `
        <div class="set-row">
          ${rowText(f.label, f.hint)}
          <div class="set-control">${segmentHtml(f.key, f.options ?? [], str, f.label)}</div>
        </div>`;
    case "select":
      return `
        <div class="set-row">
          ${rowText(f.label, f.hint, id)}
          <div class="set-control">${selectHtml(id, f.options ?? [], str, `data-key="${f.key}"`)}</div>
        </div>`;
    case "toggle":
      return `
        <div class="set-row">
          ${rowText(f.label, f.hint, id)}
          <div class="set-control">${toggleHtml(id, !!val, f.label, `data-key="${f.key}"`)}</div>
        </div>`;
    case "text":
      return `
        <div class="set-row set-row--stack">
          ${rowText(f.label, f.hint, id)}
          <input class="field" id="${id}" data-key="${f.key}" type="text" value="${escapeHtml(str)}" placeholder="${escapeHtml(f.placeholder ?? "")}" />
        </div>`;
    case "textarea":
      return `
        <div class="set-row set-row--stack">
          ${rowText(f.label, f.hint, id)}
          <textarea class="field" id="${id}" data-key="${f.key}" rows="${f.rows ?? 3}" placeholder="${escapeHtml(f.placeholder ?? "")}">${escapeHtml(str)}</textarea>
        </div>`;
  }
}

function initField(f: FieldDef): void {
  if (f.visible && !f.visible(currentSettings)) return;
  const parse = f.parse ?? ((v: string) => v);

  if (f.type === "segment") {
    const seg = document.querySelector<HTMLElement>(`[data-seg="${CSS.escape(f.key)}"]`);
    seg?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".seg-item");
      if (!btn || btn.getAttribute("aria-checked") === "true") return;
      seg.querySelectorAll(".seg-item").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      void saveField(f.key, parse(btn.dataset.value!));
    });
    return;
  }

  const el = document.getElementById(domId(f.key)) as HTMLInputElement | null;
  if (!el) return;
  if (f.type === "toggle") {
    el.addEventListener("change", () => void saveField(f.key, el.checked));
  } else {
    el.addEventListener("change", () => void saveField(f.key, parse(el.value)));
  }
}

function renderPart(part: Part): string {
  if (part.kind === "custom") return part.render();
  const rows = part.fields.map(renderField).join("");
  if (!rows) return "";
  return `
    <section class="set-group">
      ${part.title ? `<h3 class="set-group-title">${part.title}</h3>` : ""}
      <div class="set-card">${rows}</div>
    </section>`;
}

function initPart(part: Part): void {
  if (part.kind === "custom") part.init();
  else part.fields.forEach(initField);
}

// Section currently open in the drawer; kept across re-renders so a save
// doesn't reset the drawer to the first section.
let activeSection: string | null = null;
let subscribed = false;

function navigateToSection(id: string) {
  const def = SECTIONS[id];
  if (!def) return;
  const body = $("#nt-settings-body") as HTMLElement | null;
  if (!body) return;
  if (activeSection !== id) body.scrollTop = 0;
  activeSection = id;
  document.querySelectorAll<HTMLElement>(".settings-navitem").forEach((b) => {
    const active = b.dataset.section === id;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });

  body.innerHTML = `
    <header class="set-section-head">
      <h2>${def.label}</h2>
      <p>${def.description}</p>
    </header>
    ${def.parts.map(renderPart).join("")}
  `;
  def.parts.forEach(initPart);
}

/**
 * Saving re-renders the open section. Remember which control had focus so
 * keyboard users stay where they were.
 */
function rememberFocus(body: HTMLElement): () => void {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !body.contains(active)) return () => {};
  const seg = active.closest<HTMLElement>("[data-seg]")?.dataset.seg;
  const value = active.dataset.value;
  const id = active.id;
  const action = active.dataset.action;
  const dataId = active.dataset.id;
  return () => {
    let el: HTMLElement | null = null;
    if (id) el = document.getElementById(id);
    else if (seg && value) el = body.querySelector(`[data-seg="${CSS.escape(seg)}"] [data-value="${CSS.escape(value)}"]`);
    else if (action && dataId) el = body.querySelector(`[data-action="${action}"][data-id="${CSS.escape(dataId)}"]`);
    el?.focus({ preventScroll: true });
  };
}

// ── Public API ──

/** Open the drawer on a given section, e.g. from the feed's empty state. */
export function openSettings(sectionId: string): void {
  uiStore.set((s) => ({ ...s, settingsOpen: true }));
  navigateToSection(sectionId);
}

export function renderSettingsDrawer(settings: SyncStorageSettings) {
  currentSettings = settings;
  const drawer = $("#nt-settings") as HTMLElement;
  if (!drawer) return;

  // Already built: only refresh the open section, keeping its scroll position.
  if (drawer.querySelector("#nt-settings-body")) {
    if (activeSection) {
      const body = $("#nt-settings-body") as HTMLElement;
      const scroll = body.scrollTop;
      const restoreFocus = rememberFocus(body);
      navigateToSection(activeSection);
      body.scrollTop = scroll;
      restoreFocus();
    }
    return;
  }

  drawer.innerHTML = `
    <header class="settings-header">
      <h2 class="settings-title">Settings</h2>
      <span class="settings-status" id="nt-settings-status" aria-live="polite">${svgIcon("check", 13)} Saved</span>
      <button class="nt-icon-btn" id="nt-settings-close" aria-label="Close settings" title="Close (Esc)">
        ${svgIcon("close", 18)}
      </button>
    </header>
    <nav class="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
      ${Object.entries(SECTIONS)
        .map(
          ([id, s]) => `
        <button class="settings-navitem" role="tab" data-section="${id}">
          ${svgIcon(s.icon, 15)}<span>${s.label}</span>
        </button>`,
        )
        .join("")}
    </nav>
    <div class="settings-body" id="nt-settings-body" role="tabpanel"></div>
  `;

  $("#nt-settings-close")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, settingsOpen: false }));
  });

  const nav = drawer.querySelector<HTMLElement>(".settings-nav")!;
  nav.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".settings-navitem");
    if (btn) navigateToSection(btn.dataset.section!);
  });
  // Arrow keys move between sections, as in any tab list.
  nav.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const ids = Object.keys(SECTIONS);
    const i = ids.indexOf(activeSection ?? ids[0]);
    const next = ids[(i + (e.key === "ArrowDown" ? 1 : ids.length - 1)) % ids.length];
    navigateToSection(next);
    nav.querySelector<HTMLElement>(`[data-section="${next}"]`)?.focus();
  });

  if (!subscribed) {
    subscribed = true;
    let wasOpen = false;
    uiStore.subscribe((s) => {
      drawer.classList.toggle("is-open", s.settingsOpen);
      drawer.hidden = false;
      updateBackdrop();
      if (s.settingsOpen && !wasOpen) {
        requestAnimationFrame(() => drawer.querySelector<HTMLElement>(".settings-navitem.active")?.focus());
      }
      wasOpen = s.settingsOpen;
    });
  }

  navigateToSection(Object.keys(SECTIONS)[0]);
}

// ── Favicons for list rows ──

/** Swap `[data-favicon-domain]` placeholders for real favicons once resolved. */
function fillFavicons(): void {
  const slots = [...document.querySelectorAll<HTMLElement>("#nt-settings-body [data-favicon-domain]")];
  const domains = [...new Set(slots.map((s) => s.dataset.faviconDomain!).filter(Boolean))];
  if (!domains.length) return;
  void resolveFavicons(domains).then((map) => {
    for (const slot of slots) {
      const src = map.get(slot.dataset.faviconDomain!);
      if (!src || !slot.isConnected) continue;
      slot.innerHTML = `<img src="${escapeHtml(src)}" alt="" width="14" height="14" />`;
      slot.classList.add("has-img");
    }
  });
}

function faviconSlot(url: string, label: string): string {
  return `<span class="set-favicon" data-favicon-domain="${escapeHtml(getDomain(url))}" aria-hidden="true">${escapeHtml(label.charAt(0).toUpperCase())}</span>`;
}

// ── Custom: Quick Links ──

function renderQuickLinksCustom(): string {
  const links = currentSettings.quickLinks;
  const full = links.length >= MAX_QUICK_LINKS;
  return `
    <section class="set-group">
      <h3 class="set-group-title">Your links <span class="set-count">${links.length} of ${MAX_QUICK_LINKS}</span></h3>
      <div class="set-card">
        ${links.length ? links.map((l) => `
          <div class="set-row set-item">
            ${faviconSlot(l.url, l.label)}
            <div class="set-text">
              <div class="set-label">${escapeHtml(l.label)}</div>
              <div class="set-hint set-url">${escapeHtml(l.url.replace(/^https?:\/\//, ""))}</div>
            </div>
            <button class="set-icon-btn danger" data-action="remove-ql" data-id="${escapeHtml(l.id)}" aria-label="Remove ${escapeHtml(l.label)}" title="Remove">
              ${svgIcon("trash", 14)}
            </button>
          </div>`).join("") : `<div class="set-empty">No quick links yet.</div>`}
      </div>
    </section>
    <section class="set-group">
      <h3 class="set-group-title">Add a link</h3>
      <form class="set-card set-form" id="ql-settings-form">
        <div class="set-form-grid">
          <div class="set-field">
            <label for="ql-settings-url">URL</label>
            <input class="field" id="ql-settings-url" type="text" placeholder="github.com" autocomplete="off" ${full ? "disabled" : ""} />
          </div>
          <div class="set-field">
            <label for="ql-settings-label">Name <span>optional</span></label>
            <input class="field" id="ql-settings-label" type="text" placeholder="Uses the site name" autocomplete="off" ${full ? "disabled" : ""} />
          </div>
        </div>
        <div class="set-form-foot">
          <span class="set-form-error" id="ql-settings-error" role="alert">${full ? `You can pin up to ${MAX_QUICK_LINKS} links. Remove one to add another.` : ""}</span>
          <button class="btn btn-primary btn-sm" type="submit" ${full ? "disabled" : ""}>${svgIcon("plus", 13)} Add link</button>
        </div>
      </form>
    </section>
  `;
}

function initQuickLinksCustom() {
  fillFavicons();
  const form = $("#ql-settings-form") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urlEl = $("#ql-settings-url") as HTMLInputElement;
    const labelEl = $("#ql-settings-label") as HTMLInputElement;
    const errorEl = $("#ql-settings-error") as HTMLElement;
    let url = urlEl.value.trim();
    if (!url) {
      errorEl.textContent = "Enter a URL.";
      urlEl.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      errorEl.textContent = "That URL isn't valid.";
      urlEl.focus();
      return;
    }
    const label = labelEl.value.trim() || host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
    await save({
      quickLinks: [...currentSettings.quickLinks, { id: `ql-${Date.now()}`, url, label }],
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-action='remove-ql']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const before = currentSettings.quickLinks;
      await save({ quickLinks: before.filter((l) => l.id !== id) });
      showToast("Link removed", "accent", {
        label: "Undo",
        onClick: () => void save({ quickLinks: before }),
      });
    });
  });
}

// ── Custom: Feeds ──

// The feed whose options are expanded; survives the re-render that follows a save.
let expandedFeedId: string | null = null;

function feedRow(f: FeedConfig): string {
  const open = expandedFeedId === f.id;
  const id = escapeHtml(f.id);
  const interval = String(f.refreshIntervalMins ?? 30);
  return `
    <div class="set-feed${open ? " is-open" : ""}${f.enabled ? "" : " is-off"}" data-feed="${id}">
      <div class="set-row set-item">
        ${faviconSlot(f.url, f.label)}
        <button class="set-feed-summary" data-action="expand-feed" aria-expanded="${open}" aria-controls="feed-opts-${id}">
          <span class="set-label">${escapeHtml(f.label)}</span>
          <span class="set-hint set-url">${escapeHtml(getDomain(f.url))}${f.category ? `<span class="set-tag">${escapeHtml(f.category)}</span>` : ""}</span>
        </button>
        ${toggleHtml(`feed-on-${id}`, f.enabled, `Show ${f.label} in your feed`, `data-action="toggle-feed" data-id="${id}"`)}
        <button class="set-icon-btn set-chevron" data-action="expand-feed" aria-label="Options for ${escapeHtml(f.label)}" aria-expanded="${open}">
          ${svgIcon("chevron-down", 15)}
        </button>
      </div>
      <div class="set-feed-opts" id="feed-opts-${id}" ${open ? "" : "hidden"}>
        <div class="set-form-grid">
          <div class="set-field">
            <label for="feed-interval-${id}">Check for new articles</label>
            ${selectHtml(`feed-interval-${id}`, REFRESH_INTERVALS, interval, `data-action="feed-interval" data-id="${id}"`)}
          </div>
          <div class="set-field">
            <label for="feed-max-${id}">Keep up to</label>
            <div class="field-suffix">
              <input type="number" class="field" id="feed-max-${id}" data-action="max-articles" data-id="${id}" value="${f.maxArticles ?? 20}" min="1" max="200" />
              <span>articles</span>
            </div>
          </div>
        </div>
        <div class="set-feed-url">
          <span title="${escapeHtml(f.url)}">${escapeHtml(f.url)}</span>
          <button class="btn btn-ghost btn-sm danger-text" data-action="remove-feed" data-id="${id}">
            ${svgIcon("trash", 13)} Remove
          </button>
        </div>
      </div>
    </div>`;
}

function renderFeedsCustom(): string {
  const feeds = currentSettings.feedsConfig;
  const have = new Set(feeds.map((f) => f.url));
  const catalog = Object.entries(PUBLIC_FEED_CATALOG).flatMap(([cat, list]) =>
    list.map((f) => ({ ...f, cat })),
  );
  const enabled = feeds.filter((f) => f.enabled).length;

  return `
    <section class="set-group">
      <h3 class="set-group-title">Your feeds <span class="set-count">${enabled} of ${feeds.length} on</span></h3>
      <div class="set-card">
        ${feeds.length ? feeds.map(feedRow).join("") : `<div class="set-empty">No feeds yet. Add one below.</div>`}
      </div>
    </section>

    <section class="set-group">
      <h3 class="set-group-title">Add a feed</h3>
      <form class="set-card set-form" id="feed-settings-form">
        <div class="set-field">
          <label for="feed-settings-url">Feed URL</label>
          <input class="field" id="feed-settings-url" type="text" placeholder="https://example.com/feed.xml" autocomplete="off" />
        </div>
        <div class="set-form-grid">
          <div class="set-field">
            <label for="feed-settings-label">Name <span>optional</span></label>
            <input class="field" id="feed-settings-label" type="text" placeholder="Uses the site name" autocomplete="off" />
          </div>
          <div class="set-field">
            <label for="feed-settings-category">Topic <span>optional</span></label>
            <input class="field" id="feed-settings-category" type="text" placeholder="tech" list="feed-topics" autocomplete="off" />
            <datalist id="feed-topics">
              ${[...new Set(feeds.map((f) => f.category).filter(Boolean))].map((c) => `<option value="${escapeHtml(c)}"></option>`).join("")}
            </datalist>
          </div>
        </div>
        <div class="set-form-foot">
          <span class="set-form-error" id="feed-settings-error" role="alert"></span>
          <button class="btn btn-primary btn-sm" type="submit">${svgIcon("plus", 13)} Add feed</button>
        </div>
      </form>
    </section>

    <section class="set-group">
      <h3 class="set-group-title">Suggested</h3>
      <div class="set-card">
        ${catalog.map((f) => `
          <div class="set-row set-item">
            ${faviconSlot(f.url, f.label)}
            <div class="set-text">
              <div class="set-label">${escapeHtml(f.label)}</div>
              <div class="set-hint set-url">${escapeHtml(getDomain(f.url))}<span class="set-tag">${escapeHtml(f.cat)}</span></div>
            </div>
            ${have.has(f.url)
              ? `<span class="set-added">${svgIcon("check", 13)} Added</span>`
              : `<button class="btn btn-secondary btn-sm" data-add-catalog data-url="${escapeHtml(f.url)}" data-label="${escapeHtml(f.label)}" data-cat="${escapeHtml(f.cat)}">Add</button>`}
          </div>`).join("")}
      </div>
    </section>
  `;
}

async function updateFeed(id: string, patch: Partial<FeedConfig>): Promise<void> {
  await save({
    feedsConfig: currentSettings.feedsConfig.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  });
}

function initFeedsCustom() {
  fillFavicons();
  const body = $("#nt-settings-body") as HTMLElement;

  body.querySelectorAll<HTMLButtonElement>("[data-action='expand-feed']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest<HTMLElement>(".set-feed")!;
      const id = row.dataset.feed!;
      const open = !row.classList.contains("is-open");
      expandedFeedId = open ? id : null;
      // Only one feed's options show at a time.
      body.querySelectorAll<HTMLElement>(".set-feed.is-open").forEach((r) => {
        if (r === row) return;
        r.classList.remove("is-open");
        r.querySelector<HTMLElement>(".set-feed-opts")!.hidden = true;
        r.querySelectorAll("[aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false"));
      });
      row.classList.toggle("is-open", open);
      row.querySelector<HTMLElement>(".set-feed-opts")!.hidden = !open;
      row.querySelectorAll("[aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
    });
  });

  body.querySelectorAll<HTMLInputElement>("[data-action='toggle-feed']").forEach((input) => {
    input.addEventListener("change", () => void updateFeed(input.dataset.id!, { enabled: input.checked }));
  });

  body.querySelectorAll<HTMLSelectElement>("[data-action='feed-interval']").forEach((select) => {
    select.addEventListener("change", () =>
      void updateFeed(select.dataset.id!, {
        refreshIntervalMins: Number(select.value) as FeedConfig["refreshIntervalMins"],
      }),
    );
  });

  body.querySelectorAll<HTMLInputElement>("[data-action='max-articles']").forEach((input) => {
    input.addEventListener("change", () => {
      const n = parseInt(input.value, 10);
      const value = Math.max(1, Math.min(200, Number.isNaN(n) ? 20 : n));
      input.value = String(value);
      void updateFeed(input.dataset.id!, { maxArticles: value });
    });
  });

  body.querySelectorAll<HTMLButtonElement>("[data-action='remove-feed']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const before = currentSettings.feedsConfig;
      const removed = before.find((f) => f.id === btn.dataset.id);
      expandedFeedId = null;
      await save({ feedsConfig: before.filter((f) => f.id !== btn.dataset.id) });
      showToast(`Removed ${removed?.label ?? "feed"}`, "accent", {
        label: "Undo",
        onClick: () => void save({ feedsConfig: before }),
      });
    });
  });

  body.querySelectorAll<HTMLButtonElement>("[data-add-catalog]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await addFeed({
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: btn.dataset.url!,
        label: btn.dataset.label!,
        category: btn.dataset.cat!,
        enabled: true,
        refreshIntervalMins: 60,
        maxArticles: 32,
      });
    });
  });

  ($("#feed-settings-form") as HTMLFormElement | null)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urlEl = $("#feed-settings-url") as HTMLInputElement;
    const labelEl = $("#feed-settings-label") as HTMLInputElement;
    const catEl = $("#feed-settings-category") as HTMLInputElement;
    const errorEl = $("#feed-settings-error") as HTMLElement;
    let url = urlEl.value.trim();
    if (!url) {
      errorEl.textContent = "Enter the feed's URL.";
      urlEl.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    let hostname: string;
    try {
      hostname = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      errorEl.textContent = "That URL isn't valid.";
      urlEl.focus();
      return;
    }
    if (currentSettings.feedsConfig.some((f) => f.url === url)) {
      errorEl.textContent = "You already follow this feed.";
      return;
    }
    await addFeed({
      id: `feed-${Date.now()}`,
      url,
      label: labelEl.value.trim() || hostname,
      category: catEl.value.trim() || "general",
      enabled: true,
      refreshIntervalMins: 60,
      maxArticles: 32,
    });
  });
}

export async function addFeed(feed: FeedConfig): Promise<void> {
  if (currentSettings.feedsConfig.some((f) => f.url === feed.url)) {
    showToast("You already follow this feed", "red");
    return;
  }
  await save({ feedsConfig: [...currentSettings.feedsConfig, feed] });
  showToast(`Added ${feed.label}`, "mint");
}

// ── Custom: AI key ──

function renderAIKeyCustom(): string {
  const ai = currentSettings.ai;
  return `
    <section class="set-group">
      <h3 class="set-group-title">Gemini API key</h3>
      <form class="set-card set-form" id="ai-key-form">
        <div class="set-field">
          <label for="ai-key">API key</label>
          <div class="field-group">
            <input class="field" id="ai-key" type="password" value="${escapeHtml(ai.geminiKey)}" placeholder="Paste your key" autocomplete="off" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" type="button" id="ai-key-show" aria-pressed="false">Show</button>
          </div>
          <div class="set-hint">Stored in your browser's sync storage. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.</div>
        </div>
        <div class="set-form-foot">
          <span class="set-status" id="ai-test-result" role="status"></span>
          <button class="btn btn-secondary btn-sm" type="button" id="ai-test" ${ai.geminiKey ? "" : "disabled"}>Test connection</button>
          <button class="btn btn-primary btn-sm" type="submit">Save key</button>
        </div>
      </form>
    </section>
  `;
}

function initAIKeyCustom() {
  const keyInput = $("#ai-key") as HTMLInputElement;
  const showBtn = $("#ai-key-show") as HTMLButtonElement;

  showBtn.addEventListener("click", () => {
    const show = keyInput.type === "password";
    keyInput.type = show ? "text" : "password";
    showBtn.textContent = show ? "Hide" : "Show";
    showBtn.setAttribute("aria-pressed", String(show));
  });

  ($("#ai-key-form") as HTMLFormElement).addEventListener("submit", async (e) => {
    e.preventDefault();
    await save({ ai: { ...currentSettings.ai, geminiKey: keyInput.value.trim() } });
  });

  $("#ai-test")?.addEventListener("click", async () => {
    const resultEl = $("#ai-test-result") as HTMLElement;
    resultEl.className = "set-status";
    resultEl.textContent = "Testing…";
    try {
      const key = currentSettings.ai.geminiKey;
      if (!key) throw new Error("Save a key first");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${currentSettings.ai.model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hi" }] }] }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Request failed (${res.status})`);
      }
      resultEl.classList.add("is-ok");
      resultEl.innerHTML = `${svgIcon("check", 13)} Connected`;
    } catch (err) {
      resultEl.classList.add("is-error");
      resultEl.textContent = err instanceof Error ? err.message : "Connection failed";
    }
  });
}

// ── Custom: Accent ──

function renderAccentCustom(): string {
  const current = currentSettings.appearance.accentColor.toUpperCase();
  const isPreset = ACCENTS.some((a) => a.value === current);
  return `
    <section class="set-group">
      <div class="set-card">
        <div class="set-row">
          ${rowText("Accent color", "Used for focus, selection, and saved articles.")}
          <div class="set-control swatches" role="radiogroup" aria-label="Accent color">
            ${ACCENTS.map((a) => `
              <button type="button" role="radio" class="swatch" data-accent="${a.value}" style="--swatch:${a.value}" aria-checked="${a.value === current}" aria-label="${a.label}" title="${a.label}"></button>`).join("")}
            <label class="swatch swatch--custom${isPreset ? "" : " is-custom"}" title="Custom color" style="--swatch:${escapeHtml(current)}">
              <input type="color" id="accent-custom" value="${escapeHtml(current.toLowerCase())}" aria-label="Custom accent color" />
              ${svgIcon("plus", 12)}
            </label>
          </div>
        </div>
      </div>
    </section>
  `;
}

function initAccentCustom() {
  const apply = async (color: string) => {
    document.documentElement.style.setProperty("--accent", color);
    await saveField("appearance.accentColor", color.toUpperCase());
  };
  document.querySelectorAll<HTMLButtonElement>("[data-accent]").forEach((btn) => {
    btn.addEventListener("click", () => void apply(btn.dataset.accent!));
  });
  const custom = $("#accent-custom") as HTMLInputElement | null;
  // Preview live while dragging; save once a color is picked.
  custom?.addEventListener("input", () => document.documentElement.style.setProperty("--accent", custom.value));
  custom?.addEventListener("change", () => void apply(custom.value));
}

// ── Custom: Data ──

function renderDataCustom(): string {
  return `
    <section class="set-group">
      <div class="set-card">
        <div class="set-row">
          ${rowText("Export saved articles", "Download everything you've saved as a JSON file.")}
          <div class="set-control"><button class="btn btn-secondary btn-sm" id="data-export">${svgIcon("download", 13)} Export</button></div>
        </div>
        <div class="set-row">
          ${rowText("Clear feed cache", "Removes stored articles; feeds load fresh on the next refresh. Saved articles are kept.")}
          <div class="set-control"><button class="btn btn-secondary btn-sm" id="data-clear-cache">Clear cache</button></div>
        </div>
      </div>
    </section>
    <section class="set-group">
      <h3 class="set-group-title">Danger zone</h3>
      <div class="set-card set-card--danger">
        <div class="set-row">
          ${rowText("Reset all settings", "Restores defaults for feeds, quick links, AI, and appearance. Saved articles are kept.")}
          <div class="set-control"><button class="btn btn-sm btn-danger" id="data-reset">Reset</button></div>
        </div>
      </div>
    </section>
  `;
}

function initDataCustom() {
  $("#data-export")?.addEventListener("click", async () => {
    const saved = await storage.getSavedArticles();
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owltabs-saved-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${saved.length} saved ${saved.length === 1 ? "article" : "articles"}`, "mint");
  });

  $("#data-clear-cache")?.addEventListener("click", async () => {
    await chrome.storage.local.remove(KEYS.FEED_CACHE);
    showToast("Feed cache cleared", "mint");
  });

  // Two-step confirm in place of a native dialog: first click arms, second resets.
  const reset = $("#data-reset") as HTMLButtonElement | null;
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  reset?.addEventListener("click", async () => {
    if (!reset.classList.contains("is-armed")) {
      reset.classList.add("is-armed");
      reset.textContent = "Click again to reset";
      armTimer = setTimeout(() => {
        reset.classList.remove("is-armed");
        reset.textContent = "Reset";
      }, 4000);
      return;
    }
    clearTimeout(armTimer);
    await chrome.storage.sync.clear();
    await chrome.storage.local.remove(KEYS.FEED_CACHE);
    location.reload();
  });
}

// ── Backdrop helper ──

function updateBackdrop() {
  const backdrop = $("#nt-backdrop") as HTMLElement;
  const anyOpen = uiStore.get().settingsOpen;
  backdrop.hidden = !anyOpen;
  requestAnimationFrame(() => {
    backdrop.classList.toggle("is-visible", anyOpen);
  });
}
