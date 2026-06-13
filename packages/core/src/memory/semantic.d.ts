import type { Chronicle, Rune } from "../core/types.js";
export interface EmbeddingProvider {
    readonly name: string;
    embed(text: string): Promise<readonly number[]>;
}
export interface SemanticMemoryRecord {
    readonly id: string;
    readonly sessionId: string;
    readonly scope: "chronicle" | "workspace" | "note";
    readonly text: string;
    readonly summary: string;
    readonly metadata: Readonly<Record<string, string>>;
    readonly embedding: readonly number[];
    readonly createdAt: string;
}
export interface SemanticMemorySearchResult {
    readonly record: SemanticMemoryRecord;
    readonly score: number;
}
export declare class HashEmbeddingProvider implements EmbeddingProvider {
    private readonly dimensions;
    readonly name = "hash-local";
    constructor(dimensions?: number);
    embed(text: string): Promise<readonly number[]>;
}
export declare class JsonSemanticMemoryStore {
    private readonly path;
    constructor(path: string);
    all(): Promise<readonly SemanticMemoryRecord[]>;
    upsert(records: readonly SemanticMemoryRecord[]): Promise<void>;
    search(embedding: readonly number[], options?: {
        readonly sessionId?: string;
        readonly limit?: number;
    }): Promise<readonly SemanticMemorySearchResult[]>;
    compact(options?: {
        readonly keepPerSession?: number;
    }): Promise<void>;
}
export declare class SemanticMemory {
    private readonly options;
    constructor(options: {
        readonly store: JsonSemanticMemoryStore;
        readonly embeddings: EmbeddingProvider;
        readonly clock?: () => Date;
    });
    remember(input: {
        readonly sessionId: string;
        readonly scope: SemanticMemoryRecord["scope"];
        readonly text: string;
        readonly metadata?: Readonly<Record<string, string>>;
    }): Promise<SemanticMemoryRecord>;
    indexChronicle(sessionId: string, chronicle: Chronicle): Promise<readonly SemanticMemoryRecord[]>;
    search(query: string, options?: {
        readonly sessionId?: string;
        readonly limit?: number;
    }): Promise<readonly SemanticMemorySearchResult[]>;
    compact(options?: {
        readonly keepPerSession?: number;
    }): Promise<void>;
    private recordForMessage;
}
export declare function createSemanticMemory(root: string): SemanticMemory;
export declare function semanticMemoryRunes(memory: SemanticMemory): readonly Rune[];
