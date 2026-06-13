import { createInterface } from "node:readline/promises";
import { handleMcpCall } from "./bridge.js";
export async function serveMcpStdio(options) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const rl = createInterface({ input, terminal: false });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        const request = JSON.parse(line);
        try {
            const result = await handleMcpCall(options.registry, {
                method: request.method,
                params: { workspace: options.workspace, sessionId: options.sessionId, ...(request.params ?? {}) },
            });
            await options.traceStore?.save({
                sessionId: options.sessionId,
                createdAt: new Date(),
                messages: [{ role: "tool", name: "mcp", content: JSON.stringify({ request, result }), createdAt: new Date() }],
                events: [],
            });
            output.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result })}\n`);
        }
        catch (error) {
            output.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
        }
    }
}
//# sourceMappingURL=server.js.map