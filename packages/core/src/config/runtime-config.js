import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { getVaultSecret } from "@rimuru/vault";
export async function loadRuntimeConfig(options) {
    const env = options.env ?? process.env;
    const fileConfig = await readConfigFile(options.workspace);
    const vesselId = env.RIMURU_VESSEL ?? fileConfig.vessel ?? "main";
    const vessel = fileConfig.vessels?.[vesselId];
    const provider = parseProvider(env.RIMURU_SHARD ??
        env.RIMURU_PROVIDER ??
        vessel?.shard ??
        vessel?.provider ??
        fileConfig.shard ??
        fileConfig.provider ??
        "mock");
    let vaultApiKey;
    try {
        vaultApiKey = await getVaultSecret(options.workspace, "RIMURU_API_KEY", env);
    }
    catch { }
    if (!vaultApiKey && provider !== "mock" && provider !== "openai-compatible") {
        try {
            vaultApiKey = await getVaultSecret(options.workspace, `RIMURU_${provider.toUpperCase().replace("-", "_")}_KEY`, env);
        }
        catch { }
    }
    const finalApiKey = env.RIMURU_API_KEY ?? vaultApiKey ?? vessel?.apiKey ?? fileConfig.apiKey;
    return {
        vesselId,
        provider,
        model: env.RIMURU_MODEL ?? vessel?.model ?? fileConfig.model ?? defaultModel(provider),
        ...((env.RIMURU_BASE_URL ?? vessel?.baseUrl ?? fileConfig.baseUrl)
            ? { baseUrl: env.RIMURU_BASE_URL ?? vessel?.baseUrl ?? fileConfig.baseUrl }
            : {}),
        ...(finalApiKey ? { apiKey: finalApiKey } : {}),
        sessionId: env.RIMURU_SOUL ??
            env.RIMURU_SESSION ??
            vessel?.soul ??
            vessel?.sessionId ??
            fileConfig.soul ??
            fileConfig.sessionId ??
            "default",
        memoryDir: resolveConfigPath(options.workspace, env.RIMURU_CHRONICLE_DIR ??
            env.RIMURU_MEMORY_DIR ??
            vessel?.chronicleDir ??
            vessel?.memoryDir ??
            fileConfig.chronicleDir ??
            fileConfig.memoryDir ??
            join(options.workspace, ".rimuru", "sessions")),
        allowedRisks: parseAllowedRisks(env.RIMURU_VOWS ??
            env.RIMURU_ALLOW_RISKS ??
            (vessel?.vows ?? vessel?.allowedRisks ?? fileConfig.vows ?? fileConfig.allowedRisks)?.join(",") ??
            "read"),
        sandboxMode: parseSandboxMode(env.RIMURU_BARRIER ??
            env.RIMURU_SANDBOX ??
            vessel?.barrier ??
            vessel?.sandboxMode ??
            fileConfig.barrier ??
            fileConfig.sandboxMode ??
            "none"),
        vessels: fileConfig.vessels ?? {},
        fallbackShards: parseFallbacks(fileConfig.fallbackShards ?? fileConfig.failover ?? []),
        circles: fileConfig.circles ?? [{ name: "local", kind: "local", enabled: true }],
        gatewayPort: parsePort(env.RIMURU_GATE_PORT ?? fileConfig.gatewayPort, 19710),
    };
}
async function readConfigFile(workspace) {
    try {
        const raw = await readFile(join(workspace, "rimuru.config.json"), "utf8");
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return {};
        throw error;
    }
}
function parseProvider(provider) {
    if (["mock", "openai-compatible", "anthropic", "gemini", "ollama", "openrouter"].includes(provider))
        return provider;
    throw new Error(`Unsupported provider: ${provider}`);
}
function defaultModel(provider) {
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
function parseAllowedRisks(value) {
    return value
        .split(",")
        .map((risk) => risk.trim())
        .filter(Boolean);
}
function parseSandboxMode(value) {
    if (value === "none" || value === "readonly" || value === "docker" || value === "wasi")
        return value;
    throw new Error(`Unsupported sandbox mode: ${value}`);
}
function parseFallbacks(values) {
    return values.map((value) => ({
        provider: parseProvider(String(value.provider)),
        ...(value.model ? { model: value.model } : {}),
        ...(value.baseUrl ? { baseUrl: value.baseUrl } : {}),
        ...(value.apiKey ? { apiKey: value.apiKey } : {}),
    }));
}
function parsePort(value, fallback) {
    if (value === undefined)
        return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535)
        throw new Error(`Unsupported Gate port: ${value}`);
    return parsed;
}
function resolveConfigPath(workspace, path) {
    return isAbsolute(path) ? resolve(path) : resolve(workspace, path);
}
//# sourceMappingURL=runtime-config.js.map