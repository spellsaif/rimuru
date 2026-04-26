import type { RuntimeConfig } from "../config/runtime-config.js";
import type { Shard } from "../core/types.js";
import { OpenAICompatibleShard } from "./openai-compatible.js";
import { OpenRouterShard } from "./openrouter.js";
import { AnthropicShard } from "./anthropic.js";
import { GeminiShard } from "./gemini.js";

export function createShard(config: RuntimeConfig): Shard {
  switch (config.provider) {
    case "openai-compatible":
      if (!config.baseUrl) throw new Error("RIMURU_BASE_URL is required for openai-compatible provider");
      if (!config.apiKey) throw new Error("RIMURU_API_KEY is required for openai-compatible provider");
      return new OpenAICompatibleShard({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
    case "openrouter":
      if (!config.apiKey) throw new Error("RIMURU_API_KEY is required for openrouter provider");
      return new OpenRouterShard({ apiKey: config.apiKey, model: config.model, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
    case "ollama":
      return new OpenAICompatibleShard({ baseUrl: config.baseUrl ?? "http://localhost:11434/v1", apiKey: config.apiKey ?? "ollama", model: config.model });
    case "anthropic":
      if (!config.apiKey) throw new Error("RIMURU_API_KEY is required for anthropic provider");
      return new AnthropicShard({ apiKey: config.apiKey, model: config.model, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
    case "gemini":
      if (!config.apiKey) throw new Error("RIMURU_API_KEY is required for gemini provider");
      return new GeminiShard({ apiKey: config.apiKey, model: config.model, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
    default:
      throw new Error(`Unknown or unsupported provider: ${config.provider}. Please configure a valid Shard (e.g., openai-compatible, openrouter, anthropic, gemini, ollama).`);
  }
}
