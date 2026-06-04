import { describe, expect, it } from "vitest";
import { AnthropicShard, createShard, GeminiShard, OpenAICompatibleShard } from "../src/index.js";

describe("providers", () => {
  it("creates a mock shard from config", () => {
    const shard = createShard({
      provider: "mock",
      model: "mock",
      sessionId: "s",
      memoryDir: "/tmp",
      allowedRisks: ["read"],
    });

    expect(shard.name).toBe("mock");
  });

  it("calls OpenAI-compatible chat completions", async () => {
    const calls: unknown[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ input: String(input), init });
      return Response.json({
        choices: [{ message: { content: "hello from provider" } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      });
    };
    const shard = new OpenAICompatibleShard({
      baseUrl: "https://example.test/v1/",
      apiKey: "secret",
      model: "m",
      fetchImpl,
    });

    const response = await shard.complete([
      { role: "user", content: "hi", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    expect(response).toEqual({ content: "hello from provider", usage: { input: 3, output: 4 } });
    expect(calls).toHaveLength(1);
  });

  it("creates provider-specific shards", () => {
    expect(
      createShard({ provider: "ollama", model: "llama", sessionId: "s", memoryDir: "/tmp", allowedRisks: ["read"] })
        .name,
    ).toBe("openai-compatible");
    expect(
      createShard({
        provider: "openrouter",
        apiKey: "k",
        model: "m",
        sessionId: "s",
        memoryDir: "/tmp",
        allowedRisks: ["read"],
      }).name,
    ).toBe("openrouter");
  });

  it("calls Anthropic messages API", async () => {
    const shard = new AnthropicShard({
      apiKey: "k",
      model: "m",
      fetchImpl: async () =>
        Response.json({ content: [{ text: "claude" }], usage: { input_tokens: 1, output_tokens: 2 } }),
    });
    await expect(shard.complete([{ role: "user", content: "hi", createdAt: new Date() }])).resolves.toEqual({
      content: "claude",
      usage: { input: 1, output: 2 },
    });
  });

  it("calls Gemini generateContent API", async () => {
    const shard = new GeminiShard({
      apiKey: "k",
      model: "m",
      fetchImpl: async () => Response.json({ candidates: [{ content: { parts: [{ text: "gemini" }] } }] }),
    });
    await expect(shard.complete([{ role: "user", content: "hi", createdAt: new Date() }])).resolves.toEqual({
      content: "gemini",
    });
  });
});
