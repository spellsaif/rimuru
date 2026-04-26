import { describe, expect, it } from "vitest";
import { MemoryChronicle, MockShard, Sovereign } from "../src/index.js";

describe("Sovereign", () => {
  it("runs a prompt through memory and provider boundaries", async () => {
    const chronicle = new MemoryChronicle();
    const sovereign = new Sovereign({ shard: new MockShard(), chronicle });

    const result = await sovereign.run({ prompt: "hello tempest", workspace: "/tmp/work", sessionId: "s1" });

    expect(result.response.content).toBe("Rimuru heard: hello tempest");
    expect(result.transcript.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.events.map((event) => event.type)).toEqual([
      "run.started",
      "memory.loaded",
      "provider.requested",
      "provider.responded",
      "memory.saved",
      "run.completed"
    ]);
  });

  it("keeps session memory between runs", async () => {
    const chronicle = new MemoryChronicle();
    const sovereign = new Sovereign({ shard: new MockShard(), chronicle });

    await sovereign.run({ prompt: "first", workspace: "/tmp/work", sessionId: "s1" });
    const second = await sovereign.run({ prompt: "second", workspace: "/tmp/work", sessionId: "s1" });

    expect(second.transcript).toHaveLength(4);
    expect(second.events.some((event) => event.type === "memory.loaded" && event.count === 2)).toBe(true);
  });
});
