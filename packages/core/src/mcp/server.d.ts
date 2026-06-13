import type { Readable, Writable } from "node:stream";
import type { RuneRegistry } from "../core/runes.js";
import type { JsonTraceStore } from "../core/trace.js";
export interface McpServerOptions {
    readonly registry: RuneRegistry;
    readonly workspace: string;
    readonly sessionId: string;
    readonly traceStore?: JsonTraceStore;
    readonly input?: Readable;
    readonly output?: Writable;
}
export declare function serveMcpStdio(options: McpServerOptions): Promise<void>;
