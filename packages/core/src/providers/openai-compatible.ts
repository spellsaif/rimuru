import type { AssistantResponse, Message, Shard, StreamChunk, TokenUsage, ShardOptions } from "../core/types.js";

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

    try {
      const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#apiKey}`
        },
        body: JSON.stringify({
          model: this.#model,
          messages: messages.map((m) => toChatMessage(m, this.#model)),
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`OpenAI-compatible provider error (${response.status}): ${errorText}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      return {
        content: payload.choices?.[0]?.message?.content ?? "",
        ...(payload.usage ? { usage: toUsage(payload.usage) } : {})
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk> {
    const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: messages.map((m) => toChatMessage(m, this.#model)),
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: options?.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenRouter stream failed (${response.status}): ${errorText}`);
    }

    if (!response.body) throw new Error("OpenRouter stream failed: missing response body");

    const parser = new SSEParser();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

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
            if (data.includes("\"error\"")) {
              throw new Error(`Provider returned error: ${data}`);
            }
            continue; 
          }

          if (payload.choices?.[0]?.delta?.content) {
            yield { type: "text", text: payload.choices[0].delta.content };
          }
          if (payload.usage) {
            yield { type: "usage", usage: toUsage(payload.usage) };
          }
        }
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
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i === maxRetries || (error instanceof Error && error.name === "AbortError")) throw error;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new Error("Fetch failed after retries");
  }
}

class SSEParser {
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
  readonly choices?: readonly { readonly message: { readonly content?: string } }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

interface ChatCompletionChunk {
  readonly choices?: readonly { readonly delta: { readonly content?: string } }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

function toChatMessage(message: Message, model: string): { readonly role: string; readonly content: string; readonly name?: string } {
  let role = message.role === "tool" ? "user" : message.role;
  // Specific model compatibility hacks
  if (role === "system" && (model.includes("gemma") || model.includes("o1-") || model.includes("o3-"))) {
    role = "user";
  }
  return {
    role,
    content: message.content,
    ...(message.name ? { name: message.name } : {})
  };
}

function toUsage(usage: { readonly prompt_tokens?: number; readonly completion_tokens?: number }): TokenUsage {
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0
  };
}
