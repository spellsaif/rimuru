import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnthropicShard, FlowBus, GeminiShard, MemoryChronicle, MockShard, RuneRegistry, serveMcpStdio, Sovereign, workspaceRune, resolveWorkspacePath, applyUnifiedPatch } from "../src/index.js";
import { runSandboxedCommand } from "../src/index.js";
import { PassThrough } from "node:stream";

describe("true streaming providers", () => {
  it("streams Anthropic SSE deltas", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n'));
        controller.close();
      }
    });
    const shard = new AnthropicShard({ apiKey: "k", model: "m", fetchImpl: async () => new Response(body) });
    const chunks = [];
    for await (const chunk of shard.stream!([{ role: "user", content: "x", createdAt: new Date() }])) chunks.push(chunk);
    expect(chunks).toContainEqual({ type: "text", text: "hi" });
  });

  it("streams Gemini SSE deltas", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"yo"}]}}]}\n\n'));
        controller.close();
      }
    });
    const shard = new GeminiShard({ apiKey: "k", model: "m", fetchImpl: async () => new Response(body) });
    const chunks = [];
    for await (const chunk of shard.stream!([{ role: "user", content: "x", createdAt: new Date() }])) chunks.push(chunk);
    expect(chunks).toContainEqual({ type: "text", text: "yo" });
  });
});

describe("MCP server", () => {
  it("serves tool calls over JSON-RPC lines", async () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk) => chunks.push(String(chunk)));
    const running = serveMcpStdio({ registry, workspace: "/tmp", sessionId: "s", input, output });
    input.write(`${JSON.stringify({ id: 1, method: "tools/list" })}\n`);
    input.end();
    await running;
    expect(chunks.join("")).toContain("workspace.ask");
  });
});

describe("sandboxing", () => {
  it("denies commands in readonly sandbox", async () => {
    await expect(runSandboxedCommand({ command: "node", args: ["--version"], workspace: process.cwd() }, "readonly")).rejects.toThrow("denies command execution");
  });

  it("prevents cross-drive path traversal on Windows", () => {
    if (process.platform === "win32") {
      expect(() => resolveWorkspacePath("C:\\workspace", "D:\\secrets.txt")).toThrow("escapes workspace (drive boundary)");
    }
  });

  it("validates formatter command in applyUnifiedPatch", async () => {
    const patch = `--- /dev/null
+++ b/file.txt
@@ -0,0 +1,1 @@
+new`;
    await expect(applyUnifiedPatch({
      workspace: "/tmp",
      patch,
      resolvePath: () => "/tmp/file.txt",
      formatter: ["../malicious-formatter", "--arg"]
    })).rejects.toThrow("Command must be a simple executable name");
  });

  it("denies non-whitelisted formatter commands in applyUnifiedPatch", async () => {
    const patch = `--- /dev/null
+++ b/file.txt
@@ -0,0 +1,1 @@
+new`;
    await expect(applyUnifiedPatch({
      workspace: "/tmp",
      patch,
      resolvePath: () => "/tmp/file.txt",
      formatter: ["bash", "-c", "echo malicious"]
    })).rejects.toThrow("is not a permitted formatter");
  });
});

describe("golden traces", () => {
  it("keeps the core event sequence stable", async () => {
    const golden = JSON.parse(await readFile(join(process.cwd(), "tests", "fixtures", "golden-trace.json"), "utf8")) as { events: string[]; responsePrefix: string };
    const flowBus = new FlowBus();
    const result = await new Sovereign({ shard: new MockShard(), chronicle: new MemoryChronicle(), flowBus, clock: () => new Date("2026-01-01T00:00:00.000Z") }).run({
      prompt: "golden trace",
      workspace: process.cwd(),
      sessionId: "golden"
    });
    expect(result.events.map((event) => event.type)).toEqual(golden.events);
    expect(result.response.content).toContain(golden.responsePrefix);
  });
});
