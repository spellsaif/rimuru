import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk, ToolCall } from "../core/types.js";

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

  async #fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    for (let i = 0; i <= maxRetries; i++) {
      const response = await this.#fetch(url, init);
      if ((response.status !== 429 && (response.status < 500 || response.status > 599)) || i === maxRetries) {
        return response;
      }
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      process.stdout.write(
        `\n\x1b[90m[provider] Rate limited or server error by Gemini (${response.status}). Retrying in ${Math.round(delay / 1000)}s...\x1b[0m\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw new Error("Unreachable");
  }

  async complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse> {
    const payloadTools =
      options?.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: mapSchemaToGemini(t.inputSchema),
              })),
            },
          ]
        : undefined;

    const response = await this.#fetchWithRetry(
      `${this.#baseUrl}/models/${encodeURIComponent(this.#model)}:generateContent?key=${encodeURIComponent(this.#apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: mapMessagesToGemini(messages),
          systemInstruction: {
            parts: [{ text: messages.find((message) => message.role === "system")?.content ?? "" }],
          },
          ...(payloadTools ? { tools: payloadTools } : {}),
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
    const payload = (await response.json()) as any;
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `${part.functionCall.name}-${Date.now()}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }
    return { content: text, ...(toolCalls.length > 0 ? { toolCalls } : {}) };
  }

  async *stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk> {
    const payloadTools =
      options?.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: mapSchemaToGemini(t.inputSchema),
              })),
            },
          ]
        : undefined;

    const response = await this.#fetchWithRetry(
      `${this.#baseUrl}/models/${encodeURIComponent(this.#model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.#apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: mapMessagesToGemini(messages),
          systemInstruction: {
            parts: [{ text: messages.find((message) => message.role === "system")?.content ?? "" }],
          },
          ...(payloadTools ? { tools: payloadTools } : {}),
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini stream failed: ${response.status} ${await response.text()}`);
    if (!response.body) throw new Error("Gemini stream failed: missing response body");
    for await (const event of parseSse(response.body)) {
      const payload = JSON.parse(event) as any;
      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const toolCalls: ToolCall[] = [];
      let text = "";
      for (const part of parts) {
        if (part.text) text += part.text;
        if (part.functionCall) {
          toolCalls.push({
            id: `${part.functionCall.name}-${Date.now()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          });
        }
      }
      if (text) yield { type: "text", text };
      if (toolCalls.length > 0) yield { type: "tool_calls", toolCalls };
      if (payload.usageMetadata)
        yield {
          type: "usage",
          usage: {
            input: payload.usageMetadata.promptTokenCount ?? 0,
            output: payload.usageMetadata.candidatesTokenCount ?? 0,
          },
        };
    }
    yield { type: "done" };
  }
}

function mapSchemaToGemini(schema: any): any {
  if (!schema) return undefined;
  const result: any = { type: String(schema.type).toUpperCase() };
  if (schema.required) result.required = schema.required;
  if (schema.properties) {
    result.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      result.properties[key] = mapSchemaToGemini(prop);
    }
  }
  if (schema.items) {
    result.items = mapSchemaToGemini(schema.items);
  }
  return result;
}

function mapMessagesToGemini(messages: readonly Message[]): any[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      let role = "user";
      if (message.role === "assistant") role = "model";
      if (message.role === "tool") role = "function";

      const parts: any[] = [];
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const tc of message.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
      } else if (message.role === "tool") {
        parts.push({
          functionResponse: {
            name: message.name ?? "tool",
            response: { output: message.content },
          },
        });
      } else {
        parts.push({ text: message.content });
      }

      return { role, parts };
    });
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
