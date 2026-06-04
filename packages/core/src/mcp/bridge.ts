import type { RuneRegistry } from "../core/runes.js";

export interface McpToolCall {
  readonly method: "tools/list" | "tools/call";
  readonly params?: {
    readonly name?: string;
    readonly arguments?: unknown;
    readonly workspace?: string;
    readonly sessionId?: string;
  };
}

export async function handleMcpCall(registry: RuneRegistry, call: McpToolCall): Promise<unknown> {
  if (call.method === "tools/list") {
    return { tools: registry.describe() };
  }
  if (call.method === "tools/call") {
    const name = call.params?.name;
    if (!name) throw new Error("MCP tools/call requires params.name");
    return {
      content: await registry.invoke(name, call.params?.arguments ?? {}, {
        workspace: call.params?.workspace ?? process.cwd(),
        sessionId: call.params?.sessionId ?? "mcp",
        audit: true,
      }),
    };
  }
  throw new Error(`Unsupported MCP method: ${call.method}`);
}
