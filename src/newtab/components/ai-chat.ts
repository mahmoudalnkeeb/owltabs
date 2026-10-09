import type { FeedItem, SyncStorageSettings, AIResponseBlock } from "../state/types";
import { uiStore, feedStore } from "../state/store";
import {
  streamGemini,
  buildSystemPrompt,
  type GeminiMessage,
  type StreamMeta,
  type ToolCall,
} from "../services/gemini";
import { storage } from "../services/storage";
import { relativeTime, SEARCH_ENGINES } from "../services/rss";
import { resolveFavicons, getDomain } from "../services/favicon";
import { $, svgIcon, escapeHtml, showToast } from "../utils";
import { renderCard } from "./card-renderer";
import { marked } from "marked";
import DOMPurify from "dompurify";

let currentAbort: AbortController | null = null;
let aiSettings: SyncStorageSettings | null = null;
let faviconCache = new Map<string, string | null>();
let savedArticleCache = new Map<string, FeedItem>();
let containerRef: HTMLElement | null = null;
let requestSeq = 0;

const QUICK_PROMPTS: Record<string, { display: string; prompt: string; loading: string }> = {
  summarize_feed: {
    display: "Summarize today's feed",
    loading: "Summarizing feed...",
    prompt:
      "Summarize today's feed. Synthesize the articles into 3-5 themes, name a few notable articles inside each theme, and do not list every article.",
  },
  trending_tech: {
    display: "What's trending in tech?",
    loading: "Finding trends...",
    prompt:
      "What is trending in my tech feed? Identify the strongest patterns across the articles and explain why they matter. Do not output a raw article list.",
  },
  saved_articles: {
    display: "Show me saved articles",
    loading: "Loading saved articles...",
    prompt:
      "Show me my saved articles. Use get_saved_articles and render matching articles as cards when available.",
  },
};

export function setAISettings(settings: SyncStorageSettings) {
  aiSettings = settings;
}

export function initAIChat(container: HTMLElement) {
  containerRef = container;
  container.innerHTML = `
    <header class="ai-chat-top">
      <div class="ai-chat-top-inner">
        <div class="ai-chat-pills" id="nt-ai-pills" role="tablist" aria-label="Search mode">
          <button class="pill" role="tab" data-mode="web" aria-selected="false">Web</button>
          <button class="pill" role="tab" data-mode="feed" aria-selected="false">Feed</button>
          <button class="pill active" role="tab" data-mode="ai" aria-selected="true">AI</button>
        </div>
        <button class="ai-chat-clear" id="nt-ai-clear" aria-label="Clear AI conversation">
          ${svgIcon("trash", 13)}
          <span>Clear</span>
        </button>
      </div>
    </header>
    <div class="ai-chat-body" id="nt-ai-messages" role="log" aria-live="polite"></div>
    <footer class="ai-chat-foot" id="nt-ai-foot">
      <div class="ai-chat-composer">
        <textarea
          class="ai-chat-input"
          id="nt-ai-input"
          rows="1"
          placeholder="Ask anything..."
          aria-label="Message to AI"
        ></textarea>
        <button class="btn btn-primary btn-sm ai-chat-send" id="nt-ai-send" aria-label="Send">
          ${svgIcon("send", 14)}
        </button>
      </div>
    </footer>
  `;

  const input = $("#nt-ai-input") as HTMLTextAreaElement;
  const sendBtn = $("#nt-ai-send") as HTMLButtonElement;

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  });

  function sendFromInput() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    sendToAI(text);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFromInput();
    }
  });

  sendBtn.addEventListener("click", sendFromInput);

  // Clear button
  $("#nt-ai-clear")?.addEventListener("click", () => {
    currentAbort?.abort();
    requestSeq++;
    currentAbort = null;
    pendingArticleDisplays = [];
    uiStore.set((s) => ({
      ...s,
      aiResponseBlocks: [],
      aiActive: true,
      aiStreaming: false,
    }));
    focusAIInput();
  });

  // Mode pills — dispatch clicks on real omnibox pills
  container.querySelectorAll<HTMLButtonElement>(".ai-chat-pills .pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const mode = pill.dataset.mode || "web";
      const target = document.querySelector<HTMLButtonElement>(
        `.omnibox .pill[data-mode="${mode}"]`,
      );
      target?.click();
      if (mode !== "ai") {
        requestAnimationFrame(() => {
          document.getElementById("nt-search-input")?.focus();
        });
      }
    });
  });

  // Render on state changes
  const render = () => renderAIChat(container);
  uiStore.subscribe(render);
  feedStore.subscribe(render);
}

function forceRender() {
  if (containerRef) renderAIChat(containerRef);
}

// Called by omnibox when Enter is pressed in AI mode (first query)
export function triggerAI(query: string) {
  uiStore.set((s) => ({ ...s, aiActive: true }));
  syncOmniboxMode("ai");
  focusAIInput();
  sendToAI(query);
}

export function openAIChat() {
  uiStore.set((s) => ({ ...s, aiActive: true }));
  syncOmniboxMode("ai");
  focusAIInput();
}

export function toggleAIChat() {
  uiStore.set((s) => ({ ...s, aiActive: !s.aiActive }));
  if (uiStore.get().aiActive) {
    syncOmniboxMode("ai");
    focusAIInput();
  }
}

export function focusAIInput() {
  requestAnimationFrame(() => {
    document.getElementById("nt-ai-input")?.focus();
  });
}

function syncOmniboxMode(modeId: string) {
  const omnibox = document.getElementById("nt-omnibox") as HTMLElement | null;
  if (!omnibox) return;
  omnibox.dataset.mode = modeId;
  omnibox.querySelectorAll<HTMLButtonElement>(".pill").forEach((pill) => {
    const active = pill.dataset.mode === modeId;
    pill.classList.toggle("active", active);
    pill.setAttribute("aria-selected", String(active));
  });
}

function renderAIChat(container: HTMLElement) {
  const state = uiStore.get();
  const { aiActive, aiResponseBlocks } = state;
  const input = container.querySelector<HTMLTextAreaElement>("#nt-ai-input");
  const sendBtn = container.querySelector<HTMLButtonElement>("#nt-ai-send");

  if (!aiActive) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  const hasContent = aiResponseBlocks.length > 0;
  container.classList.toggle("is-empty", !hasContent);
  container.classList.toggle("is-streaming", state.aiStreaming);
  if (input) input.disabled = state.aiStreaming;
  if (sendBtn) {
    sendBtn.disabled = state.aiStreaming;
    sendBtn.innerHTML = state.aiStreaming
      ? '<span class="ai-send-spinner" aria-hidden="true"></span>'
      : svgIcon("send", 14);
  }

  const messagesEl = container.querySelector<HTMLElement>("#nt-ai-messages");
  if (!messagesEl) return;

  if (!hasContent) {
    messagesEl.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-kicker">${svgIcon("sparkles", 15)} OwlTabs AI</div>
        <h1>Ask across your feed</h1>
        <p>Summarize, compare, save, and reopen articles without leaving the new tab.</p>
        <div class="ai-quick-prompts">
          ${Object.entries(QUICK_PROMPTS)
            .map(
              ([id, prompt]) =>
                `<button class="chip" data-prompt-id="${id}">${escapeHtml(prompt.display)}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;
    messagesEl.querySelectorAll<HTMLButtonElement>(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const prompt = QUICK_PROMPTS[chip.dataset.promptId || ""];
        if (prompt) sendToAI(prompt.prompt, prompt.display, prompt.loading);
      });
    });
    return;
  }

  // Conversation exists — render all blocks in order (user + AI responses interleaved)
  let html = '<div class="ai-conversation">';

  for (const block of aiResponseBlocks) {
    if (block.type === "user") {
      html += `<div class="ai-msg ai-msg--user"><p>${escapeHtml(block.content)}</p></div>`;
    } else if (block.type === "text") {
      html += `<div class="ai-block ai-block--text">${block.content}</div>`;
    } else if (block.type === "cards" && block.cardIds) {
      html += renderCardGrid(block.cardIds);
    } else if (block.type === "streaming") {
      html += `<div class="ai-block ai-block--text">${block.content}</div>`;
    }
  }
  html += "</div>";

  messagesEl.innerHTML = html;

  // Wire card interactions
  messagesEl.querySelectorAll<HTMLElement>(".feed-card-save").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = (e.target as HTMLElement).closest<HTMLElement>(".feed-card");
      const id = card?.dataset.id;
      if (!id) return;
      const isSaved = btn.dataset.saved === "true";
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
      btn.dataset.saved = String(!isSaved);
    });
  });

  messagesEl.querySelectorAll<HTMLAnchorElement>(".feed-card-open, .feed-card-title a").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (aiSettings?.openFeedLinksIn === "same_tab") {
        e.preventDefault();
        location.href = link.href;
      }
    });
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderCardGrid(ids: string[]): string {
  if (!aiSettings) return "";

  const matched = ids
    .map((id) => findArticle(id))
    .filter(Boolean) as FeedItem[];

  if (!matched.length) return "";

  const domains = [...new Set(matched.map((i) => getDomain(i.url)).filter(Boolean))];
  const unresolved = domains.filter((d) => !faviconCache.has(d));
  if (unresolved.length) {
    resolveFavicons(unresolved).then((resolved) => {
      resolved.forEach((url, domain) => faviconCache.set(domain, url));
      forceRender();
    });
  }

  const cardsHtml = matched.map((item) => renderCard(item, aiSettings!, faviconCache)).join("");
  return `<div class="ai-block ai-block--cards"><div class="feed-grid">${cardsHtml}</div></div>`;
}

async function sendToAI(query: string, displayQuery = query, loadingLabel?: string) {
  if (!aiSettings || !query) return;
  if (!aiSettings.ai.enabled || !aiSettings.ai.geminiKey) {
    showToast("Configure AI in Settings first", "red");
    return;
  }

  currentAbort?.abort();
  currentAbort = new AbortController();
  const activeRequest = ++requestSeq;
  pendingArticleDisplays = [];

  const existing = uiStore.get().aiResponseBlocks;
  const userBlock: AIResponseBlock = { type: "user", content: displayQuery };
  const chatBlock: AIResponseBlock = {
    type: "streaming",
    content: renderLoadingState(loadingLabel || loadingTextForQuery(query)),
  };

  uiStore.set((s) => ({
    ...s,
    aiResponseBlocks: [...existing, userBlock, chatBlock],
    aiStreaming: true,
  }));
  forceRender();

  try {
    const feedLabels = feedStore.get().map((f) => f.feedLabel);
    const systemPrompt = buildSystemPrompt(aiSettings.ai, feedLabels);
    const contextText = await buildAIContextText();

    const contextMsg: GeminiMessage = {
      role: "user",
      parts: [{ text: contextText }],
    };

    let messages: GeminiMessage[] = [
      contextMsg,
      { role: "user", parts: [{ text: query }] },
    ];
    let fullText = "";

    for (let round = 0; round < 5; round++) {
      const toolCalls: ToolCall[] = [];
      const meta: StreamMeta = { interactionId: "" };

      for await (const token of streamGemini(
        aiSettings.ai.geminiKey,
        aiSettings.ai.model,
        messages,
        systemPrompt,
        meta,
        toolCalls,
        currentAbort.signal,
      )) {
        if (currentAbort?.signal.aborted || activeRequest !== requestSeq) break;
        fullText += token;
        updateStreamingBlock(renderMarkdown(fullText) + '<span class="cursor"></span>');
      }

      if (currentAbort?.signal.aborted || activeRequest !== requestSeq || toolCalls.length === 0) {
        break;
      }

      messages = [
        ...messages,
        {
          role: "model",
          parts: toolCalls.map((tc) => ({
            functionCall: { name: tc.name, args: tc.arguments },
          })),
        },
        {
          role: "user",
          parts: await Promise.all(toolCalls.map(async (tc) => ({
            functionResponse: {
              name: tc.name,
              response: { result: await executeToolCall(tc) },
            },
          }))),
        },
      ];
    }

    if (activeRequest === requestSeq) {
      const s = uiStore.get();
      const updated = [...s.aiResponseBlocks];
      const idx = updated.findLastIndex((block) => block.type === "streaming");
      if (idx >= 0) {
        updated[idx] = {
          type: "text",
          content: fullText.trim()
            ? renderMarkdown(fullText)
            : `<span class="ai-muted">Done.</span>`,
        };
      }

      for (const tc of collectPendingArticleDisplays()) {
        const ids = resolveArgIds(tc.arguments.article_ids).filter((id) => findArticle(id));
        if (ids.length) updated.push({ type: "cards", content: "", cardIds: ids });
      }

      uiStore.set((s) => ({
        ...s,
        aiResponseBlocks: updated,
      }));
      forceRender();
    }
  } catch (err) {
    if (activeRequest !== requestSeq || currentAbort?.signal.aborted) return;
    const message = err instanceof Error ? err.message : "Unknown error";
    const cur = uiStore.get();
    const updated = [...cur.aiResponseBlocks];
    const idx = updated.length - 1;
    if (idx >= 0 && updated[idx].type === "streaming") {
      updated[idx] = {
        type: "text",
        content: `<span style="color:var(--red)">Error: ${escapeHtml(message)}</span>`,
      };
      uiStore.set((s) => ({ ...s, aiResponseBlocks: updated }));
      forceRender();
    }
    showToast("AI request failed", "red");
  } finally {
    if (activeRequest === requestSeq) {
      currentAbort = null;
      uiStore.set((s) => ({ ...s, aiStreaming: false }));
      forceRender();
    }
  }
}

async function buildAIContextText(): Promise<string> {
  const topArticles = feedStore.get().slice(0, 24);
  const savedArticles = await storage.getSavedArticles();
  savedArticleCache = new Map(savedArticles.map((article) => [article.id, article]));

  const sections = [
    "Reference context only. Do not quote, enumerate, or reveal this context verbatim unless the user explicitly asks for a raw list. Use it to synthesize answers.",
    "Article IDs are internal tool identifiers. Use them only when calling tools or when the user explicitly asks for IDs.",
    `Current feed articles:\n${topArticles.length ? topArticles.map(formatContextArticle).join("\n") : "No current feed articles available."}`,
  ];

  if (savedArticles.length > 0) {
    sections.push(`Saved articles:\n${savedArticles.map(formatContextArticle).join("\n")}`);
  } else {
    sections.push("Saved articles: none.");
  }

  return sections.join("\n\n");
}

function formatContextArticle(article: FeedItem): string {
  const excerpt = article.excerpt ? ` Summary: ${article.excerpt.slice(0, 180)}` : "";
  const saved = article.savedAt ? ` Saved: ${relativeTime(article.savedAt)}.` : "";
  return `- ID:${article.id} Title: ${article.title}. Feed: ${article.feedLabel}. Published: ${relativeTime(article.publishedAt)}.${saved}${excerpt} URL: ${article.url}`;
}

function loadingTextForQuery(query: string): string {
  const normalized = query.toLowerCase();
  if (normalized.includes("saved")) return "Loading saved articles...";
  if (normalized.includes("trend")) return "Finding trends...";
  if (normalized.includes("summarize") || normalized.includes("summary")) return "Summarizing feed...";
  return "Thinking...";
}

function renderLoadingState(label: string): string {
  return `
    <div class="ai-thinking" aria-label="${escapeHtml(label)}">
      <span class="ai-thinking-dot"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function updateStreamingBlock(html: string) {
  const s = uiStore.get();
  const updated = [...s.aiResponseBlocks];
  const idx = updated.length - 1;
  if (idx >= 0 && updated[idx].type === "streaming") {
    updated[idx] = { type: "streaming", content: html };
    uiStore.set((s) => ({ ...s, aiResponseBlocks: updated }));
    forceRender();
  }
}

function resolveArgIds(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(String).filter(Boolean);
}

function findArticle(idOrUrl: string): FeedItem | undefined {
  const needle = idOrUrl.trim().toLowerCase();
  return [...feedStore.get(), ...savedArticleCache.values()].find((i) =>
    i.id === idOrUrl ||
    i.url === idOrUrl ||
    i.title.toLowerCase() === needle ||
    i.title.toLowerCase().includes(needle)
  );
}

let pendingArticleDisplays: ToolCall[] = [];

function collectPendingArticleDisplays(): ToolCall[] {
  const calls = pendingArticleDisplays;
  pendingArticleDisplays = [];
  return calls;
}

async function executeToolCall(tc: ToolCall): Promise<string> {
  if (tc.name === "save_article") {
    const ids = resolveArgIds(tc.arguments.article_ids);
    const saved: string[] = [];
    const notFound: string[] = [];
    for (const id of ids) {
      const article = findArticle(id);
      if (article) {
        await storage.saveArticle(article);
        saved.push(article.title);
      } else {
        notFound.push(id);
      }
    }
    const parts: string[] = [];
    if (saved.length) parts.push(`Saved: ${saved.join(", ")}`);
    if (notFound.length) parts.push(`Not found: ${notFound.join(", ")}`);
    return parts.join(". ") || "No articles processed.";
  }

  if (tc.name === "unsave_article") {
    const ids = resolveArgIds(tc.arguments.article_ids);
    const removed: string[] = [];
    const notFound: string[] = [];
    for (const id of ids) {
      const article = findArticle(id);
      if (article) {
        await storage.unsaveArticle(article.id);
        removed.push(article.title);
      } else {
        notFound.push(id);
      }
    }
    const parts: string[] = [];
    if (removed.length) parts.push(`Removed: ${removed.join(", ")}`);
    if (notFound.length) parts.push(`Not found: ${notFound.join(", ")}`);
    return parts.join(". ") || "No articles processed.";
  }

  if (tc.name === "open_link") {
    const url = String(tc.arguments.url || "");
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
    return `Opened ${url} in a new tab.`;
  }

  if (tc.name === "search") {
    const searchQuery = String(tc.arguments.query || "");
    const engine =
      aiSettings?.searchEngine === "custom"
        ? aiSettings.customSearchUrl
        : SEARCH_ENGINES[aiSettings?.searchEngine || "brave"] || "https://www.google.com/search?q={query}";
    const url = engine.replace("{query}", encodeURIComponent(searchQuery));
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
    return `Searched "${searchQuery}".`;
  }

  if (tc.name === "get_saved_articles") {
    const saved = await storage.getSavedArticles();
    savedArticleCache = new Map(saved.map((article) => [article.id, article]));
    if (saved.length === 0) return "No saved articles.";
    return saved
      .map(
        (a) =>
          `ID:${a.id} "${a.title}" (${a.feedLabel})${a.savedAt ? ` — saved ${relativeTime(a.savedAt)}` : ""} | ${a.url}`,
      )
      .join("\n");
  }

  if (tc.name === "show_articles") {
    const ids = resolveArgIds(tc.arguments.article_ids);
    const found = ids.filter((id) => findArticle(id));
    pendingArticleDisplays.push(tc);
    return `Displaying ${found.length} article(s) as cards.`;
  }

  return `Unknown tool: ${tc.name}`;
}

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string);
}
