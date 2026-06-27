import type { AIConfig } from "../state/types";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse";

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
  parts: { text: string }[];
}

export interface StreamMeta {
  interactionId: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export const TOOLS: Record<string, unknown>[] = [
  {
    type: "function",
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
    type: "function",
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
    type: "function",
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
    type: "function",
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
    type: "function",
    name: "get_saved_articles",
    description: "Retrieve the user's saved articles. Returns a list of saved articles with their IDs, titles, feeds, and save dates.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

export async function* streamGemini(
  apiKey: string,
  model: string,
  messages: GeminiMessage[],
  systemPrompt: string,
  previousInteractionId?: string,
  meta?: StreamMeta,
  toolCalls?: ToolCall[],
  continuationInput?: unknown,
): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model,
    system_instruction: systemPrompt,
    stream: true,
    generation_config: { max_output_tokens: 1024, temperature: 0.7 },
    tools: TOOLS,
  };

  if (continuationInput !== undefined) {
    body.input = continuationInput;
  } else {
    body.input = messages
      .map((m) => m.parts.map((p) => p.text).join("\n"))
      .join("\n\n");
  }

  if (previousInteractionId)
    body.previous_interaction_id = previousInteractionId;

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GeminiError(err.error?.message ?? "Unknown error", res.status);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentToolCall: ToolCall | null = null;

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
        const event = JSON.parse(jsonStr);

        if (event.event_type === "interaction.created" && meta) {
          meta.interactionId = event.interaction?.id || "";
        }

        if (event.event_type === "step.delta" && event.delta?.type === "text") {
          if (event.delta.text) yield event.delta.text;
        }

        if (
          event.event_type === "step.start" &&
          event.step?.type === "function_call"
        ) {
          currentToolCall = {
            id: event.step.id || "",
            name: event.step.name || "",
            arguments: event.step.arguments || {},
          };
        }

        if (
          event.event_type === "step.delta" &&
          event.delta?.type === "arguments_delta"
        ) {
          if (currentToolCall && event.delta.arguments) {
            try {
              const more = JSON.parse(event.delta.arguments);
              Object.assign(currentToolCall.arguments, more);
            } catch {
              // partial JSON — skip
            }
          }
        }

        if (event.event_type === "step.stop" && currentToolCall) {
          if (currentToolCall.id && currentToolCall.name && toolCalls) {
            toolCalls.push(currentToolCall);
          }
          currentToolCall = null;
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
    `If the user asks about their feed, use the provided article summaries.`,
    `Keep responses concise and focused.`,
    `You have access to tools: save_article (save one or more articles), unsave_article (remove saved), get_saved_articles (list saved articles), open_link (open URL in tab), search (web search). You can pass multiple IDs to save_article and unsave_article in a single call.`,
  ]
    .filter(Boolean)
    .join("\n");
}
