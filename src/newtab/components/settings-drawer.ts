import type { SyncStorageSettings, FeedConfig } from "../state/types";
import { uiStore } from "../state/store";
import { storage } from "../services/storage";
import { KEYS } from "../services/keys";
import { $, escapeHtml, svgIcon, showToast } from "../utils";

// ── Types ──

type FieldDef = {
  key: string;
  label: string;
  type: "radio" | "toggle" | "range" | "text" | "textarea";
  options?: { label: string; value: string }[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  formatDisplay?: (v: any) => string;
  visible?: (s: SyncStorageSettings) => boolean;
};

type SectionDef = {
  label: string;
  fields: FieldDef[];
  renderCustom?: () => string;
  initCustom?: () => void;
};

// ── Constants ──

const PUBLIC_FEED_CATALOG: Record<string, { label: string; url: string }[]> = {
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

const SECTIONS: Record<string, SectionDef> = {
  search: {
    label: "Search",
    fields: [
      {
        key: "searchEngine",
        label: "Search Engine",
        type: "radio",
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
        label: "Custom URL",
        type: "text",
        placeholder: "https://example.com/search?q={query}",
        visible: (s) => s.searchEngine === "custom",
      },
      {
        key: "openLinksIn",
        label: "Open links in",
        type: "radio",
        options: [
          { label: "New tab", value: "new_tab" },
          { label: "Same tab", value: "same_tab" },
        ],
      },
      {
        key: "openFeedLinksIn",
        label: "Open feed links in",
        type: "radio",
        options: [
          { label: "New tab", value: "new_tab" },
          { label: "Same tab", value: "same_tab" },
        ],
      },
    ],
  },
  quicklinks: {
    label: "Quick Links",
    fields: [],
    renderCustom: renderQuickLinksCustom,
    initCustom: initQuickLinksCustom,
  },
  feeds: {
    label: "RSS Feeds",
    fields: [],
    renderCustom: renderFeedsCustom,
    initCustom: initFeedsCustom,
  },
  ai: {
    label: "AI Assistant",
    fields: [
      { key: "ai.enabled", label: "AI Features", type: "toggle" },
      {
        key: "ai.model",
        label: "Model",
        type: "radio",
        options: [
          { label: "gemini-3.5-flash", value: "gemini-3.5-flash" },
          { label: "gemini-3.1-flash-lite", value: "gemini-3.1-flash-lite" },
          { label: "gemini-2.5-pro", value: "gemini-2.5-pro" },
          { label: "gemini-2.5-flash", value: "gemini-2.5-flash" },
          { label: "gemini-2.5-flash-lite", value: "gemini-2.5-flash-lite" },
        ],
      },
      {
        key: "ai.systemPrompt",
        label: "System Prompt",
        type: "textarea",
        rows: 4,
        placeholder: "Optional custom instructions",
      },
    ],
    renderCustom: renderAICustom,
    initCustom: initAICustom,
  },
  appearance: {
    label: "Appearance",
    fields: [
      {
        key: "appearance.fontScale",
        label: "Font scale",
        type: "range",
        min: 0.9,
        max: 1.2,
        step: 0.1,
        formatDisplay: (v) => `${v}x`,
      },
      {
        key: "appearance.feedColumns",
        label: "Feed columns",
        type: "radio",
        options: [
          { label: "2", value: "2" },
          { label: "3", value: "3" },
          { label: "4", value: "4" },
        ],
      },
      { key: "appearance.showClock", label: "Show clock", type: "toggle" },
      {
        key: "appearance.clockFormat",
        label: "Clock format",
        type: "radio",
        options: [
          { label: "12h", value: "12" },
          { label: "24h", value: "24" },
        ],
      },
      {
        key: "appearance.showQuickLinks",
        label: "Show quick links",
        type: "toggle",
      },
      {
        key: "appearance.grayscale",
        label: "Grayscale mode",
        type: "toggle",
      },
    ],
    renderCustom: renderAppearanceCustom,
    initCustom: initAppearanceCustom,
  },
  data: {
    label: "Data",
    fields: [],
    renderCustom: renderDataCustom,
    initCustom: initDataCustom,
  },
};

let currentSettings: SyncStorageSettings;

// ── Helpers ──

function getVal(o: any, key: string): any {
  return key.split(".").reduce((a, b) => (a != null ? a[b] : undefined), o);
}

function makePatch(key: string, value: any, ctx: any): any {
  const [head, ...rest] = key.split(".");
  if (!rest.length) return { [head]: value };
  return {
    [head]: {
      ...(ctx?.[head] || {}),
      ...makePatch(rest.join("."), value, ctx?.[head]),
    },
  };
}

function applyAppearance() {
  const a = currentSettings.appearance;
  if (a) {
    document.documentElement.style.setProperty("--accent", a.accentColor);
    document.documentElement.style.setProperty(
      "--feed-cols",
      String(a.feedColumns),
    );
    document.documentElement.style.setProperty(
      "font-size",
      `${a.fontScale * 100}%`,
    );
  }
}

async function saveField(key: string, value: any) {
  const patch = makePatch(key, value, currentSettings);
  await storage.saveSettings(patch);
  currentSettings = await storage.getSettings();
  applyAppearance();
  navigateToMain();
  showToast("Saved", "mint");
}

function renderField(f: FieldDef): string | null {
  if (f.visible && !f.visible(currentSettings)) return null;
  const val = getVal(currentSettings, f.key);
  const domId = `s-${f.key.replace(/\./g, "-")}`;

  switch (f.type) {
    case "radio":
      return `
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
          <div class="settings-row-label">${f.label}</div>
          <div class="radio-group">
            ${(f.options || [])
              .map(
                (o) => `
              <label class="radio-label">
                <input type="radio" name="${f.key}" value="${o.value}" ${val === o.value ? "checked" : ""} />
                ${o.label}
              </label>
            `,
              )
              .join("")}
          </div>
          ${f.hint ? `<div class="settings-row-hint">${f.hint}</div>` : ""}
        </div>`;

    case "toggle":
      return `
        <div class="settings-row">
          <div class="settings-row-label">${f.label}</div>
          <input type="checkbox" class="toggle-switch" data-key="${f.key}" ${val ? "checked" : ""} />
        </div>`;

    case "range":
      return `
        <div class="settings-row">
          <div class="settings-row-label">${f.label}</div>
          <input type="range" id="${domId}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" />
          <span id="${domId}-display">${f.formatDisplay ? f.formatDisplay(val) : val}</span>
        </div>`;

    case "text":
      return `
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
          <div class="settings-row-label">${f.label}</div>
          <input class="field" data-key="${f.key}" type="text" value="${escapeHtml(String(val ?? ""))}" placeholder="${f.placeholder ?? ""}" />
        </div>`;

    case "textarea":
      return `
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
          <div class="settings-row-label">${f.label}</div>
          <textarea class="field" data-key="${f.key}" rows="${f.rows ?? 3}" placeholder="${f.placeholder ?? ""}">${escapeHtml(String(val ?? ""))}</textarea>
        </div>`;
  }
}

function initField(f: FieldDef): void {
  const domId = `s-${f.key.replace(/\./g, "-")}`;

  switch (f.type) {
    case "radio":
      document.querySelectorAll(`input[name="${f.key}"]`).forEach((el) => {
        el.addEventListener("change", () => {
          saveField(f.key, (el as HTMLInputElement).value);
        });
      });
      break;

    case "toggle": {
      const el = document.querySelector(
        `[data-key="${f.key}"]`,
      ) as HTMLInputElement | null;
      el?.addEventListener("change", () => saveField(f.key, el.checked));
      break;
    }

    case "range": {
      const el = document.getElementById(domId) as HTMLInputElement | null;
      if (!el) break;
      el.addEventListener("input", () => {
        const display = document.getElementById(`${domId}-display`);
        if (display)
          display.textContent = f.formatDisplay
            ? f.formatDisplay(el.value)
            : el.value;
      });
      el.addEventListener("change", () =>
        saveField(f.key, parseFloat(el.value)),
      );
      break;
    }

    case "text":
    case "textarea": {
      const el = document.querySelector(
        `[data-key="${f.key}"]`,
      ) as HTMLInputElement | null;
      el?.addEventListener("change", () => saveField(f.key, el.value));
      break;
    }
  }
}

function navigateToMain() {
  const body = $("#nt-settings-body") as HTMLElement | null;
  if (!body) return;
  document
    .querySelectorAll(".settings-navitem")
    .forEach((b) => b.classList.remove("active"));
  body.innerHTML = `
    <div class="settings-section active">
      <div style="padding:var(--sp-12) var(--sp-4);text-align:center;color:var(--text-tertiary);font-size:13px">
        Select a section from the menu above to adjust your settings.
      </div>
    </div>
  `;
}

function navigateToSection(id: string) {
  const def = SECTIONS[id];
  if (!def) return;
  const body = $("#nt-settings-body") as HTMLElement | null;
  if (!body) return;

  let html = '<div class="settings-section active">';

  for (const f of def.fields) {
    const fhtml = renderField(f);
    if (fhtml) html += fhtml;
  }

  if (def.renderCustom) html += def.renderCustom();

  html += "</div>";
  body.innerHTML = html;

  for (const f of def.fields) initField(f);
  if (def.initCustom) def.initCustom();
}

// ── Public API ──

export function renderSettingsDrawer(settings: SyncStorageSettings) {
  currentSettings = settings;
  const drawer = $("#nt-settings") as HTMLElement;
  if (!drawer) return;

  drawer.innerHTML = `
    <header class="settings-header">
      <h2 class="settings-title">Settings</h2>
      <button class="nt-icon-btn" id="nt-settings-close" aria-label="Close settings">
        ${svgIcon("close", 18)}
      </button>
    </header>
    <nav class="settings-nav">
      ${Object.entries(SECTIONS)
        .map(
          ([id, s]) => `
        <button class="settings-navitem" data-section="${id}">${s.label}</button>
      `,
        )
        .join("")}
    </nav>
    <div class="settings-body" id="nt-settings-body"></div>
  `;

  $("#nt-settings-close")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, settingsOpen: false }));
  });

  drawer
    .querySelectorAll<HTMLButtonElement>(".settings-navitem")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        drawer
          .querySelectorAll(".settings-navitem")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        navigateToSection(btn.dataset.section || "search");
      });
    });

  uiStore.subscribe((s) => {
    drawer.classList.toggle("is-open", s.settingsOpen);
    drawer.hidden = false;
    updateBackdrop();
  });

  navigateToMain();
}

// ── Custom: Quick Links ──

function renderQuickLinksCustom(): string {
  const links = currentSettings.quickLinks;
  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${links
        .map(
          (l) => `
        <div class="settings-row" style="padding:8px 0">
          <div>
            <div class="settings-row-label">${escapeHtml(l.label)}</div>
            <div class="settings-row-hint">${escapeHtml(l.url)}</div>
          </div>
          <button class="mini-btn danger" data-action="remove-ql" data-id="${escapeHtml(l.id)}">
            ${svgIcon("trash", 14)}
          </button>
        </div>
      `,
        )
        .join("")}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <input class="field" id="ql-settings-url" type="text" placeholder="https://example.com" />
      <input class="field" id="ql-settings-label" type="text" placeholder="Label" />
      <button class="btn btn-primary btn-sm" id="ql-settings-add" style="align-self:flex-end">Add link</button>
    </div>
    <div class="settings-row-hint" style="margin-top:8px">Max 12 links</div>
  `;
}

function initQuickLinksCustom() {
  $("#ql-settings-add")?.addEventListener("click", async () => {
    const urlEl = $("#ql-settings-url") as HTMLInputElement;
    const labelEl = $("#ql-settings-label") as HTMLInputElement;
    let url = urlEl.value.trim();
    const label = labelEl.value.trim();
    if (!url || !label) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (currentSettings.quickLinks.length >= 12) {
      showToast("Max 12 quick links", "red");
      return;
    }
    const updated = [
      ...currentSettings.quickLinks,
      { id: `ql-${Date.now()}`, url, label },
    ];
    await storage.saveSettings({ quickLinks: updated });
    currentSettings = await storage.getSettings();
    navigateToMain();
    showToast("Link added", "mint");
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-action='remove-ql']")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        const updated = currentSettings.quickLinks.filter((l) => l.id !== id);
        await storage.saveSettings({ quickLinks: updated });
        currentSettings = await storage.getSettings();
        navigateToMain();
        showToast("Link removed", "accent");
      });
    });
}

// ── Custom: RSS Feeds ──

function renderFeedsCustom(): string {
  const feeds = currentSettings.feedsConfig;
  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${feeds
        .map(
          (f) => `
        <div class="settings-row" style="padding:8px 0">
          <div>
            <div class="settings-row-label">${escapeHtml(f.label)}</div>
            <div class="settings-row-hint">${escapeHtml(f.url)} · ${escapeHtml(f.category)}</div>
          </div>
          <button class="mini-btn danger" data-action="remove-feed" data-id="${escapeHtml(f.id)}">
            ${svgIcon("trash", 14)}
          </button>
        </div>
      `,
        )
        .join("")}
      ${feeds.length === 0 ? '<div class="settings-row-hint">No feeds configured yet.</div>' : ""}
    </div>

    <div style="border-top:1px solid var(--border-subtle);padding-top:16px;margin-bottom:16px">
      <div class="settings-row-label" style="margin-bottom:8px">Add from catalog</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${Object.keys(PUBLIC_FEED_CATALOG)
          .map(
            (cat) => `
          <button class="chip" data-catalog="${cat}">${escapeHtml(cat)}</button>
        `,
          )
          .join("")}
      </div>
      <div id="catalog-list" style="display:flex;flex-direction:column;gap:6px"></div>
    </div>

    <div style="border-top:1px solid var(--border-subtle);padding-top:16px">
      <div class="settings-row-label" style="margin-bottom:8px">Add custom feed</div>
      <input class="field" id="feed-settings-url" type="text" placeholder="https://example.com/feed.xml" />
      <input class="field" id="feed-settings-label" type="text" placeholder="Label" style="margin-top:8px" />
      <input class="field" id="feed-settings-category" type="text" placeholder="Category (e.g. tech)" style="margin-top:8px" />
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="btn btn-primary btn-sm" id="feed-settings-add">Add feed</button>
      </div>
    </div>
  `;
}

function initFeedsCustom() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-catalog]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.catalog!;
        const list = $("#catalog-list") as HTMLElement;
        const feeds = PUBLIC_FEED_CATALOG[cat] || [];
        list.innerHTML = feeds
          .map(
            (f) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--surface-2);border-radius:var(--r-sm)">
          <span style="font-size:13px">${escapeHtml(f.label)}</span>
          <button class="btn btn-sm btn-ghost" data-add-catalog data-url="${escapeHtml(f.url)}" data-label="${escapeHtml(f.label)}" data-cat="${escapeHtml(cat)}">Add</button>
        </div>
      `,
          )
          .join("");

        document
          .querySelectorAll<HTMLButtonElement>("[data-add-catalog]")
          .forEach((addBtn) => {
            addBtn.addEventListener("click", async () => {
              const url = addBtn.dataset.url!;
              const label = addBtn.dataset.label!;
              const category = addBtn.dataset.cat!;
              await addFeed({
                id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                url,
                label,
                category,
                enabled: true,
                refreshIntervalMins: 60,
              });
            });
          });
      });
    });

  $("#feed-settings-add")?.addEventListener("click", async () => {
    const urlEl = $("#feed-settings-url") as HTMLInputElement;
    const labelEl = $("#feed-settings-label") as HTMLInputElement;
    const catEl = $("#feed-settings-category") as HTMLInputElement;
    const url = urlEl.value.trim();
    const label = labelEl.value.trim() || new URL(url).hostname;
    const category = catEl.value.trim() || "general";
    if (!url) return;
    await addFeed({
      id: `feed-${Date.now()}`,
      url,
      label,
      category,
      enabled: true,
      refreshIntervalMins: 60,
    });
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-action='remove-feed']")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        const updated = currentSettings.feedsConfig.filter((f) => f.id !== id);
        await storage.saveSettings({ feedsConfig: updated });
        currentSettings = await storage.getSettings();
        navigateToMain();
        showToast("Feed removed", "accent");
      });
    });
}

async function addFeed(feed: FeedConfig) {
  if (currentSettings.feedsConfig.some((f) => f.url === feed.url)) {
    showToast("Feed already exists", "red");
    return;
  }
  const updated = [...currentSettings.feedsConfig, feed];
  await storage.saveSettings({ feedsConfig: updated });
  currentSettings = await storage.getSettings();
  navigateToMain();
  showToast("Feed added", "mint");
}

// ── Custom: AI Assistant ──

function renderAICustom(): string {
  const ai = currentSettings.ai;
  return `
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-row-label">Gemini API Key</div>
      <div style="display:flex;gap:8px;width:100%">
        <input class="field" id="ai-key" type="password" value="${escapeHtml(ai.geminiKey)}" placeholder="Enter API key" style="flex:1" />
        <button class="btn btn-ghost btn-sm" id="ai-key-show">Show</button>
        <button class="btn btn-primary btn-sm" id="ai-key-save">Save</button>
      </div>
      <div class="settings-row-hint">
        Get a free key at <a href="https://ai.google.dev" target="_blank" rel="noopener">ai.google.dev</a>
      </div>
    </div>
    <div class="settings-row">
      <button class="btn btn-secondary btn-sm" id="ai-test">Test connection</button>
      <span id="ai-test-result"></span>
    </div>
  `;
}

function initAICustom() {
  const keyInput = $("#ai-key") as HTMLInputElement;

  $("#ai-key-show")?.addEventListener("click", () => {
    keyInput.type = keyInput.type === "password" ? "text" : "password";
  });

  $("#ai-key-save")?.addEventListener("click", async () => {
    await storage.saveSettings({
      ai: { ...currentSettings.ai, geminiKey: keyInput.value.trim() },
    });
    currentSettings = await storage.getSettings();
    navigateToMain();
    showToast("API key saved", "mint");
  });

  $("#ai-test")?.addEventListener("click", async () => {
    const resultEl = $("#ai-test-result") as HTMLElement;
    resultEl.textContent = "Testing…";
    try {
      const key = currentSettings.ai.geminiKey;
      if (!key) throw new Error("No API key");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${currentSettings.ai.model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Hi" }] }],
          }),
        },
      );
      if (res.ok) {
        resultEl.innerHTML = `<span style="color:var(--mint)">✓ Connected</span>`;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      resultEl.innerHTML = `<span style="color:var(--red)">✗ ${escapeHtml(msg)}</span>`;
    }
  });
}

// ── Custom: Appearance ──

function renderAppearanceCustom(): string {
  const app = currentSettings.appearance;
  return `
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-row-label">Accent color</div>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" name="appearance-accent" value="#FFC799" ${app.accentColor === "#FFC799" ? "checked" : ""} /> Default (orange)</label>
        <label class="radio-label"><input type="radio" name="appearance-accent" value="#7EB8FF" ${app.accentColor === "#7EB8FF" ? "checked" : ""} /> Blue</label>
        <label class="radio-label"><input type="radio" name="appearance-accent" value="#C49AFF" ${app.accentColor === "#C49AFF" ? "checked" : ""} /> Purple</label>
        <label class="radio-label"><input type="radio" name="appearance-accent" value="custom" ${!["#FFC799", "#7EB8FF", "#C49AFF"].includes(app.accentColor) ? "checked" : ""} /> Custom</label>
      </div>
      <input class="field" id="accent-custom" type="text" value="${escapeHtml(app.accentColor)}" placeholder="#RRGGBB" style="width:120px" />
    </div>
  `;
}

function initAppearanceCustom() {
  const applyAccent = () => {
    document.documentElement.style.setProperty(
      "--accent",
      currentSettings.appearance.accentColor,
    );
  };

  document.querySelectorAll('input[name="appearance-accent"]').forEach((el) => {
    el.addEventListener("change", async () => {
      const value = (el as HTMLInputElement).value;
      if (value !== "custom") {
        ($("#accent-custom") as HTMLInputElement).value = value;
      }
      const color =
        value === "custom"
          ? ($("#accent-custom") as HTMLInputElement).value
          : value;
      const patch = makePatch("appearance.accentColor", color, currentSettings);
      await storage.saveSettings(patch);
      currentSettings = await storage.getSettings();
      applyAccent();
      navigateToMain();
      showToast("Accent updated", "mint");
    });
  });

  $("#accent-custom")?.addEventListener("change", async () => {
    const color = ($("#accent-custom") as HTMLInputElement).value;
    const patch = makePatch("appearance.accentColor", color, currentSettings);
    await storage.saveSettings(patch);
    currentSettings = await storage.getSettings();
    applyAccent();
    navigateToMain();
    showToast("Accent updated", "mint");
  });
}

// ── Custom: Data ──

function renderDataCustom(): string {
  return `
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-row-label">Export saved articles</div>
      <button class="btn btn-secondary btn-sm" id="data-export">Export to JSON</button>
    </div>
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-row-label">Clear feed cache</div>
      <button class="btn btn-secondary btn-sm" id="data-clear-cache">Clear cache</button>
    </div>
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div class="settings-row-label">Reset all settings</div>
      <button class="btn btn-secondary btn-sm" id="data-reset" style="color:var(--red)">Reset to defaults</button>
    </div>
  `;
}

function initDataCustom() {
  $("#data-export")?.addEventListener("click", async () => {
    const saved = await storage.getSavedArticles();
    const blob = new Blob([JSON.stringify(saved, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owltabs-saved-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported saved articles", "mint");
  });

  $("#data-clear-cache")?.addEventListener("click", async () => {
    await chrome.storage.local.remove(KEYS.FEED_CACHE);
    showToast("Feed cache cleared", "mint");
  });

  $("#data-reset")?.addEventListener("click", async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone."))
      return;
    await chrome.storage.sync.clear();
    await chrome.storage.local.remove([
      KEYS.FEED_CACHE,
      KEYS.SAVED_ARTICLES,
    ]);
    location.reload();
  });
}

// ── Backdrop helper ──

function updateBackdrop() {
  const backdrop = $("#nt-backdrop") as HTMLElement;
  const anyOpen = uiStore.get().aiPanelOpen || uiStore.get().settingsOpen;
  backdrop.hidden = !anyOpen;
  requestAnimationFrame(() => {
    backdrop.classList.toggle("is-visible", anyOpen);
  });
}
