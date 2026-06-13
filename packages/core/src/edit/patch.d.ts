export interface PatchFile {
    readonly oldPath: string;
    readonly newPath: string;
    readonly hunks: readonly PatchHunk[];
}
export interface PatchHunk {
    readonly header: string;
    readonly lines: readonly PatchLine[];
}
export type PatchLine = {
    readonly type: "context";
    readonly text: string;
} | {
    readonly type: "remove";
    readonly text: string;
} | {
    readonly type: "add";
    readonly text: string;
};
export interface PatchApplyResult {
    readonly changed: boolean;
    readonly files: readonly {
        readonly path: string;
        readonly changed: boolean;
        readonly preview: string;
        readonly rollbackPath?: string;
    }[];
}
export interface ApplyPatchOptions {
    readonly workspace: string;
    readonly patch: string;
    readonly resolvePath: (path: string) => string;
    readonly dryRun?: boolean;
    readonly rollbackDir?: string;
    readonly formatter?: readonly string[];
}
export declare function parseUnifiedPatch(patch: string): readonly PatchFile[];
export declare function applyUnifiedPatch(options: ApplyPatchOptions): Promise<PatchApplyResult>;
export declare function applyPatchToText(before: string, file: PatchFile): string;
