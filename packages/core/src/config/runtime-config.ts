import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVaultSecret } from "@rimuru/vault";

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
  readonly sandboxMode: "none" | "readonly" | "docker";
  readonly vessels: Readonly<Record<string, VesselConfig>>;
  readonly fallbackShards: readonly ProviderAttempt[];
  readonly circles: readonly CircleConfig[];
  readonly gatewayPort: number;
}

export interface LoadConfigOptions {
  readonly workspace: string;
  readonly env?: NodeJS.ProcessEnv;
}

export async function loadRuntimeConfig(options: LoadConfigOptions): Promise<RuntimeConfig> {
  const env = options.env ?? process.env;
  const fileConfig = await readConfigFile(options.workspace);
  const vesselId = env.RIMURU_VESSEL ?? fileConfig.vessel ?? "main";
  const vessel = fileConfig.vessels?.[vesselId];
  const provider = parseProvider(env.RIMURU_SHARD ?? env.RIMURU_PROVIDER ?? vessel?.shard ?? vessel?.provider ?? fileConfig.shard ?? fileConfig.provider ?? "mock");
  
  let vaultApiKey: string | undefined;
  try {
    vaultApiKey = await getVaultSecret(options.workspace, "RIMURU_API_KEY", env);
  } catch {}
  if (!vaultApiKey && provider !== "mock" && provider !== "openai-compatible") {
    try {
      vaultApiKey = await getVaultSecret(options.workspace, `RIMURU_${provider.toUpperCase().replace("-", "_")}_KEY`, env);
    } catch {}
  }
  
  const finalApiKey = env.RIMURU_API_KEY ?? vaultApiKey ?? vessel?.apiKey ?? fileConfig.apiKey;

  return {
    vesselId,
    provider,
    model: env.RIMURU_MODEL ?? vessel?.model ?? fileConfig.model ?? defaultModel(provider),
    ...(env.RIMURU_BASE_URL ?? vessel?.baseUrl ?? fileConfig.baseUrl ? { baseUrl: env.RIMURU_BASE_URL ?? vessel?.baseUrl ?? fileConfig.baseUrl } : {}),
    ...(finalApiKey ? { apiKey: finalApiKey } : {}),
    sessionId: env.RIMURU_SOUL ?? env.RIMURU_SESSION ?? vessel?.soul ?? vessel?.sessionId ?? fileConfig.soul ?? fileConfig.sessionId ?? "default",
    memoryDir: env.RIMURU_CHRONICLE_DIR ?? env.RIMURU_MEMORY_DIR ?? vessel?.chronicleDir ?? vessel?.memoryDir ?? fileConfig.chronicleDir ?? fileConfig.memoryDir ?? join(options.workspace, ".rimuru", "sessions"),
    allowedRisks: parseAllowedRisks(env.RIMURU_VOWS ?? env.RIMURU_ALLOW_RISKS ?? (vessel?.vows ?? vessel?.allowedRisks ?? fileConfig.vows ?? fileConfig.allowedRisks)?.join(",") ?? "read"),
    sandboxMode: parseSandboxMode(env.RIMURU_BARRIER ?? env.RIMURU_SANDBOX ?? vessel?.barrier ?? vessel?.sandboxMode ?? fileConfig.barrier ?? fileConfig.sandboxMode ?? "none"),
    vessels: fileConfig.vessels ?? {},
    fallbackShards: parseFallbacks(fileConfig.fallbackShards ?? fileConfig.failover ?? []),
    circles: fileConfig.circles ?? [{ name: "local", kind: "local", enabled: true }],
    gatewayPort: parsePort(env.RIMURU_GATE_PORT ?? fileConfig.gatewayPort, 19710)
  };
}

interface FileConfig {
  readonly vessel?: string;
  readonly vessels?: Readonly<Record<string, VesselConfig>>;
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
  readonly fallbackShards?: readonly ProviderAttempt[];
  readonly failover?: readonly ProviderAttempt[];
  readonly circles?: readonly CircleConfig[];
  readonly gatewayPort?: string | number;
}

async function readConfigFile(workspace: string): Promise<FileConfig> {
  try {
    const raw = await readFile(join(workspace, "rimuru.config.json"), "utf8");
    const parsed = JSON.parse(raw) as FileConfig;
    return parsed;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

function parseProvider(provider: string): ProviderKind {
  if (["mock", "openai-compatible", "anthropic", "gemini", "ollama", "openrouter"].includes(provider)) return provider as ProviderKind;
  throw new Error(`Unsupported provider: ${provider}`);
}

function defaultModel(provider: ProviderKind): string {
  switch (provider) {
    case "mock":
      return "mock";
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    case "gemini":
      return "gemini-1.5-pro";
    case "ollama":
      return "llama3.1";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "openai-compatible":
      return "gpt-4.1-mini";
  }
}

function parseAllowedRisks(value: string): readonly string[] {
  return value
    .split(",")
    .map((risk) => risk.trim())
    .filter(Boolean);
}

function parseSandboxMode(value: string): "none" | "readonly" | "docker" {
  if (value === "none" || value === "readonly" || value === "docker") return value;
  throw new Error(`Unsupported sandbox mode: ${value}`);
}

function parseFallbacks(values: readonly ProviderAttempt[]): readonly ProviderAttempt[] {
  return values.map((value) => ({
    provider: parseProvider(String(value.provider)),
    ...(value.model ? { model: value.model } : {}),
    ...(value.baseUrl ? { baseUrl: value.baseUrl } : {}),
    ...(value.apiKey ? { apiKey: value.apiKey } : {})
  }));
}

function parsePort(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) throw new Error(`Unsupported Gate port: ${value}`);
  return parsed;
}
