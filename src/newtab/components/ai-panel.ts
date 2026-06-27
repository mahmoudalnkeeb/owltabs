import type { SyncStorageSettings } from "../state/types";
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
import { $, svgIcon, escapeHtml, showToast } from "../utils";
import { marked } from "marked";
import DOMPurify from "dompurify";

let currentAbort: AbortController | null = null;
let previousInteractionId = "";

export function renderAIPanel(settings: SyncStorageSettings) {
  const panel = $("#nt-ai-panel") as HTMLElement;
  if (!panel) return;

  if (!settings.ai.enabled || !settings.ai.geminiKey) {
    panel.hidden = true;
    return;
  }

  panel.innerHTML = `
    <header class="ai-panel-header">
      <div class="ai-panel-title">
        <div class="orb-wrap is-idle" style="--orb-size:24px" id="nt-ai-panel-orb">
          <div class="orb"></div>
        </div>
        <span>OwlTabs AI</span>
      </div>
      <button class="nt-icon-btn" id="nt-ai-close" aria-label="Close AI panel">
        ${svgIcon("close", 18)}
      </button>
    </header>
    <div class="ai-panel-body" id="nt-ai-messages" role="log" aria-live="polite"></div>
    <div class="ai-quick-prompts" id="nt-ai-quick-prompts">
      <button class="chip" data-prompt="Summarize today's feed">Summarize today's feed</button>
      <button class="chip" data-prompt="What's trending in tech?">What's trending in tech?</button>
      <button class="chip" data-prompt="Show me saved articles">Show me saved articles</button>
    </div>
    <footer class="ai-panel-foot">
      <textarea
        class="ai-panel-input field"
        id="nt-ai-input"
        rows="1"
        placeholder="Ask anything about your feed…"
        aria-label="Message to AI"
      ></textarea>
      <button class="btn btn-primary btn-sm" id="nt-ai-send" aria-label="Send">
        ${svgIcon("send", 14)}
      </button>
    </footer>
  `;

  const messagesEl = $("#nt-ai-messages") as HTMLElement;
  const input = $("#nt-ai-input") as HTMLTextAreaElement;
  const sendBtn = $("#nt-ai-send") as HTMLButtonElement;
  const orb = $("#nt-ai-panel-orb") as HTMLElement;
  const quickPrompts = $("#nt-ai-quick-prompts") as HTMLElement;

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  quickPrompts.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest(
      ".chip",
    ) as HTMLElement | null;
    if (!chip) return;
    input.value = chip.dataset.prompt || "";
    sendMessage();
  });

  $("#nt-ai-close")?.addEventListener("click", () => {
    uiStore.set((s) => ({ ...s, aiPanelOpen: false }));
  });

  uiStore.subscribe((s) => {
    const open = s.aiPanelOpen;
    panel.classList.toggle("is-open", open);
    panel.hidden = false;
    updateBackdrop();
    if (open) {
      input.focus();
    }
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    quickPrompts.style.display = "none";

    appendMessage("user", text);
    input.value = "";
    input.style.height = "auto";

    const aiMsgId = `ai-msg-${Date.now()}`;
    appendMessage("ai", '<span class="cursor"></span>', aiMsgId);
    const aiContentEl = $(`#${aiMsgId} .stream-text`) as HTMLElement;

    orb.classList.remove("is-idle");
    orb.classList.add("is-listening");

    currentAbort = new AbortController();

    try {
      const feedLabels = feedStore.get().map((f) => f.feedLabel);
      const systemPrompt = buildSystemPrompt(settings.ai, feedLabels);

      const topArticles = feedStore.get().slice(0, 20);
      let contextText = `Here are today's top articles:\n${topArticles
        .map(
          (a) =>
            `- ID:${a.id} "${a.title}" (${a.feedLabel})${a.excerpt ? ` — ${a.excerpt.slice(0, 150)}` : ""} | ${a.url} | ${relativeTime(a.publishedAt)}`,
        )
        .join("\n")}`;

      const savedArticles = await storage.getSavedArticles();
      if (savedArticles.length > 0) {
        contextText += `\n\nSaved articles:\n${savedArticles
          .map(
            (a) =>
              `- ID:${a.id} "${a.title}" (${a.feedLabel})${a.savedAt ? ` — saved ${relativeTime(a.savedAt)}` : ""} | ${a.url}`,
          )
          .join("\n")}`;
      }

      const contextMsg: GeminiMessage = {
        role: "user",
        parts: [{ text: contextText }],
      };

      let messages: GeminiMessage[] = [
        contextMsg,
        { role: "user", parts: [{ text }] },
      ];
      let fullText = "";
      let interactionId = previousInteractionId || undefined;
      let continuation: unknown = undefined;

      for (let round = 0; round < 5; round++) {
        const toolCalls: ToolCall[] = [];
        const meta: StreamMeta = { interactionId: "" };

        for await (const token of streamGemini(
          settings.ai.geminiKey,
          settings.ai.model,
          messages,
          systemPrompt,
          interactionId,
          meta,
          toolCalls,
          continuation,
        )) {
          if (currentAbort.signal.aborted) break;
          fullText += token;
          aiContentEl.innerHTML =
            renderMarkdown(fullText) + '<span class="cursor"></span>';
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        if (meta.interactionId) interactionId = meta.interactionId;
        if (currentAbort.signal.aborted || toolCalls.length === 0) break;

        const results = await Promise.all(
          toolCalls.map((tc) => executeToolCall(tc, settings)),
        );

        continuation = results.map((r, i) => ({
          type: "function_result" as const,
          call_id: toolCalls[i].id,
          name: toolCalls[i].name,
          result: [{ type: "text" as const, text: r }],
        }));
      }

      if (interactionId) previousInteractionId = interactionId;
      aiContentEl.innerHTML = renderMarkdown(fullText);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      aiContentEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHtml(message)}</span>`;
      showToast("AI request failed", "red");
    } finally {
      orb.classList.remove("is-listening");
      orb.classList.add("is-idle");
      currentAbort = null;
    }
  }

  function appendMessage(role: "user" | "ai", html: string, id?: string) {
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg--${role}`;
    if (id) div.id = id;
    div.innerHTML =
      role === "ai"
        ? `<div class="stream-text">${html}</div>`
        : `<p>${html}</p>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string);
}

async function executeToolCall(
  tc: ToolCall,
  settings: SyncStorageSettings,
): Promise<string> {
  function findArticle(idOrUrl: string) {
    const items = feedStore.get();
    return items.find((i) => i.id === idOrUrl || i.url === idOrUrl);
  }

  function resolveIds(raw: unknown): string[] {
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(String).filter(Boolean);
  }

  if (tc.name === "save_article") {
    const ids = resolveIds(tc.arguments.article_ids);
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
    const ids = resolveIds(tc.arguments.article_ids);
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
    const query = String(tc.arguments.query || "");
    const engine =
      settings.searchEngine === "custom"
        ? settings.customSearchUrl
        : SEARCH_ENGINES[settings.searchEngine] ||
          "https://www.google.com/search?q={query}";
    const url = engine.replace("{query}", encodeURIComponent(query));
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
    return `Searched "${query}".`;
  }

  if (tc.name === "get_saved_articles") {
    const saved = await storage.getSavedArticles();
    if (saved.length === 0) return "No saved articles.";
    return saved
      .map(
        (a) =>
          `ID:${a.id} "${a.title}" (${a.feedLabel})${a.savedAt ? ` — saved ${relativeTime(a.savedAt)}` : ""} | ${a.url}`,
      )
      .join("\n");
  }

  return `Unknown tool: ${tc.name}`;
}

function updateBackdrop() {
  const backdrop = $("#nt-backdrop") as HTMLElement;
  const anyOpen = uiStore.get().aiPanelOpen || uiStore.get().settingsOpen;
  backdrop.hidden = !anyOpen;
  // Use rAF to allow display:block to apply before opacity transition
  requestAnimationFrame(() => {
    backdrop.classList.toggle("is-visible", anyOpen);
  });
}
