import type { RuneRegistry } from "../core/runes.js";
import type { Rune } from "../core/types.js";
export interface McpToolCall {
    readonly method: "tools/list" | "tools/call";
    readonly params?: {
        readonly name?: string;
        readonly arguments?: unknown;
        readonly workspace?: string;
        readonly sessionId?: string;
    };
}
export declare function handleMcpCall(registry: RuneRegistry, call: McpToolCall): Promise<unknown>;
export interface McpServerConfig {
    readonly name: string;
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Record<string, string>;
}
export declare function discoverMcpRunes(workspace: string, config: McpServerConfig): Promise<readonly Rune[]>;
