import type { Rune } from "../core/types.js";
export declare const spawnVesselRune: Rune<{
    readonly soul: string;
    readonly vows: readonly string[];
    readonly objective: string;
}, {
    readonly sessionId: string;
    readonly response: string;
}>;
export declare const delegateVesselRune: Rune<{
    readonly sessionId: string;
    readonly objective: string;
}, {
    readonly response: string;
}>;
export declare const speculateRune: Rune<{
    readonly objective: string;
}, {
    readonly plan: any;
    readonly observations: any[];
}>;
export declare const vesselsRunes: (Rune<{
    readonly soul: string;
    readonly vows: readonly string[];
    readonly objective: string;
}, {
    readonly sessionId: string;
    readonly response: string;
}> | Rune<{
    readonly sessionId: string;
    readonly objective: string;
}, {
    readonly response: string;
}> | Rune<{
    readonly objective: string;
}, {
    readonly plan: any;
    readonly observations: any[];
}>)[];
