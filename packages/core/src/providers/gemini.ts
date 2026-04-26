import type { AssistantResponse, Message, Shard, StreamChunk } from "../core/types.js";

export interface GeminiOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class GeminiShard implements Shard {
  readonly name = "gemini";
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: GeminiOptions) {
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async complete(messages: readonly Message[]): Promise<AssistantResponse> {
    const response = await this.#fetch(`${this.#baseUrl}/models/${encodeURIComponent(this.#model)}:generateContent?key=${encodeURIComponent(this.#apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: messages.filter((message) => message.role !== "system").map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
        systemInstruction: { parts: [{ text: messages.find((message) => message.role === "system")?.content ?? "" }] }
      })
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
    const payload = (await response.json()) as { readonly candidates?: readonly { readonly content?: { readonly parts?: readonly { readonly text?: string }[] } }[] };
    return { content: payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "" };
  }

  async *stream(messages: readonly Message[]): AsyncIterable<StreamChunk> {
    const response = await this.#fetch(`${this.#baseUrl}/models/${encodeURIComponent(this.#model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.#apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        systemInstruction: { parts: [{ text: messages.find((message) => message.role === "system")?.content ?? "" }] }
      })
    });
    if (!response.ok) throw new Error(`Gemini stream failed: ${response.status} ${await response.text()}`);
    if (!response.body) throw new Error("Gemini stream failed: missing response body");
    for await (const event of parseSse(response.body)) {
      const payload = JSON.parse(event) as { readonly candidates?: readonly { readonly content?: { readonly parts?: readonly { readonly text?: string }[] } }[]; readonly usageMetadata?: { readonly promptTokenCount?: number; readonly candidatesTokenCount?: number } };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      if (text) yield { type: "text", text };
      if (payload.usageMetadata) yield { type: "usage", usage: { input: payload.usageMetadata.promptTokenCount ?? 0, output: payload.usageMetadata.candidatesTokenCount ?? 0 } };
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
