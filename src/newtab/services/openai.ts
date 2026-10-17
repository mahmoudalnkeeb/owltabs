import type { AIConfig } from "../state/types";
import { TOOL_DECLARATIONS, type GeminiMessage, type StreamMeta, type StreamOptions, type ToolCall } from "./gemini";

/**
 * Any OpenAI-compatible chat completions API: Groq, OpenRouter, Mistral,
 * Cerebras, Ollama, and others. The user supplies the base URL, key, and model.
 */

export class OpenAIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Accepts ".../v1", ".../v1/", or the full ".../chat/completions" URL. */
export function openaiUrl(baseUrl: string, path: "chat/completions" | "models"): string {
  const base = baseUrl.trim().replace(/\/+$/, "").replace(/\/(chat\/completions|models)$/, "");
  return `${base}/${path}`;
}

function headers(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

// Mistral only accepts 9-character alphanumeric call ids; the others accept anything.
function callId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function errorFrom(res: Response): Promise<OpenAIError> {
  const body = await res.json().catch(() => ({}));
  const message =
    body.error?.message ?? (typeof body.error === "string" ? body.error : null) ?? body.message ?? body.detail;
  if (res.status === 403 && /localhost|127\.0\.0\.1/.test(res.url)) {
    return new OpenAIError(
      "The local server refused the extension. For Ollama, set OLLAMA_ORIGINS=chrome-extension://* and restart it.",
      res.status,
    );
  }
  return new OpenAIError(
    typeof message === "string" && message ? message : `Request failed (${res.status})`,
    res.status,
  );
}

function toOpenAIMessages(messages: GeminiMessage[], systemPrompt: string): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    const text = message.parts.flatMap((p) => ("text" in p ? [p.text] : [])).join("\n");
    if (message.role === "model") {
      const calls = message.parts.flatMap((p) =>
        "functionCall" in p
          ? [{
              id: p.functionCall.id ?? callId(),
              type: "function" as const,
              function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
            }]
          : [],
      );
      out.push(calls.length ? { role: "assistant", content: text || null, tool_calls: calls } : { role: "assistant", content: text });
      continue;
    }
    for (const part of message.parts) {
      if ("functionResponse" in part) {
        out.push({
          role: "tool",
          tool_call_id: part.functionResponse.id ?? "",
          content: JSON.stringify(part.functionResponse.response),
        });
      }
    }
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

export async function* streamOpenAI(
  config: Pick<AIConfig, "openaiBaseUrl" | "openaiKey" | "openaiModel">,
  messages: GeminiMessage[],
  systemPrompt: string,
  meta?: StreamMeta,
  toolCalls?: ToolCall[],
  signal?: AbortSignal,
  options: StreamOptions = {},
): AsyncGenerator<string> {
  const res = await fetch(openaiUrl(config.openaiBaseUrl, "chat/completions"), {
    method: "POST",
    headers: headers(config.openaiKey),
    body: JSON.stringify({
      model: config.openaiModel,
      messages: toOpenAIMessages(messages, systemPrompt),
      ...(options.tools === false ? {} : { tools: TOOL_DECLARATIONS.map((fn) => ({ type: "function", function: fn })) }),
      stream: true,
      // Roomier than Gemini's limit: reasoning models spend part of it thinking.
      max_tokens: options.maxTokens ?? 2048,
      temperature: 0.7,
    }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Tool calls arrive in fragments keyed by index; arguments are streamed as JSON text.
  const pending = new Map<number, { id: string; name: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data);
        if (chunk.error) throw new OpenAIError(chunk.error.message ?? "Stream error", 0);
        if (chunk.id && meta) meta.interactionId = chunk.id;

        const finish = chunk.choices?.[0]?.finish_reason;
        if (finish && meta) meta.finishReason = finish;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) yield delta.content;
        for (const tc of delta.tool_calls ?? []) {
          const index = tc.index ?? pending.size;
          const entry = pending.get(index) ?? { id: "", name: "", args: "" };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
          pending.set(index, entry);
        }
      } catch (err) {
        if (err instanceof OpenAIError) throw err;
        // Ignore parse errors for malformed chunks
      }
    }
  }

  if (!toolCalls) return;
  for (const { id, name, args } of pending.values()) {
    if (!name) continue;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = args ? JSON.parse(args) : {};
    } catch {
      // Leave arguments empty; the tool reports what it was missing.
    }
    toolCalls.push({ id: id || callId(), name, arguments: parsed });
  }
}

/** A one-token request, to check the base URL, key, and model in settings. */
export async function testOpenAI(config: Pick<AIConfig, "openaiBaseUrl" | "openaiKey" | "openaiModel">): Promise<void> {
  const res = await fetch(openaiUrl(config.openaiBaseUrl, "chat/completions"), {
    method: "POST",
    headers: headers(config.openaiKey),
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1,
    }),
  });
  if (!res.ok) throw await errorFrom(res);
}

/** Model ids the server offers, for the settings model picker. */
export async function listOpenAIModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(openaiUrl(baseUrl, "models"), { headers: headers(apiKey) });
  if (!res.ok) throw await errorFrom(res);
  const body = await res.json();
  const list: { id?: string }[] = Array.isArray(body) ? body : (body.data ?? body.models ?? []);
  return list.flatMap((m) => (typeof m.id === "string" ? [m.id] : [])).sort();
}
