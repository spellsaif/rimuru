import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createSemanticMemory, HashEmbeddingProvider, MemoryChronicle, semanticMemoryRunes } from "../src/index.js";

describe("semantic memory", () => {
  it("creates deterministic embeddings", async () => {
    const embeddings = new HashEmbeddingProvider(8);

    await expect(embeddings.embed("rimuru sovereign runtime")).resolves.toEqual(
      await embeddings.embed("rimuru sovereign runtime"),
    );
  });

  it("remembers and searches notes", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-semantic-"));
    try {
      const memory = createSemanticMemory(root);
      await memory.remember({ sessionId: "s", scope: "note", text: "Rimuru has provider shards and typed runes" });

      const results = await memory.search("provider runes", { sessionId: "s" });

      expect(results[0]?.record.summary).toContain("provider shards");
      expect(results[0]?.score).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("indexes chronicle messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-semantic-"));
    try {
      const chronicle = new MemoryChronicle();
      await chronicle.append("s", [
        { role: "user", content: "How does Chronicle memory work?", createdAt: new Date("2026-01-01T00:00:00.000Z") },
      ]);
      const memory = createSemanticMemory(root);

      await expect(memory.indexChronicle("s", chronicle)).resolves.toHaveLength(1);
      await expect(memory.search("chronicle", { sessionId: "s" })).resolves.toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exposes semantic memory runes", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-semantic-"));
    try {
      const memory = createSemanticMemory(root);
      const [remember, search] = semanticMemoryRunes(memory);

      await remember!.invoke({ text: "Sovereign orchestrates Shards" }, { workspace: root, sessionId: "s" });
      const output = await search!.invoke({ query: "orchestrates shards" }, { workspace: root, sessionId: "s" });

      expect(JSON.stringify(output)).toContain("Sovereign orchestrates Shards");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
