import type { Rune } from "../core/types.js";
export declare const sendMessageRune: Rune<{
    readonly circle: string;
    readonly chatId: string;
    readonly text: string;
}, {
    readonly sent: boolean;
}>;
