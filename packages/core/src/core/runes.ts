import { z } from "zod";
import { appendAuditEvent } from "./audit.js";
import type { Flow } from "./types.js";
import type { PermissionPolicy, Rune, RuneContext, RuneSchema } from "./types.js";

export interface RuneRegistryOptions {
  readonly policy?: PermissionPolicy;
  readonly emit?: (event: Flow) => void;
  readonly clock?: () => Date;
  readonly flowBus?: any;
}

export class RuneRegistry {
  readonly flowBus?: any;
  readonly #runes = new Map<string, Rune>();
  readonly #policy: PermissionPolicy | undefined;
  readonly #emit: ((event: Flow) => void) | undefined;
  readonly #clock: () => Date;

  constructor(options: RuneRegistryOptions = {}) {
    this.flowBus = options.flowBus;
    this.#policy = options.policy;
    this.#emit = options.emit;
    this.#clock = options.clock ?? (() => new Date());
  }

  register(rune: Rune): void {
    const lowerName = rune.name.toLowerCase();
    if (this.#runes.has(lowerName)) {
      throw new Error(`Rune already registered: ${rune.name}`);
    }
    this.#runes.set(lowerName, rune);
    if (rune.onRegister) {
      Promise.resolve(rune.onRegister(this)).catch((error) => {
        console.error(`[runes] Error running onRegister hook for ${rune.name}:`, error);
      });
    }
  }

  deregister(name: string): void {
    const lowerName = name.toLowerCase();
    const rune = this.#runes.get(lowerName);
    if (rune) {
      this.#runes.delete(lowerName);
      if (rune.onDeregister) {
        Promise.resolve(rune.onDeregister(this)).catch((error) => {
          console.error(`[runes] Error running onDeregister hook for ${rune.name}:`, error);
        });
      }
    }
  }

  list(): readonly Rune[] {
    return [...this.#runes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  describe(): readonly {
    readonly name: string;
    readonly description: string;
    readonly risk: string;
    readonly inputSchema?: RuneSchema;
    readonly outputSchema?: RuneSchema;
  }[] {
    return this.list().map((rune) => ({
      name: rune.name,
      description: rune.description,
      risk: rune.risk,
      ...(rune.inputSchema ? { inputSchema: rune.inputSchema } : {}),
      ...(rune.outputSchema ? { outputSchema: rune.outputSchema } : {}),
    }));
  }

  async invoke(name: string, input: unknown, context: RuneContext): Promise<unknown> {
    const rune = this.#runes.get(name.toLowerCase());
    if (!rune) throw new Error(`Unknown rune: ${name}`);
    validateSchema(rune.inputSchema, input, `Rune input invalid: ${name}`);
    this.#emit?.({ type: "rune.requested", rune: name, at: this.#clock() });
    await audit(context, { type: "rune.requested", sessionId: context.sessionId, rune: name, risk: rune.risk, input });
    const decision = await this.#policy?.decide({
      rune: rune.name,
      risk: rune.risk,
      input,
      workspace: context.workspace,
      sessionId: context.sessionId,
    });
    if (decision && !decision.allowed) {
      this.#emit?.({ type: "rune.denied", rune: name, reason: decision.reason, at: this.#clock() });
      await audit(context, {
        type: "rune.denied",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        input,
        reason: decision.reason,
      });
      throw new Error(`Rune denied: ${name}: ${decision.reason}`);
    }
    await audit(context, {
      type: "rune.allowed",
      sessionId: context.sessionId,
      rune: name,
      risk: rune.risk,
      input,
      reason: decision?.reason ?? "no policy configured",
    });
    try {
      const state = context.state ?? {};
      const enrichedContext: RuneContext = {
        ...context,
        registry: this,
        state,
      };
      const output = await rune.invoke(input, enrichedContext);
      validateSchema(rune.outputSchema, output, `Rune output invalid: ${name}`);
      this.#emit?.({ type: "rune.completed", rune: name, at: this.#clock() });
      await audit(context, {
        type: "rune.completed",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        output,
      });
      return output;
    } catch (error) {
      await audit(context, {
        type: "rune.failed",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async *invokeStream(name: string, input: unknown, context: RuneContext): AsyncIterable<unknown> {
    const rune = this.#runes.get(name.toLowerCase());
    if (!rune) throw new Error(`Unknown rune: ${name}`);
    validateSchema(rune.inputSchema, input, `Rune input invalid: ${name}`);
    this.#emit?.({ type: "rune.requested", rune: name, at: this.#clock() });
    await audit(context, { type: "rune.requested", sessionId: context.sessionId, rune: name, risk: rune.risk, input });
    const decision = await this.#policy?.decide({
      rune: rune.name,
      risk: rune.risk,
      input,
      workspace: context.workspace,
      sessionId: context.sessionId,
    });
    if (decision && !decision.allowed) {
      this.#emit?.({ type: "rune.denied", rune: name, reason: decision.reason, at: this.#clock() });
      await audit(context, {
        type: "rune.denied",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        input,
        reason: decision.reason,
      });
      throw new Error(`Rune denied: ${name}: ${decision.reason}`);
    }
    await audit(context, {
      type: "rune.allowed",
      sessionId: context.sessionId,
      rune: name,
      risk: rune.risk,
      input,
      reason: decision?.reason ?? "no policy configured",
    });
    try {
      const state = context.state ?? {};
      const enrichedContext: RuneContext = {
        ...context,
        registry: this,
        state,
      };
      if (rune.invokeStream) {
        for await (const chunk of rune.invokeStream(input, enrichedContext)) {
          yield chunk;
        }
      } else {
        const output = await rune.invoke(input, enrichedContext);
        validateSchema(rune.outputSchema, output, `Rune output invalid: ${name}`);
        yield output;
      }
      this.#emit?.({ type: "rune.completed", rune: name, at: this.#clock() });
      await audit(context, {
        type: "rune.completed",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        output: "stream completed",
      });
    } catch (error) {
      await audit(context, {
        type: "rune.failed",
        sessionId: context.sessionId,
        rune: name,
        risk: rune.risk,
        error: error instanceof Error ? error.message : String(error),
      });
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
      answer: `Workspace ${context.workspace} received: ${input.question}`,
    };
  },
};

function buildZodSchema(schema: any): z.ZodType<any> {
  if (!schema) return z.any();
  if (schema.type === "array") {
    return z.array(z.any());
  } else if (schema.type === "boolean") {
    return z.boolean();
  } else if (schema.type === "number") {
    return z.number();
  } else if (schema.type === "string") {
    return z.string();
  } else if (schema.type === "object") {
    const shape: Record<string, z.ZodType<any>> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      let fieldSchema = buildZodSchema(prop);
      if (!schema.required?.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }
      shape[key] = fieldSchema;
    }
    return z.object(shape);
  }
  return z.any();
}

function validateSchema(schema: RuneSchema | undefined, value: unknown, prefix: string): void {
  if (!schema) return;
  const zodSchema = buildZodSchema(schema);
  const result = zodSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `${prefix}: ${result.error.issues.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
    );
  }
}

async function audit(context: RuneContext, event: Parameters<typeof appendAuditEvent>[1]): Promise<void> {
  if (!context.audit) return;
  await appendAuditEvent(context.workspace, event);
}
