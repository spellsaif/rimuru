export type SandboxMode = "none" | "readonly" | "docker" | "wasi";
export interface SandboxCommandInput {
    readonly command: string;
    readonly args?: readonly string[];
    readonly workspace: string;
    readonly signal?: AbortSignal;
    readonly stdin?: string;
}
export declare function runSandboxedCommand(input: SandboxCommandInput, mode?: SandboxMode): Promise<{
    readonly stdout: string;
    readonly stderr: string;
}>;
export declare function sandboxModeFromEnv(env?: NodeJS.ProcessEnv): SandboxMode;
