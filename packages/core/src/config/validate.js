import { existsSync } from "node:fs";
export function validateRuntimeConfig(config, env = process.env) {
    const diagnostics = [];
    if (config.provider !== "mock" && config.provider !== "ollama" && !config.apiKey && !env.RIMURU_API_KEY) {
        diagnostics.push({
            level: "warning",
            code: "provider.missing_api_key",
            message: `Shard '${config.provider}' usually needs RIMURU_API_KEY or apiKey.`,
        });
    }
    if ((config.allowedRisks.includes("write") || config.allowedRisks.includes("execute")) &&
        config.sandboxMode === "none") {
        diagnostics.push({
            level: "warning",
            code: "policy.unbarriered_power",
            message: "Write/execute vows are enabled without a Barrier. Consider barrier=readonly or docker for untrusted use.",
        });
    }
    if (config.allowedRisks.includes("network")) {
        diagnostics.push({
            level: "info",
            code: "policy.network",
            message: "Network vow is enabled; ensure Circle and Rune inputs are trusted.",
        });
    }
    for (const circle of config.circles) {
        if (circle.enabled === false)
            continue;
        if ((circle.kind === "telegram" || circle.kind === "slack" || circle.kind === "discord") &&
            circle.tokenEnv &&
            !env[circle.tokenEnv]) {
            diagnostics.push({
                level: "warning",
                code: "circle.missing_token",
                message: `Circle '${circle.name}' expects token env ${circle.tokenEnv}, but it is not set.`,
            });
        }
        if (circle.kind !== "local" && (!circle.allowFrom || circle.allowFrom.length === 0)) {
            diagnostics.push({
                level: "info",
                code: "circle.pairing_required",
                message: `Circle '${circle.name}' has no allowFrom list; unknown senders will require pairing.`,
            });
        }
    }
    if (config.fallbackShards.some((fallback) => fallback.provider !== "mock" && fallback.provider !== "ollama" && !fallback.apiKey && !env.RIMURU_API_KEY)) {
        diagnostics.push({
            level: "info",
            code: "provider.failover_key",
            message: "One or more fallback shards may need credentials before failover works.",
        });
    }
    if (!existsSync(config.memoryDir))
        diagnostics.push({
            level: "info",
            code: "chronicle.missing_dir",
            message: "Chronicle directory does not exist yet; setup or first chat will create it.",
        });
    return diagnostics;
}
//# sourceMappingURL=validate.js.map