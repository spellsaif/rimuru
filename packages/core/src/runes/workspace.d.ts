import type { Rune, RuneRisk, RuneSchema } from "../core/types.js";
export declare const readFileRune: Rune<{
    readonly path: string;
}, {
    readonly path: string;
    readonly content: string;
}>;
export declare const listDirRune: Rune<{
    readonly path?: string;
}, {
    readonly path: string;
    readonly entries: readonly {
        name: string;
        isDirectory: boolean;
        size?: number;
    }[];
}>;
export declare const searchRune: Rune<{
    readonly pattern: string;
    readonly include?: string;
}, {
    readonly matches: readonly string[];
}>;
export declare const findFilesRune: Rune<{
    readonly query: string;
}, {
    readonly files: readonly string[];
}>;
export declare const shellRune: Rune<{
    readonly command: string;
    readonly args?: readonly string[];
}, {
    readonly stdout: string;
    readonly stderr: string;
}>;
export declare const editFileRune: Rune<{
    readonly path: string;
    readonly find?: string;
    readonly replace?: string;
    readonly patch?: string;
    readonly dryRun?: boolean;
    readonly formatter?: readonly string[];
}, {
    readonly path?: string;
    readonly changed: boolean;
    readonly preview?: string;
    readonly files?: readonly {
        readonly path: string;
        readonly changed: boolean;
        readonly preview: string;
        readonly rollbackPath?: string;
    }[];
}>;
export declare const applyPatchRune: Rune<{
    readonly patch: string;
    readonly dryRun?: boolean;
    readonly formatter?: readonly string[];
}, {
    readonly changed: boolean;
    readonly files: readonly {
        readonly path: string;
        readonly changed: boolean;
        readonly preview: string;
        readonly rollbackPath?: string;
    }[];
}>;
export declare const writeFileRune: Rune<{
    readonly path: string;
    readonly content: string;
}, {
    readonly path: string;
}>;
export declare const deleteFileRune: Rune<{
    readonly path: string;
}, {
    readonly path: string;
}>;
export declare const fileTreeRune: Rune<{
    readonly maxDepth?: number;
}, {
    readonly tree: string;
}>;
export declare const compileRune: Rune<{
    readonly sourceCode: string;
    readonly name: string;
    readonly description: string;
    readonly risk?: RuneRisk;
    readonly inputSchema?: RuneSchema;
    readonly outputSchema?: RuneSchema;
}, {
    readonly path: string;
    readonly configPath: string;
}>;
export declare const createRitualRune: Rune<{
    readonly id: string;
    readonly prompt: string;
    readonly everyMinutes: number;
}, {
    readonly ritual: {
        readonly id: string;
        readonly everyMinutes: number;
        readonly nextRunAt: string;
    };
}>;
export declare const speakRune: Rune<{
    readonly text: string;
    readonly voice?: string;
}, {
    readonly spoken: boolean;
    readonly path: string;
}>;
export declare const listenRune: Rune<{
    readonly durationMs?: number;
}, {
    readonly text: string;
    readonly path: string;
}>;
export declare const workspaceRunes: readonly [Rune<{
    readonly path: string;
}, {
    readonly path: string;
    readonly content: string;
}>, Rune<{
    readonly path?: string;
}, {
    readonly path: string;
    readonly entries: readonly {
        name: string;
        isDirectory: boolean;
        size?: number;
    }[];
}>, Rune<{
    readonly pattern: string;
    readonly include?: string;
}, {
    readonly matches: readonly string[];
}>, Rune<{
    readonly query: string;
}, {
    readonly files: readonly string[];
}>, Rune<{
    readonly command: string;
    readonly args?: readonly string[];
}, {
    readonly stdout: string;
    readonly stderr: string;
}>, Rune<{
    readonly path: string;
    readonly find?: string;
    readonly replace?: string;
    readonly patch?: string;
    readonly dryRun?: boolean;
    readonly formatter?: readonly string[];
}, {
    readonly path?: string;
    readonly changed: boolean;
    readonly preview?: string;
    readonly files?: readonly {
        readonly path: string;
        readonly changed: boolean;
        readonly preview: string;
        readonly rollbackPath?: string;
    }[];
}>, Rune<{
    readonly path: string;
    readonly content: string;
}, {
    readonly path: string;
}>, Rune<{
    readonly path: string;
}, {
    readonly path: string;
}>, Rune<{
    readonly patch: string;
    readonly dryRun?: boolean;
    readonly formatter?: readonly string[];
}, {
    readonly changed: boolean;
    readonly files: readonly {
        readonly path: string;
        readonly changed: boolean;
        readonly preview: string;
        readonly rollbackPath?: string;
    }[];
}>, Rune<{
    readonly maxDepth?: number;
}, {
    readonly tree: string;
}>, Rune<{
    readonly sourceCode: string;
    readonly name: string;
    readonly description: string;
    readonly risk?: RuneRisk;
    readonly inputSchema?: RuneSchema;
    readonly outputSchema?: RuneSchema;
}, {
    readonly path: string;
    readonly configPath: string;
}>, Rune<{
    readonly id: string;
    readonly prompt: string;
    readonly everyMinutes: number;
}, {
    readonly ritual: {
        readonly id: string;
        readonly everyMinutes: number;
        readonly nextRunAt: string;
    };
}>, Rune<{
    readonly text: string;
    readonly voice?: string;
}, {
    readonly spoken: boolean;
    readonly path: string;
}>, Rune<{
    readonly durationMs?: number;
}, {
    readonly text: string;
    readonly path: string;
}>];
