export type ProviderKind = "mock" | "openai-compatible" | "anthropic" | "gemini" | "ollama" | "openrouter";
export interface ProviderAttempt {
    readonly provider: ProviderKind;
    readonly model?: string;
    readonly baseUrl?: string;
    readonly apiKey?: string;
}
export interface VesselConfig {
    readonly provider?: string;
    readonly shard?: string;
    readonly model?: string;
    readonly baseUrl?: string;
    readonly apiKey?: string;
    readonly sessionId?: string;
    readonly soul?: string;
    readonly memoryDir?: string;
    readonly chronicleDir?: string;
    readonly allowedRisks?: readonly string[];
    readonly vows?: readonly string[];
    readonly sandboxMode?: string;
    readonly barrier?: string;
    readonly workspace?: string;
    readonly systemPrompt?: string;
}
export interface CircleConfig {
    readonly name: string;
    readonly kind: "local" | "webhook" | "telegram" | "slack" | "discord" | "whatsapp";
    readonly enabled?: boolean;
    readonly tokenEnv?: string;
    readonly token?: string;
    readonly signingSecret?: string;
    readonly publicKey?: string;
    readonly secret?: string;
    readonly allowFrom?: readonly string[];
    readonly sessionId?: string;
}
export interface RuntimeConfig {
    readonly vesselId: string;
    readonly provider: ProviderKind;
    readonly model: string;
    readonly baseUrl?: string;
    readonly apiKey?: string;
    readonly sessionId: string;
    readonly memoryDir: string;
    readonly allowedRisks: readonly string[];
    readonly sandboxMode: "none" | "readonly" | "docker" | "wasi";
    readonly vessels: Readonly<Record<string, VesselConfig>>;
    readonly fallbackShards: readonly ProviderAttempt[];
    readonly circles: readonly CircleConfig[];
    readonly gatewayPort: number;
}
export interface LoadConfigOptions {
    readonly workspace: string;
    readonly env?: NodeJS.ProcessEnv;
}
export declare function loadRuntimeConfig(options: LoadConfigOptions): Promise<RuntimeConfig>;
