import type { AssistantResponse, Message, Shard, StreamChunk } from "../core/types.js";

export interface AnthropicOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class AnthropicShard implements Shard {
  readonly name = "anthropic";
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: AnthropicOptions) {
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async complete(messages: readonly Message[]): Promise<AssistantResponse> {
    const system = messages.find((message) => message.role === "system")?.content;
    const response = await this.#fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 4096,
        ...(system ? { system } : {}),
        messages: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }))
      })
    });
    if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`);
    const payload = (await response.json()) as { readonly content?: readonly { readonly text?: string }[]; readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number } };
    return {
      content: payload.content?.map((part) => part.text ?? "").join("") ?? "",
      ...(payload.usage ? { usage: { input: payload.usage.input_tokens ?? 0, output: payload.usage.output_tokens ?? 0 } } : {})
    };
  }

  async *stream(messages: readonly Message[]): AsyncIterable<StreamChunk> {
    const system = messages.find((message) => message.role === "system")?.content;
    const response = await this.#fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.#apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 4096,
        stream: true,
        ...(system ? { system } : {}),
        messages: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }))
      })
    });
    if (!response.ok) throw new Error(`Anthropic stream failed: ${response.status} ${await response.text()}`);
    if (!response.body) throw new Error("Anthropic stream failed: missing response body");
    for await (const event of parseSse(response.body)) {
      const payload = JSON.parse(event) as { readonly type?: string; readonly delta?: { readonly text?: string }; readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number } };
      if (payload.type === "content_block_delta" && payload.delta?.text) yield { type: "text", text: payload.delta.text };
      if (payload.type === "message_delta" && payload.usage) yield { type: "usage", usage: { input: payload.usage.input_tokens ?? 0, output: payload.usage.output_tokens ?? 0 } };
    }
    yield { type: "done" };
  }
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
      const data = raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (data) yield data;
      boundary = buffer.indexOf("\n\n");
    }
  }
}
