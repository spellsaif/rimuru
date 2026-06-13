import { AnthropicShard } from "./anthropic.js";
import { GeminiShard } from "./gemini.js";
import { MockShard } from "./mock.js";
import { OpenAICompatibleShard } from "./openai-compatible.js";
import { OpenRouterShard } from "./openrouter.js";
const adapterRegistry = new Map();
export function registerShardAdapter(adapter) {
    adapterRegistry.set(adapter.kind, adapter);
}
registerShardAdapter({
    kind: "mock",
    matches: () => true,
    create: () => new MockShard(),
});
registerShardAdapter({
    kind: "openai-compatible",
    matches: (baseUrl) => !!baseUrl,
    create: (config) => {
        if (!config.baseUrl)
            throw new Error("RIMURU_BASE_URL is required for openai-compatible provider");
        if (!config.apiKey)
            throw new Error("RIMURU_API_KEY is required for openai-compatible provider");
        return new OpenAICompatibleShard({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
    },
});
registerShardAdapter({
    kind: "openrouter",
    matches: (baseUrl) => !baseUrl || baseUrl.includes("openrouter.ai"),
    create: (config) => {
        if (!config.apiKey)
            throw new Error("RIMURU_API_KEY is required for openrouter provider");
        return new OpenRouterShard({
            apiKey: config.apiKey,
            model: config.model,
            ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        });
    },
});
registerShardAdapter({
    kind: "ollama",
    matches: (baseUrl) => !baseUrl || baseUrl.includes("11434") || baseUrl.includes("ollama"),
    create: (config) => {
        return new OpenAICompatibleShard({
            baseUrl: config.baseUrl ?? "http://localhost:11434/v1",
            apiKey: config.apiKey ?? "ollama",
            model: config.model,
        });
    },
});
registerShardAdapter({
    kind: "anthropic",
    matches: (baseUrl) => !baseUrl || baseUrl.includes("anthropic.com"),
    create: (config) => {
        if (!config.apiKey)
            throw new Error("RIMURU_API_KEY is required for anthropic provider");
        return new AnthropicShard({
            apiKey: config.apiKey,
            model: config.model,
            ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        });
    },
});
registerShardAdapter({
    kind: "gemini",
    matches: (baseUrl) => !baseUrl || baseUrl.includes("googleapis.com") || baseUrl.includes("generativelanguage"),
    create: (config) => {
        if (!config.apiKey)
            throw new Error("RIMURU_API_KEY is required for gemini provider");
        return new GeminiShard({
            apiKey: config.apiKey,
            model: config.model,
            ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        });
    },
});
export function createShard(config) {
    const adapter = adapterRegistry.get(config.provider);
    if (!adapter) {
        if (config.provider === "auto" && config.baseUrl) {
            for (const [kind, ad] of adapterRegistry) {
                if (kind === "mock")
                    continue;
                if (ad.matches(config.baseUrl))
                    return ad.create(config);
            }
        }
        throw new Error(`Unknown or unsupported provider: ${config.provider}. Please configure a valid Shard (e.g., openai-compatible, openrouter, anthropic, gemini, ollama).`);
    }
    return adapter.create(config);
}
export function listShardKinds() {
    return [...adapterRegistry.keys()];
}
//# sourceMappingURL=factory.js.map