import { describe, expect, it } from "vitest";
import { OpenAICompatibleShard } from "../src/index.js";

describe("OpenAICompatibleShard streaming", () => {
  it("parses server-sent event chunks", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'));
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"rimuru"}}],"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const shard = new OpenAICompatibleShard({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "m",
      fetchImpl: async () => new Response(body, { status: 200 }),
    });

    const chunks = [];
    for await (const chunk of shard.stream!([{ role: "user", content: "hi", createdAt: new Date() }]))
      chunks.push(chunk);

    expect(chunks).toEqual([
      { type: "text", text: "hello " },
      { type: "text", text: "rimuru" },
      { type: "usage", usage: { input: 1, output: 2 } },
      { type: "done" },
    ]);
  });
});

import { ReActStreamParser } from "../src/index.js";

describe("ReActStreamParser", () => {
  it("streams standard ReAct sequence with formatted thoughts and actions, silencing Input", () => {
    let out = "";
    const parser = new ReActStreamParser((text) => {
      out += text;
    });

    parser.ingest("Thought: I should search for files.\nAction: workspace.fileTree\nInput: {}");
    parser.flush();

    expect(out).toContain("🧠 I should search for files.");
    expect(out).toContain("⚡ Running workspace.fileTree...");
    expect(out).not.toContain("Input:");
  });

  it("handles split chunk boundaries for Thought and Action keywords", () => {
    let out = "";
    const parser = new ReActStreamParser((text) => {
      out += text;
    });

    const chunks = [
      "Th",
      "ou",
      "ght: ",
      "let's check workspace.\n",
      "Act",
      "ion: ",
      "workspace.listDir\n",
      "Input:",
      " {}",
    ];
    for (const chunk of chunks) {
      parser.ingest(chunk);
    }
    parser.flush();

    expect(out).toContain("🧠 let's check workspace.");
    expect(out).toContain("⚡ Running workspace.listDir...");
    expect(out).not.toContain("Input:");
  });

  it("falls back to direct stream when Thought keyword is missing or response is direct conversational response", () => {
    let out = "";
    const parser = new ReActStreamParser((text) => {
      out += text;
    });

    parser.ingest("Hello, I am Rimuru! How can I help you?");
    parser.flush();

    expect(out).toBe("Hello, I am Rimuru! How can I help you?");
  });

  it("tolerates whitespace and casing variation in ReAct headers", () => {
    let out = "";
    const parser = new ReActStreamParser((text) => {
      out += text;
    });

    parser.ingest("\n\n  THOUGHT:   let me write hello.txt  \n   ACTION:   workspace.writeFile  \n   Input: {}");
    parser.flush();

    expect(out).toContain("🧠 let me write hello.txt");
    expect(out).toContain("⚡ Running workspace.writeFile...");
    expect(out).not.toContain("Input:");
  });
});
