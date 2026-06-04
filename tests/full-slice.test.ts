import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  handleMcpCall,
  MemoryChronicle,
  MockShard,
  RuneRegistry,
  Sovereign,
  workspaceRune,
} from "../src/index.js";
import { AgentLoop } from "../src/index.js";

describe("full assistant slice", () => {
  it("indexes workspace content", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-index-"));
    try {
      await writeFile(join(root, "story.txt"), "rimuru tempest sovereign", "utf8");
      const index = await buildLexicalIndex(root);

      expect(index.search("sovereign").map((file) => file.path)).toEqual(["story.txt"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("handles MCP-style tool list and calls", async () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);

    await expect(handleMcpCall(registry, { method: "tools/list" })).resolves.toMatchObject({
      tools: [{ name: "workspace.ask" }],
    });
    await expect(
      handleMcpCall(registry, {
        method: "tools/call",
        params: { name: "workspace.ask", arguments: { question: "hi" }, workspace: "/tmp", sessionId: "s" },
      }),
    ).resolves.toMatchObject({ content: { answer: "Workspace /tmp received: hi" } });
  });

  it("runs deterministic agent loop", async () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);
    const loop = new AgentLoop({
      sovereign: new Sovereign({ shard: new MockShard(), chronicle: new MemoryChronicle() }),
      runes: registry,
      workspace: "/tmp",
      sessionId: "s",
    });

    const result = await loop.run("answer normally");

    expect(result.plan.objective).toBe("answer normally");
    expect(result.final.response.content).toContain("Rimuru heard:");
  });
});
