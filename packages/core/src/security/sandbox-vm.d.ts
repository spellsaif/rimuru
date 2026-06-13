/**
 * Executes untrusted JS code dynamically in a secure, resource-constrained WebAssembly VM.
 * Exposes the `input` variable to the script and returns the result (either via return value or by setting `globalThis.output`).
 */
export interface DynamicRuneExecutionOptions {
    readonly timeoutMs?: number;
    readonly memoryLimitBytes?: number;
    readonly maxStackSizeBytes?: number;
}
export declare function executeDynamicRune(code: string, input: unknown, options?: DynamicRuneExecutionOptions): Promise<unknown>;
