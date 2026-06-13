import type { RuneRegistry } from "../core/runes.js";
import type { Rune, RuneSchema } from "../core/types.js";

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

export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
}

export async function discoverMcpRunes(
  workspace: string,
  config: McpServerConfig,
): Promise<readonly Rune[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const env = { ...process.env, ...config.env };

  try {
    const { stdout } = await execFileAsync(config.command, config.args ?? [], {
      env,
      cwd: workspace,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });

    const lines = stdout.split("\n").filter(Boolean);
    const initResponse = JSON.parse(lines[lines.length - 1]!);

    // Call tools/list
    const listRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const child = execFileAsync(config.command, config.args ?? [], { env, cwd: workspace, maxBuffer: 1024 * 1024 });
    
    const listResult: any = await new Promise((resolve, reject) => {
      let buf = "";
      child.child?.stdin?.write(listRequest + "\n");
      child.child?.stdin?.end();
      child.child?.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
      child.child?.on("close", () => {
        try {
          const lastLine = buf.split("\n").filter(Boolean).pop() ?? "{}";
          resolve(JSON.parse(lastLine));
        } catch (e) {
          reject(e);
        }
      });
      child.child?.on("error", reject);
    });

    const tools = listResult.result?.tools ?? [];

    return tools.map((tool: any) => ({
      name: `mcp.${config.name}.${tool.name}`,
      description: tool.description ?? `MCP tool ${tool.name} from ${config.name}`,
      risk: "execute" as const,
      inputSchema: tool.inputSchema ? mcpSchemaToRuneSchema(tool.inputSchema) : undefined,
      async invoke(input: unknown, ctx: any) {
        const callRequest = JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: tool.name, arguments: input },
        });

        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsyncInner = promisify(execFile);

        return new Promise((resolve, reject) => {
          let buf = "";
          const proc = execFileAsyncInner(config.command, config.args ?? [], {
            env,
            cwd: ctx.workspace ?? workspace,
            maxBuffer: 1024 * 1024,
          });
          proc.child?.stdin?.write(callRequest + "\n");
          proc.child?.stdin?.end();
          proc.child?.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
          proc.child?.on("close", () => {
            try {
              const lastLine = buf.split("\n").filter(Boolean).pop() ?? "{}";
              const response = JSON.parse(lastLine);
              resolve(response.result?.content ?? response.result);
            } catch (e) {
              reject(e);
            }
          });
          proc.child?.on("error", reject);
          proc.catch(reject);
        });
      },
    }));
  } catch {
    return [];
  }
}

function mcpSchemaToRuneSchema(schema: any): RuneSchema | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  // MCP uses full JSON Schema — convert to Rimuru's simplified RuneSchema
  if (schema.type === "object") {
    const props: Record<string, { type: "string" | "boolean" | "number" | "array" | "object" }> = {};
    if (schema.properties && typeof schema.properties === "object") {
      for (const [key, prop] of Object.entries(schema.properties)) {
        const pt = (prop as any)?.type;
        if (pt === "string" || pt === "boolean" || pt === "number" || pt === "array" || pt === "object") {
          props[key] = { type: pt };
        }
      }
    }
    return {
      type: "object",
      ...(schema.required ? { required: schema.required } : {}),
      ...(Object.keys(props).length > 0 ? { properties: props } : {}),
    };
  }
  return undefined;
}
