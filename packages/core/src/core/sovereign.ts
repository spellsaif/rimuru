import { FlowBus } from "./events.js";
import type {
  AssistantResponse,
  Chronicle,
  Message,
  RunRequest,
  RunResult,
  RuneSchema,
  Shard,
  ToolCall,
} from "./types.js";

export interface SovereignOptions {
  readonly shard: Shard;
  readonly chronicle: Chronicle;
  readonly systemPrompt?: string;
  readonly flowBus?: FlowBus;
  readonly clock?: () => Date;
}

export class Sovereign {
  readonly #shard: Shard;
  readonly #chronicle: Chronicle;
  readonly #systemPrompt: string;
  readonly #flowBus: FlowBus;
  readonly #clock: () => Date;

  constructor(options: SovereignOptions) {
    this.#shard = options.shard;
    this.#chronicle = options.chronicle;
    this.#systemPrompt = options.systemPrompt ?? defaultSystemPrompt;
    this.#flowBus = options.flowBus ?? new FlowBus();
    this.#clock = options.clock ?? (() => new Date());
  }

  async run(request: RunRequest): Promise<RunResult> {
    this.#flowBus.emit({ type: "run.started", sessionId: request.sessionId, at: this.#clock() });

    const history = await this.#chronicle.load(request.sessionId);
    this.#flowBus.emit({ type: "memory.loaded", count: history.length, at: this.#clock() });

    const userMessage: Message = request.promptMessage ?? {
      role: "user",
      content: request.prompt ?? "",
      createdAt: this.#clock(),
    };

    const messages = [this.systemMessage(), ...history, userMessage];
    this.#flowBus.emit({
      type: "provider.requested",
      provider: this.#shard.name,
      messages: messages.length,
      at: this.#clock(),
    });

    const response = await this.complete(messages, request.onText, request.tools);
    this.#flowBus.emit({ type: "provider.responded", provider: this.#shard.name, at: this.#clock() });

    const assistantMessage: Message = {
      role: "assistant",
      content: response.content,
      ...(response.toolCalls ? { toolCalls: response.toolCalls } : {}),
      createdAt: this.#clock(),
    };

    await this.#chronicle.append(request.sessionId, [userMessage, assistantMessage]);
    this.#flowBus.emit({ type: "memory.saved", count: 2, at: this.#clock() });
    this.#flowBus.emit({ type: "run.completed", sessionId: request.sessionId, at: this.#clock() });

    return {
      response,
      transcript: [...history, userMessage, assistantMessage],
      events: this.#flowBus.snapshot(),
    };
  }

  private systemMessage(): Message {
    return {
      role: "system",
      content: this.#systemPrompt,
      createdAt: this.#clock(),
    };
  }

  private async complete(
    messages: readonly Message[],
    onText?: (text: string) => void,
    tools?: readonly { readonly name: string; readonly description: string; readonly inputSchema?: RuneSchema }[],
  ): Promise<AssistantResponse> {
    if (!this.#shard.stream) return this.#shard.complete(messages, { tools });

    let content = "";
    let toolCalls: ToolCall[] | undefined;
    let usage: AssistantResponse["usage"];
    for await (const chunk of this.#shard.stream(messages, { tools })) {
      if (chunk.type === "text") {
        content += chunk.text;
        onText?.(chunk.text);
        this.#flowBus.emit({
          type: "provider.streamed",
          provider: this.#shard.name,
          bytes: Buffer.byteLength(chunk.text),
          at: this.#clock(),
        });
      }
      if (chunk.type === "tool_calls") {
        if (!toolCalls) toolCalls = [];
        toolCalls.push(...chunk.toolCalls);
      }
      if (chunk.type === "usage") usage = chunk.usage;
    }
    return { content, ...(toolCalls ? { toolCalls } : {}), ...(usage ? { usage } : {}) };
  }
}

const defaultSystemPrompt = [
  "You are Rimuru, a local-first assistant runtime.",
  "Be direct, safe, observable, and useful.",
  "Prefer explicit actions over hidden magic.",
  "When creating custom Runes via workspace.compileRune, always prefer 'typescript' for lightweight logic, algorithms, generators, and text formatting. Write standard JS/TS without importing Node.js native APIs (like 'fs', 'path') or Web APIs not natively in QuickJS. Only use 'rust' for CPU-bound computations (note that Rust WASI builds require a 'fn main() {}' to link successfully).",
].join(" ");
