import type { Chronicle, Message } from "./types.js";
export declare class MemoryChronicle implements Chronicle {
    #private;
    load(sessionId: string): Promise<readonly Message[]>;
    append(sessionId: string, messages: readonly Message[]): Promise<void>;
    overwrite(sessionId: string, messages: readonly Message[]): Promise<void>;
    delete(sessionId: string): Promise<void>;
}
/**
 * Enhanced JsonChronicle using an append-only JSONL format.
 * This ensures O(1) appends and prevents data loss during concurrent writes.
 */
export declare class JsonChronicle implements Chronicle {
    private readonly root;
    constructor(root: string);
    load(sessionId: string): Promise<readonly Message[]>;
    append(sessionId: string, messages: readonly Message[]): Promise<void>;
    overwrite(sessionId: string, messages: readonly Message[]): Promise<void>;
    delete(sessionId: string): Promise<void>;
    listSessions(): Promise<readonly string[]>;
    summarize(sessionId: string): Promise<string>;
    compact(sessionId: string, keepLast?: number): Promise<void>;
    private pathFor;
}
