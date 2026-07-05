export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly name?: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: string;
  readonly createdAt: Date;
}

export interface AssistantResponse {
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly usage?: TokenUsage;
}

export type StreamChunk =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool_calls"; readonly toolCalls: readonly ToolCall[] }
  | { readonly type: "usage"; readonly usage: TokenUsage }
  | { readonly type: "done" };

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
}

export interface RunRequest {
  readonly prompt?: string;
  readonly promptMessage?: Message;
  readonly workspace: string;
  readonly sessionId: string;
  readonly onText?: (text: string) => void;
  readonly tools?: readonly {
    readonly name: string;
    readonly description: string;
    readonly inputSchema?: RuneSchema;
  }[];
  readonly predicates?: readonly any[];
}

export interface RunResult {
  readonly response: AssistantResponse;
  readonly transcript: readonly Message[];
  readonly events: readonly Flow[];
}

export type Flow =
  | { readonly type: "run.started"; readonly sessionId: string; readonly at: Date }
  | { readonly type: "memory.loaded"; readonly count: number; readonly at: Date }
  | { readonly type: "provider.requested"; readonly provider: string; readonly messages: number; readonly at: Date }
  | { readonly type: "provider.streamed"; readonly provider: string; readonly bytes: number; readonly at: Date }
  | { readonly type: "provider.responded"; readonly provider: string; readonly at: Date }
  | { readonly type: "rune.requested"; readonly rune: string; readonly at: Date }
  | { readonly type: "rune.completed"; readonly rune: string; readonly at: Date }
  | { readonly type: "rune.failed"; readonly rune: string; readonly error: string; readonly at: Date }
  | { readonly type: "rune.denied"; readonly rune: string; readonly reason: string; readonly at: Date }
  | { readonly type: "memory.saved"; readonly count: number; readonly at: Date }
  | { readonly type: "thought.emitted"; readonly thought: string; readonly at: Date }
  | { readonly type: "run.completed"; readonly sessionId: string; readonly at: Date }
  | {
      readonly type: "circle.pairing_requested";
      readonly circle: string;
      readonly kind: string;
      readonly data?: any;
      readonly at: Date;
    }
  | { readonly type: "circle.connected"; readonly circle: string; readonly kind: string; readonly at: Date }
  | {
      readonly type: "circle.message_received";
      readonly circle: string;
      readonly from: string;
      readonly text: string;
      readonly at: Date;
    };

export interface ShardOptions {
  readonly signal?: AbortSignal;
  readonly tools?: readonly {
    readonly name: string;
    readonly description: string;
    readonly inputSchema?: RuneSchema;
  }[];
}

export interface Shard {
  readonly name: string;
  complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse>;
  stream?(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk>;
}

export interface Chronicle {
  load(sessionId: string): Promise<readonly Message[]>;
  append(sessionId: string, messages: readonly Message[]): Promise<void>;
  overwrite?(sessionId: string, messages: readonly Message[]): Promise<void>;
  delete?(sessionId: string): Promise<void>;
}

export interface Rune<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  readonly risk: RuneRisk;
  readonly inputSchema?: RuneSchema;
  readonly outputSchema?: RuneSchema;
  invoke(input: Input, context: RuneContext): Promise<Output>;
}

export interface RuneInvocation {
  readonly name: string;
  readonly risk: RuneRisk;
  readonly input: unknown;
  context: RuneContext;
}

export interface RuneMiddleware {
  (invocation: RuneInvocation, next: () => Promise<unknown>): Promise<unknown>;
}

export interface PluginHooks {
  onBeforeInvoke?(invocation: RuneInvocation): Promise<RuneInvocation | void>;
  onAfterInvoke?(invocation: RuneInvocation, output: unknown): Promise<void>;
  onInvokeError?(invocation: RuneInvocation, error: Error): Promise<void>;
}

export interface AgentProfile {
  readonly name: string;
  readonly soul?: string;
  readonly allowedRisks: readonly RuneRisk[];
  readonly defaultModel?: string;
  readonly defaultProvider?: string;
}

export interface RuneSchema {
  readonly type: "object";
  readonly required?: readonly string[];
  readonly properties?: Readonly<
    Record<
      string,
      {
        readonly type: "string" | "boolean" | "number" | "array" | "object";
        readonly enum?: readonly string[];
        readonly description?: string;
      }
    >
  >;
}

export type RuneRisk = "read" | "write" | "execute" | "network";

export interface RuneContext {
  readonly workspace: string;
  readonly sessionId: string;
  readonly audit?: boolean;
  readonly signal?: AbortSignal;
  readonly registry?: any;
  readonly sovereign?: any;
  readonly chronicle?: any;
  readonly state?: Record<string, unknown>;
  getSecret?(name: string): Promise<string | undefined>;
}

export interface PermissionRequest {
  readonly rune: string;
  readonly risk: RuneRisk;
  readonly input: unknown;
  readonly workspace: string;
  readonly sessionId: string;
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export interface PermissionPolicy {
  decide(request: PermissionRequest): Promise<PermissionDecision>;
}

export interface GateStatus {
  readonly name: string;
  readonly state: string;
  readonly workspace: string;
  readonly soul: string;
  readonly shard: string;
  readonly model: string;
  readonly vows: readonly string[];
  readonly barrier: string;
}
