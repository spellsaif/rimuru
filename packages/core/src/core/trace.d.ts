import type { Flow, Message } from "./types.js";
export interface TraceRecord {
    readonly sessionId: string;
    readonly createdAt: Date;
    readonly messages: readonly Message[];
    readonly events: readonly Flow[];
}
export declare class JsonTraceStore {
    private readonly root;
    constructor(root: string);
    save(record: TraceRecord): Promise<string>;
    list(): Promise<readonly string[]>;
    inspect(name: string): Promise<unknown>;
}
