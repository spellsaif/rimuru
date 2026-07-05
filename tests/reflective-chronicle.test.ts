import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MemoryChronicle, ReflectiveChronicle, JsonColdStore, JsonCrystalStore, createReflectiveChronicle } from "../src/index.js";
import type { Message, ColdStore } from "../src/index.js";

describe("ReflectiveChronicle", () => {
  it("load/appends/reads through all tiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-reflective-"));
    try {
      const warm = new MemoryChronicle();
      const chronicle = createReflectiveChronicle({ warm, root });

      await chronicle.append("s1", [
        { role: "user", content: "hello", createdAt: new Date("2026-01-01") },
        { role: "assistant", content: "hi there", createdAt: new Date("2026-01-01") },
      ]);

      const loaded = await chronicle.load("s1");
      expect(loaded).toHaveLength(2);
      expect(loaded[0]?.content).toBe("hello");
      expect(loaded[1]?.content).toBe("hi there");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("hot tier keeps last N messages", async () => {
    const warm = new MemoryChronicle();
    const chronicle = new ReflectiveChronicle({ warm, hotCapacity: 5 });

    const msgs: Message[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: `msg-${i}`, createdAt: new Date() });
    }
    await chronicle.append("s1", msgs);

    const hot = chronicle.hotTier();
    expect(hot.size).toBeLessThanOrEqual(5);
  });

  it("cold tier stores and searches entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-cold-"));
    try {
      const warm = new MemoryChronicle();
      const cold = new JsonColdStore(root);
      const chronicle = new ReflectiveChronicle({ warm, cold });

      await chronicle.append("s1", [
        { role: "user", content: "Rimuru is a local-first agent runtime with typed runes", createdAt: new Date() },
      ]);

      const results = await cold.search("agent runtime", { sessionId: "s1" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.entry.text).toContain("Rimuru");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("crystal tier saves and lists entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-crystal-"));
    try {
      const crystal = new JsonCrystalStore(root);
      await crystal.save({
        id: "c1",
        sessionId: "s1",
        topic: "overview",
        summary: "Discussed Rimuru architecture",
        sourceTurns: 5,
        tokenCount: 200,
        createdAt: new Date().toISOString(),
      });

      const list = await crystal.list("s1");
      expect(list).toHaveLength(1);
      expect(list[0]!.topic).toBe("overview");

      const found = await crystal.findByTopic("s1", "overview");
      expect(found).toBeDefined();
      expect(found!.summary).toContain("architecture");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recall returns messages within budget", async () => {
    const warm = new MemoryChronicle();
    const chronicle = createReflectiveChronicle({ warm });

    const msgs: Message[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: `token heavy message number ${i} `.repeat(20), createdAt: new Date() });
    }
    await chronicle.append("s1", msgs);

    const result = await chronicle.recall("heavy message", { budget: 500, sessionId: "s1" });
    const totalTokens = result.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    expect(totalTokens).toBeLessThanOrEqual(600);
    expect(result.length).toBeGreaterThan(0);
  });

  it("reflect generates crystal entry from hot tier", async () => {
    const warm = new MemoryChronicle();
    const chronicle = createReflectiveChronicle({ warm });

    const msgs: Message[] = [
      { role: "user", content: "How does the predicate protocol work?", createdAt: new Date() },
      { role: "assistant", content: "Predicate is a typed tool protocol that replaces ReAct parsing.", createdAt: new Date() },
      { role: "user", content: "What about the reflective chronicle?", createdAt: new Date() },
      { role: "assistant", content: "It tiers memory into hot, warm, cold, and crystal.", createdAt: new Date() },
    ];
    await chronicle.append("s1", msgs);

    const crystal = await chronicle.reflect("s1", async (msgs) => ({
      topic: "predicate-protocol",
      summary: `Conversation covered: ${msgs.map((m) => m.content.slice(0, 40)).join("; ")}`,
    }));

    expect(crystal).toBeDefined();
    expect(crystal!.topic).toBe("predicate-protocol");
    expect(crystal!.sourceTurns).toBe(4);
  });

  it("cold tier is pluggable", async () => {
    const warm = new MemoryChronicle();
    let storeCalled = false;
    const customCold: ColdStore = {
      name: "mock-cold",
      async store() { storeCalled = true; },
      async search() { return []; },
      async compact() {},
    };

    const chronicle = new ReflectiveChronicle({ warm, cold: customCold });
    await chronicle.append("s1", [{ role: "user", content: "test", createdAt: new Date() }]);
    expect(storeCalled).toBe(true);
  });
});
