import { describe, expect, it } from "vitest";
import { OpenAICompatibleShard } from "../src/index.js";

describe("OpenAICompatibleShard streaming", () => {
  it("parses server-sent event chunks", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"rimuru"}}],"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    const shard = new OpenAICompatibleShard({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "m",
      fetchImpl: async () => new Response(body, { status: 200 })
    });

    const chunks = [];
    for await (const chunk of shard.stream!([{ role: "user", content: "hi", createdAt: new Date() }])) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: "text", text: "hello " },
      { type: "text", text: "rimuru" },
      { type: "usage", usage: { input: 1, output: 2 } },
      { type: "done" }
    ]);
  });
});
