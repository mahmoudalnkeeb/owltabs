import type { AIConfig } from "../state/types";

const GEMINI_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface StreamMeta {
  interactionId: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

const TOOL_DECLARATIONS: Record<string, unknown>[] = [
  {
    name: "save_article",
    description:
      "Save one or more articles for later reading. Pass article IDs (e.g. ID:sha1...), full URLs, or titles from the context above.",
    parameters: {
      type: "object",
      properties: {
        article_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of article IDs, URLs, or titles to save",
        },
      },
      required: ["article_ids"],
    },
  },
  {
    name: "unsave_article",
    description: "Remove one or more articles from saved list.",
    parameters: {
      type: "object",
      properties: {
        article_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of article IDs, URLs, or titles to remove",
        },
      },
      required: ["article_ids"],
    },
  },
  {
    name: "open_link",
    description: "Open a URL in a new browser tab.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to open" },
      },
      required: ["url"],
    },
  },
  {
    name: "search",
    description: "Search the web using the default search engine.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_saved_articles",
    description: "Retrieve the user's saved articles. Returns a list of saved articles with their IDs, titles, feeds, and save dates.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "show_articles",
    description: "Display one or more articles as visual cards in the interface. Always use this when the user asks to see articles or when presenting articles visually.",
    parameters: {
      type: "object",
      properties: {
        article_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of article IDs (e.g. ID:sha1... or URLs) to display as cards",
        },
      },
      required: ["article_ids"],
    },
  },
];

export async function* streamGemini(
  apiKey: string,
  model: string,
  messages: GeminiMessage[],
  systemPrompt: string,
  meta?: StreamMeta,
  toolCalls?: ToolCall[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
  };

  const res = await fetch(GEMINI_ENDPOINT(model, apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GeminiError(err.error?.message ?? "Unknown error", res.status);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let toolIndex = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const jsonStr = trimmed.startsWith("data:")
        ? trimmed.slice(5).trim()
        : trimmed;
      if (!jsonStr) continue;
      try {
        const chunk = JSON.parse(jsonStr);
        if (chunk.responseId && meta) meta.interactionId = chunk.responseId;

        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            yield part.text;
          } else if (part.functionCall?.name && toolCalls) {
            toolCalls.push({
              id: `${part.functionCall.name}-${toolIndex++}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            });
          }
        }
      } catch {
        // Ignore parse errors for malformed chunks
      }
    }
  }
}

export function buildSystemPrompt(
  config: AIConfig,
  feedLabels: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    config.systemPrompt,
    `You are an AI assistant embedded in a personal browser new tab dashboard.`,
    `The user has the following RSS feeds configured: ${feedLabels.join(", ") || "none"}.`,
    `Today's date is ${date}.`,
    `The first user message may contain reference context. Treat it as private source material: do not quote it verbatim, do not dump raw bullet lists, and do not expose internal article IDs unless the user explicitly asks for IDs.`,
    `When asked to summarize the feed, synthesize the articles into 3-5 themes with short explanations and a few notable article titles. Do not list every article.`,
    `When asked what is trending, identify patterns across articles and explain why they matter. Prefer analysis over enumeration.`,
    `When asked to show saved articles, use get_saved_articles and show_articles when matching saved articles are available.`,
    `Keep responses concise, scannable, and focused. Use headings sparingly and avoid long introductions.`,
    `You have access to tools: save_article (save one or more articles), unsave_article (remove saved), get_saved_articles (list saved articles), open_link (open URL in tab), search (web search), show_articles (display articles as visual cards). Use show_articles when the user asks to see articles or when cards would be more useful than prose. You can pass multiple IDs to save_article and unsave_article in a single call.`,
  ]
    .filter(Boolean)
    .join("\n");
}
