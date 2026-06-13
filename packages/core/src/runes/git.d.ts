import type { Rune } from "../core/types.js";
export declare const gitStatusRune: Rune<Record<string, never>, {
    readonly status: string;
}>;
export declare const gitDiffRune: Rune<{
    readonly staged?: boolean;
}, {
    readonly diff: string;
}>;
export declare const gitSummaryRune: Rune<Record<string, never>, {
    readonly summary: string;
}>;
export declare const gitLogRune: Rune<{
    readonly limit?: number;
}, {
    readonly log: string;
}>;
export declare const gitAddRune: Rune<{
    readonly files: readonly string[];
}, {
    readonly status: string;
}>;
export declare const gitCommitRune: Rune<{
    readonly message: string;
}, {
    readonly result: string;
}>;
export declare const gitPushRune: Rune<{
    readonly remote?: string;
    readonly branch?: string;
}, {
    readonly result: string;
}>;
export declare const gitPullRune: Rune<{
    readonly remote?: string;
    readonly branch?: string;
}, {
    readonly result: string;
}>;
export declare const gitRunes: readonly [Rune<Record<string, never>, {
    readonly status: string;
}>, Rune<{
    readonly staged?: boolean;
}, {
    readonly diff: string;
}>, Rune<Record<string, never>, {
    readonly summary: string;
}>, Rune<{
    readonly limit?: number;
}, {
    readonly log: string;
}>, Rune<{
    readonly files: readonly string[];
}, {
    readonly status: string;
}>, Rune<{
    readonly message: string;
}, {
    readonly result: string;
}>, Rune<{
    readonly remote?: string;
    readonly branch?: string;
}, {
    readonly result: string;
}>, Rune<{
    readonly remote?: string;
    readonly branch?: string;
}, {
    readonly result: string;
}>];
