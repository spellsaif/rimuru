export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  readonly role: Role;
  readonly content: string;
  readonly name?: string;
  readonly createdAt: Date;
}

export interface AssistantResponse {
  readonly content: string;
  readonly usage?: TokenUsage;
}

export type StreamChunk =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "usage"; readonly usage: TokenUsage }
  | { readonly type: "done" };

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
}

export interface RunRequest {
  readonly prompt: string;
  readonly workspace: string;
  readonly sessionId: string;
  readonly onText?: (text: string) => void;
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
  | { readonly type: "rune.denied"; readonly rune: string; readonly reason: string; readonly at: Date }
  | { readonly type: "memory.saved"; readonly count: number; readonly at: Date }
  | { readonly type: "thought.emitted"; readonly thought: string; readonly at: Date }
  | { readonly type: "run.completed"; readonly sessionId: string; readonly at: Date };


export interface Shard {
  readonly name: string;
  complete(messages: readonly Message[], options?: { readonly signal?: AbortSignal }): Promise<AssistantResponse>;
  stream?(messages: readonly Message[], options?: { readonly signal?: AbortSignal }): AsyncIterable<StreamChunk>;
}


export interface Chronicle {
  load(sessionId: string): Promise<readonly Message[]>;
  append(sessionId: string, messages: readonly Message[]): Promise<void>;
}

export interface Rune<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  readonly risk: RuneRisk;
  readonly inputSchema?: RuneSchema;
  readonly outputSchema?: RuneSchema;
  invoke(input: Input, context: RuneContext): Promise<Output>;
}

export interface RuneSchema {
  readonly type: "object";
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, { readonly type: "string" | "boolean" | "number" | "array" | "object" }>>;
}

export type RuneRisk = "read" | "write" | "execute" | "network";

export interface RuneContext {
  readonly workspace: string;
  readonly sessionId: string;
  readonly audit?: boolean;
  readonly signal?: AbortSignal;
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

