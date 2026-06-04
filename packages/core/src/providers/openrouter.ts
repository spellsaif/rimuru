import type { AssistantResponse, Message, Shard, StreamChunk, TokenUsage } from "../core/types.js";

export interface OpenRouterOptions {
  readonly baseUrl?: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch;
}

export class OpenRouterShard implements Shard {
  readonly name = "openrouter";
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;

  constructor(options: OpenRouterOptions) {
    this.#baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    for (let i = 0; i <= maxRetries; i++) {
      const response = await this.#fetch(url, init);
      if (response.status !== 429 || i === maxRetries) return response;
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      process.stdout.write(
        `\n\x1b[90m[provider] Rate limited by OpenRouter (429). Retrying in ${Math.round(delay / 1000)}s...\x1b[0m\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw new Error("Unreachable");
  }

  async complete(messages: readonly Message[]): Promise<AssistantResponse> {
    const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`,
        "HTTP-Referer": "https://github.com/google/rimuru",
        "X-Title": "Rimuru AI Assistant",
      },
      body: JSON.stringify({
        model: this.#model,
        messages: messages.map((m) => toChatMessage(m, this.#model)),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    return {
      content: payload.choices[0]?.message.content ?? "",
      ...(payload.usage ? { usage: toUsage(payload.usage) } : {}),
    };
  }

  async *stream(messages: readonly Message[]): AsyncIterable<StreamChunk> {
    const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`,
        "HTTP-Referer": "https://github.com/google/rimuru",
        "X-Title": "Rimuru AI Assistant",
      },
      body: JSON.stringify({
        model: this.#model,
        messages: messages.map((m) => toChatMessage(m, this.#model)),
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter stream failed: ${response.status} ${await response.text()}`);
    }
    if (!response.body) throw new Error("OpenRouter stream failed: missing response body");

    for await (const event of parseSse(response.body)) {
      if (event === "[DONE]") break;
      const payload = JSON.parse(event) as ChatCompletionChunk;
      const text = payload.choices[0]?.delta.content;
      if (text) yield { type: "text", text };
      if (payload.usage) yield { type: "usage", usage: toUsage(payload.usage) };
    }
    yield { type: "done" };
  }
}

interface ChatCompletionResponse {
  readonly choices: readonly { readonly message: { readonly content?: string } }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

interface ChatCompletionChunk {
  readonly choices: readonly { readonly delta: { readonly content?: string } }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) yield data;
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function toChatMessage(
  message: Message,
  model: string,
): { readonly role: string; readonly content: string; readonly name?: string } {
  let role = message.role === "tool" ? "user" : message.role;
  if (role === "system" && (model.includes("gemma") || model.includes("o1-") || model.includes("o3-"))) {
    role = "user";
  }
  return {
    role,
    content: message.content,
    ...(message.name === undefined ? {} : { name: message.name }),
  };
}

function toUsage(usage: { readonly prompt_tokens?: number; readonly completion_tokens?: number }): TokenUsage {
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
  };
}
