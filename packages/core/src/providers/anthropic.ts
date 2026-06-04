import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk, ToolCall } from "../core/types.js";

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

  async complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse> {
    const system = messages.find((message) => message.role === "system")?.content;
    const payloadTools =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema ?? { type: "object", properties: {} },
          }))
        : undefined;

    const response = await this.#fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 4096,
        ...(system ? { system } : {}),
        messages: mapMessagesToAnthropic(messages),
        ...(payloadTools ? { tools: payloadTools } : {}),
      }),
      signal: options?.signal,
    });
    if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`);
    const payload = (await response.json()) as {
      readonly content?: readonly any[];
      readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
    };

    let text = "";
    const toolCalls: ToolCall[] = [];
    if (payload.content) {
      for (const part of payload.content) {
        if (part.type === "text" || (!part.type && typeof part.text === "string")) {
          text += part.text ?? "";
        } else if (part.type === "tool_use") {
          toolCalls.push({
            id: part.id,
            name: part.name,
            arguments: part.input ?? {},
          });
        }
      }
    }

    return {
      content: text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(payload.usage
        ? { usage: { input: payload.usage.input_tokens ?? 0, output: payload.usage.output_tokens ?? 0 } }
        : {}),
    };
  }

  async *stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk> {
    const system = messages.find((message) => message.role === "system")?.content;
    const payloadTools =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema ?? { type: "object", properties: {} },
          }))
        : undefined;

    const response = await this.#fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 4096,
        stream: true,
        ...(system ? { system } : {}),
        messages: mapMessagesToAnthropic(messages),
        ...(payloadTools ? { tools: payloadTools } : {}),
      }),
      signal: options?.signal,
    });
    if (!response.ok) throw new Error(`Anthropic stream failed: ${response.status} ${await response.text()}`);
    if (!response.body) throw new Error("Anthropic stream failed: missing response body");

    const accumulatedTools = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of parseSse(response.body)) {
      const payload = JSON.parse(event) as any;
      if (payload.type === "content_block_start") {
        if (payload.content_block?.type === "tool_use") {
          accumulatedTools.set(payload.index, {
            id: payload.content_block.id,
            name: payload.content_block.name,
            json: "",
          });
        }
      } else if (payload.type === "content_block_delta") {
        if (payload.delta?.text) {
          yield { type: "text", text: payload.delta.text };
        } else if (payload.delta?.type === "input_json_delta" && payload.delta?.partial_json) {
          const entry = accumulatedTools.get(payload.index);
          if (entry) {
            entry.json += payload.delta.partial_json;
          }
        }
      } else if (payload.type === "message_delta" && payload.usage) {
        yield {
          type: "usage",
          usage: { input: payload.usage.input_tokens ?? 0, output: payload.usage.output_tokens ?? 0 },
        };
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [_, entry] of accumulatedTools.entries()) {
      let args: any = {};
      try {
        args = JSON.parse(entry.json || "{}");
      } catch {
        // ignore
      }
      toolCalls.push({
        id: entry.id,
        name: entry.name,
        arguments: args,
      });
    }
    if (toolCalls.length > 0) {
      yield { type: "tool_calls", toolCalls };
    }

    yield { type: "done" };
  }
}

function mapMessagesToAnthropic(messages: readonly Message[]): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      continue;
    }

    if (msg.role === "tool") {
      result.push({
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: msg.toolCallId ?? "",
            content: msg.content,
          },
        ],
      });
      continue;
    }

    const contentParts: any[] = [];
    if (msg.content) {
      contentParts.push({ type: "text" as const, text: msg.content });
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        contentParts.push({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
    }

    result.push({
      role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: contentParts,
    });
  }

  // Merge consecutive messages with the same role
  const merged: any[] = [];
  for (const item of result) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      if (Array.isArray(prev.content) && Array.isArray(item.content)) {
        prev.content.push(...item.content);
      } else {
        const prevText = typeof prev.content === "string" ? prev.content : JSON.stringify(prev.content);
        const itemText = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
        prev.content = prevText + "\n" + itemText;
      }
    } else {
      merged.push(item);
    }
  }

  return merged;
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
