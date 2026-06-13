import { z } from "zod";
import type { Rune, RuneContext, RuneInvocation, RuneMiddleware, RuneRisk } from "./types.js";
import { jsonSchemaToZod } from "./schema.js";

export interface RuneEntry {
  readonly rune: Rune;
  readonly zodInput?: z.ZodType<any>;
  readonly zodOutput?: z.ZodType<any>;
}

export interface RuneRegistryOptions {
  readonly middlewares?: readonly RuneMiddleware[];
}

export class RuneRegistry {
  middlewares: RuneMiddleware[];
  readonly #entries = new Map<string, RuneEntry>();
  readonly #toolsets = new Map<string, Set<string>>();
  #enabledToolsets = new Set<string>();

  constructor(options: RuneRegistryOptions = {}) {
    this.middlewares = [...(options.middlewares ?? [])];
  }

  register(rune: Rune): void {
    const lowerName = rune.name.toLowerCase();
    if (this.#entries.has(lowerName)) {
      throw new Error(`Rune already registered: ${rune.name}`);
    }
    this.#entries.set(lowerName, {
      rune,
      zodInput: jsonSchemaToZod(rune.inputSchema),
      zodOutput: jsonSchemaToZod(rune.outputSchema),
    });
  }

  deregister(name: string): void {
    this.#entries.delete(name.toLowerCase());
  }

  toolset(name: string, runeNames: readonly string[]): void {
    this.#toolsets.set(name, new Set(runeNames.map((n) => n.toLowerCase())));
  }

  enableToolset(name: string): void {
    this.#enabledToolsets.add(name);
  }

  disableToolset(name: string): void {
    this.#enabledToolsets.delete(name);
  }

  getEnabledToolsets(): readonly string[] {
    return [...this.#enabledToolsets];
  }

  list(): readonly Rune[] {
    return [...this.#entries.values()].map((e) => e.rune).sort((a, b) => a.name.localeCompare(b.name));
  }

  byRisk(risk: RuneRisk): readonly Rune[] {
    return this.list().filter((r) => r.risk === risk);
  }

  describe(): readonly {
    readonly name: string;
    readonly description: string;
    readonly risk: string;
    readonly inputSchema?: any;
    readonly outputSchema?: any;
  }[] {
    let runes = this.list();
    if (this.#enabledToolsets.size > 0) {
      const allowed = new Set<string>();
      for (const ts of this.#enabledToolsets) {
        for (const name of this.#toolsets.get(ts) ?? []) {
          allowed.add(name);
        }
      }
      runes = runes.filter((r) => allowed.has(r.name.toLowerCase()));
    }
    return runes.map((rune) => ({
      name: rune.name,
      description: rune.description,
      risk: rune.risk,
      ...(rune.inputSchema ? { inputSchema: rune.inputSchema } : {}),
      ...(rune.outputSchema ? { outputSchema: rune.outputSchema } : {}),
    }));
  }

  async invoke(name: string, input: unknown, context: RuneContext): Promise<unknown> {
    const entry = this.#entries.get(name.toLowerCase());
    if (!entry) throw new Error(`Unknown rune: ${name}`);

    validateWithZod(entry.zodInput, input, `Rune input invalid: ${name}`);

    const invocation: RuneInvocation = {
      name: entry.rune.name,
      risk: entry.rune.risk,
      input,
      context: { ...context },
    };

    const output = await runMiddlewareChain(invocation, this.middlewares, async () => {
      const enrichedContext: RuneContext = {
        ...invocation.context,
        registry: this,
        state: invocation.context.state ?? {},
      };
      const result = await entry.rune.invoke(invocation.input, enrichedContext);
      validateWithZod(entry.zodOutput, result, `Rune output invalid: ${name}`);
      return result;
    });

    return output;
  }

  async *invokeStream(name: string, input: unknown, context: RuneContext): AsyncIterable<unknown> {
    yield this.invoke(name, input, context);
  }
}

async function runMiddlewareChain(
  invocation: RuneInvocation,
  middlewares: readonly RuneMiddleware[],
  handler: () => Promise<unknown>,
): Promise<unknown> {
  if (middlewares.length === 0) return handler();
  const [first, ...rest] = middlewares;
  return first(invocation, () => runMiddlewareChain(invocation, rest, handler));
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

function validateWithZod(zodSchema: z.ZodType<any> | undefined, value: unknown, prefix: string): void {
  if (!zodSchema) return;
  const result = zodSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `${prefix}: ${result.error.issues.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
    );
  }
}
