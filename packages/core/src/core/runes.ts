import { appendAuditEvent } from "./audit.js";
import type { Flow } from "./types.js";
import type { PermissionPolicy, Rune, RuneContext, RuneSchema } from "./types.js";

export interface RuneRegistryOptions {
  readonly policy?: PermissionPolicy;
  readonly emit?: (event: Flow) => void;
  readonly clock?: () => Date;
}

export class RuneRegistry {
  readonly #runes = new Map<string, Rune>();
  readonly #policy: PermissionPolicy | undefined;
  readonly #emit: ((event: Flow) => void) | undefined;
  readonly #clock: () => Date;

  constructor(options: RuneRegistryOptions = {}) {
    this.#policy = options.policy;
    this.#emit = options.emit;
    this.#clock = options.clock ?? (() => new Date());
  }

  register(rune: Rune): void {
    if (this.#runes.has(rune.name)) {
      throw new Error(`Rune already registered: ${rune.name}`);
    }
    this.#runes.set(rune.name, rune);
  }

  list(): readonly Rune[] {
    return [...this.#runes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  describe(): readonly { readonly name: string; readonly description: string; readonly risk: string; readonly inputSchema?: RuneSchema; readonly outputSchema?: RuneSchema }[] {
    return this.list().map((rune) => ({
      name: rune.name,
      description: rune.description,
      risk: rune.risk,
      ...(rune.inputSchema ? { inputSchema: rune.inputSchema } : {}),
      ...(rune.outputSchema ? { outputSchema: rune.outputSchema } : {})
    }));
  }

  async invoke(name: string, input: unknown, context: RuneContext): Promise<unknown> {
    const rune = this.#runes.get(name);
    if (!rune) throw new Error(`Unknown rune: ${name}`);
    validateSchema(rune.inputSchema, input, `Rune input invalid: ${name}`);
    this.#emit?.({ type: "rune.requested", rune: name, at: this.#clock() });
    await audit(context, { type: "rune.requested", sessionId: context.sessionId, rune: name, risk: rune.risk, input });
    const decision = await this.#policy?.decide({
      rune: rune.name,
      risk: rune.risk,
      input,
      workspace: context.workspace,
      sessionId: context.sessionId
    });
    if (decision && !decision.allowed) {
      this.#emit?.({ type: "rune.denied", rune: name, reason: decision.reason, at: this.#clock() });
      await audit(context, { type: "rune.denied", sessionId: context.sessionId, rune: name, risk: rune.risk, input, reason: decision.reason });
      throw new Error(`Rune denied: ${name}: ${decision.reason}`);
    }
    await audit(context, { type: "rune.allowed", sessionId: context.sessionId, rune: name, risk: rune.risk, input, reason: decision?.reason ?? "no policy configured" });
    try {
      const output = await rune.invoke(input, context);
      validateSchema(rune.outputSchema, output, `Rune output invalid: ${name}`);
      this.#emit?.({ type: "rune.completed", rune: name, at: this.#clock() });
      await audit(context, { type: "rune.completed", sessionId: context.sessionId, rune: name, risk: rune.risk, output });
      return output;
    } catch (error) {
      await audit(context, { type: "rune.failed", sessionId: context.sessionId, rune: name, risk: rune.risk, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export const workspaceRune: Rune<{ readonly question: string }, { readonly answer: string }> = {
  name: "workspace.ask",
  description: "Answers a simple workspace-scoped question without network access.",
  risk: "read",
  inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
  outputSchema: { type: "object", required: ["answer"], properties: { answer: { type: "string" } } },
  async invoke(input, context) {
    return {
      answer: `Workspace ${context.workspace} received: ${input.question}`
    };
  }
};

function validateSchema(schema: RuneSchema | undefined, value: unknown, prefix: string): void {
  if (!schema) return;
  if (schema.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) throw new Error(`${prefix}: expected object`);
  const record = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in record)) throw new Error(`${prefix}: missing '${key}'`);
  }
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (!(key in record) || record[key] === undefined) continue;
    if (property.type === "array") {
      if (!Array.isArray(record[key])) throw new Error(`${prefix}: '${key}' must be array`);
    } else if (typeof record[key] !== property.type) {
      throw new Error(`${prefix}: '${key}' must be ${property.type}`);
    }
  }
}

async function audit(context: RuneContext, event: Parameters<typeof appendAuditEvent>[1]): Promise<void> {
  if (!context.audit) return;
  await appendAuditEvent(context.workspace, event);
}
