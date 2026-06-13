import type { RuntimeConfig } from "./runtime-config.js";
export interface ConfigDiagnostic {
    readonly level: "error" | "warning" | "info";
    readonly code: string;
    readonly message: string;
}
export declare function validateRuntimeConfig(config: RuntimeConfig, env?: NodeJS.ProcessEnv): readonly ConfigDiagnostic[];
