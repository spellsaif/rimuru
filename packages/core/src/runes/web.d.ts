import type { Rune } from "../core/types.js";
export declare const webSearchRune: Rune<{
    readonly query: string;
}, {
    readonly results: readonly {
        title: string;
        snippet: string;
        url: string;
    }[];
}>;
export declare const webFetchUrlRune: Rune<{
    readonly url: string;
}, {
    readonly title: string;
    readonly content: string;
}>;
export declare const webRunes: readonly [Rune<{
    readonly query: string;
}, {
    readonly results: readonly {
        title: string;
        snippet: string;
        url: string;
    }[];
}>, Rune<{
    readonly url: string;
}, {
    readonly title: string;
    readonly content: string;
}>];
