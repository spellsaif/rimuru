export interface IndexedFile {
    readonly path: string;
    readonly terms: ReadonlySet<string>;
    readonly summary: string;
}
export interface WorkspaceIndex {
    readonly files: readonly IndexedFile[];
    search(query: string, options?: {
        limit?: number;
    }): readonly IndexedFile[];
}
/**
 * Production-grade lexical indexer for workspace search.
 * Uses an iterative walker and frequency-aware scoring.
 */
export declare function buildLexicalIndex(workspace: string, options?: {
    readonly maxFiles?: number;
    readonly maxFileSize?: number;
}): Promise<WorkspaceIndex>;
