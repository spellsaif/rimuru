import { jsonSchemaToZod } from "./schema.js";
export class RuneRegistry {
    middlewares;
    #entries = new Map();
    #toolsets = new Map();
    #enabledToolsets = new Set();
    constructor(options = {}) {
        this.middlewares = [...(options.middlewares ?? [])];
    }
    register(rune) {
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
    deregister(name) {
        this.#entries.delete(name.toLowerCase());
    }
    toolset(name, runeNames) {
        this.#toolsets.set(name, new Set(runeNames.map((n) => n.toLowerCase())));
    }
    enableToolset(name) {
        this.#enabledToolsets.add(name);
    }
    disableToolset(name) {
        this.#enabledToolsets.delete(name);
    }
    getEnabledToolsets() {
        return [...this.#enabledToolsets];
    }
    list() {
        return [...this.#entries.values()].map((e) => e.rune).sort((a, b) => a.name.localeCompare(b.name));
    }
    byRisk(risk) {
        return this.list().filter((r) => r.risk === risk);
    }
    describe() {
        let runes = this.list();
        if (this.#enabledToolsets.size > 0) {
            const allowed = new Set();
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
    async invoke(name, input, context) {
        const entry = this.#entries.get(name.toLowerCase());
        if (!entry)
            throw new Error(`Unknown rune: ${name}`);
        validateWithZod(entry.zodInput, input, `Rune input invalid: ${name}`);
        const invocation = {
            name: entry.rune.name,
            risk: entry.rune.risk,
            input,
            context: { ...context },
        };
        const output = await runMiddlewareChain(invocation, this.middlewares, async () => {
            const enrichedContext = {
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
    async *invokeStream(name, input, context) {
        yield this.invoke(name, input, context);
    }
}
async function runMiddlewareChain(invocation, middlewares, handler) {
    if (middlewares.length === 0)
        return handler();
    const [first, ...rest] = middlewares;
    return first(invocation, () => runMiddlewareChain(invocation, rest, handler));
}
export const workspaceRune = {
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
function validateWithZod(zodSchema, value, prefix) {
    if (!zodSchema)
        return;
    const result = zodSchema.safeParse(value);
    if (!result.success) {
        throw new Error(`${prefix}: ${result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`);
    }
}
//# sourceMappingURL=runes.js.map