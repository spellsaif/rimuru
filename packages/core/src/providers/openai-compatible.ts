import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk, TokenUsage, ToolCall } from "../core/types.js";

export interface OpenAICompatibleOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class OpenAICompatibleShard implements Shard {
  readonly name = "openai-compatible";
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: OpenAICompatibleOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 60_000;
  }

  async complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    if (options?.signal) options.signal.addEventListener("abort", () => controller.abort());

    const payloadTools =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema ?? { type: "object", properties: {} },
            },
          }))
        : undefined;

    try {
      const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify({
          model: this.#model,
          messages: messages.map((m) => toChatMessage(m, this.#model)),
          stream: false,
          ...(payloadTools ? { tools: payloadTools } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`OpenAI-compatible provider error (${response.status}): ${errorText}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const choice = payload.choices?.[0]?.message;
      const toolCalls: ToolCall[] = [];
      if (choice?.tool_calls) {
        for (const tc of choice.tool_calls) {
          if (tc.type === "function" && tc.function) {
            let args: any = {};
            try {
              args = JSON.parse(tc.function.arguments ?? "{}");
            } catch {
              // ignore parse errors
            }
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: args,
            });
          }
        }
      }

      return {
        content: choice?.content ?? "",
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        ...(payload.usage ? { usage: toUsage(payload.usage) } : {}),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk> {
    const payloadTools =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema ?? { type: "object", properties: {} },
            },
          }))
        : undefined;

    const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({
        model: this.#model,
        messages: messages.map((m) => toChatMessage(m, this.#model)),
        stream: true,
        stream_options: { include_usage: true },
        ...(payloadTools ? { tools: payloadTools } : {}),
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenRouter stream failed (${response.status}): ${errorText}`);
    }

    if (!response.body) throw new Error("OpenRouter stream failed: missing response body");

    const parser = new SseParser();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const accumulatedToolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const data of parser.feed(chunk)) {
          if (data === "[DONE]") break;

          let payload: ChatCompletionChunk;
          try {
            payload = JSON.parse(data) as ChatCompletionChunk;
          } catch (e) {
            // Handle cases where the provider sends an error object as raw JSON instead of SSE format
            if (data.includes('"error"')) {
              throw new Error(`Provider returned error: ${data}`);
            }
            continue;
          }

          if (payload.choices?.[0]?.delta?.content) {
            yield { type: "text", text: payload.choices[0].delta.content };
          }

          const toolCallsDelta = payload.choices?.[0]?.delta?.tool_calls;
          if (toolCallsDelta) {
            for (const tc of toolCallsDelta) {
              const idx = tc.index;
              if (!accumulatedToolCalls.has(idx)) {
                accumulatedToolCalls.set(idx, { arguments: "" });
              }
              const entry = accumulatedToolCalls.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.arguments += tc.function.arguments;
            }
          }

          if (payload.usage) {
            yield { type: "usage", usage: toUsage(payload.usage) };
          }
        }
      }

      const finalToolCalls: ToolCall[] = [];
      for (const [_, entry] of accumulatedToolCalls.entries()) {
        if (entry.name) {
          let args: any = {};
          try {
            args = JSON.parse(entry.arguments || "{}");
          } catch {
            // ignore
          }
          finalToolCalls.push({
            id: entry.id ?? `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: entry.name,
            arguments: args,
          });
        }
      }
      if (finalToolCalls.length > 0) {
        yield { type: "tool_calls", toolCalls: finalToolCalls };
      }

      yield { type: "done" };
    } finally {
      reader.releaseLock();
    }
  }

  async #fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | undefined;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await this.#fetch(url, init);
        // Retry on 429 (Rate Limit) and 5xx (Server Errors)
        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
          if (i === maxRetries) return response;
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i === maxRetries || (error instanceof Error && error.name === "AbortError")) throw error;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new Error("Fetch failed after retries");
  }
}

class SseParser {
  private buffer = "";

  *feed(chunk: string): Iterable<string> {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index === -1) break;

      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);

      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) yield data;
      }
    }
  }
}

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message: {
      readonly content?: string;
      readonly tool_calls?: readonly {
        readonly id: string;
        readonly type: "function";
        readonly function: {
          readonly name: string;
          readonly arguments: string;
        };
      }[];
    };
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

interface ChatCompletionChunk {
  readonly choices?: readonly {
    readonly delta: {
      readonly content?: string;
      readonly tool_calls?: readonly {
        readonly index: number;
        readonly id?: string;
        readonly type?: "function";
        readonly function?: {
          readonly name?: string;
          readonly arguments?: string;
        };
      }[];
    };
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

function toChatMessage(message: Message, model: string): any {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  let role = message.role;
  // Specific model compatibility hacks
  if (role === "system" && (model.includes("gemma") || model.includes("o1-") || model.includes("o3-"))) {
    role = "user";
  }
  const result: any = {
    role,
    content: message.content,
  };

  if (message.toolCalls && message.toolCalls.length > 0) {
    result.tool_calls = message.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }

  return result;
}

function toUsage(usage: { readonly prompt_tokens?: number; readonly completion_tokens?: number }): TokenUsage {
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
  };
}
