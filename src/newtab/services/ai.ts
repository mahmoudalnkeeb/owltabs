import type { AIConfig } from "../state/types";
import { streamGemini, type GeminiMessage, type StreamMeta, type ToolCall } from "./gemini";
import { streamOpenAI } from "./openai";

/** Whether the selected provider has what it needs to answer. */
export function aiReady(ai: AIConfig): boolean {
  if (!ai.enabled) return false;
  if (ai.provider === "openai") return !!ai.openaiBaseUrl.trim() && !!ai.openaiModel.trim();
  return !!ai.geminiKey;
}

/** Streams a reply from the selected provider. */
export function streamChat(
  ai: AIConfig,
  messages: GeminiMessage[],
  systemPrompt: string,
  meta?: StreamMeta,
  toolCalls?: ToolCall[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return ai.provider === "openai"
    ? streamOpenAI(ai, messages, systemPrompt, meta, toolCalls, signal)
    : streamGemini(ai.geminiKey, ai.model, messages, systemPrompt, meta, toolCalls, signal);
}
