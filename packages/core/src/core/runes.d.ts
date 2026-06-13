import { z } from "zod";
import type { Rune, RuneContext, RuneMiddleware, RuneRisk } from "./types.js";
export interface RuneEntry {
    readonly rune: Rune;
    readonly zodInput?: z.ZodType<any>;
    readonly zodOutput?: z.ZodType<any>;
}
export interface RuneRegistryOptions {
    readonly middlewares?: readonly RuneMiddleware[];
}
export declare class RuneRegistry {
    #private;
    middlewares: RuneMiddleware[];
    constructor(options?: RuneRegistryOptions);
    register(rune: Rune): void;
    deregister(name: string): void;
    toolset(name: string, runeNames: readonly string[]): void;
    enableToolset(name: string): void;
    disableToolset(name: string): void;
    getEnabledToolsets(): readonly string[];
    list(): readonly Rune[];
    byRisk(risk: RuneRisk): readonly Rune[];
    describe(): readonly {
        readonly name: string;
        readonly description: string;
        readonly risk: string;
        readonly inputSchema?: any;
        readonly outputSchema?: any;
    }[];
    invoke(name: string, input: unknown, context: RuneContext): Promise<unknown>;
    invokeStream(name: string, input: unknown, context: RuneContext): AsyncIterable<unknown>;
}
export declare const workspaceRune: Rune<{
    readonly question: string;
}, {
    readonly answer: string;
}>;
