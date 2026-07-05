import { describe, expect, it } from "vitest";
import { CrdtBus } from "../src/index.js";
import type { Message, CrdtEntry } from "../src/index.js";

function makeMsg(content: string, ts = "2026-01-01T00:00:00.000Z"): Message {
  return { role: "user", content, createdAt: new Date(ts) };
}

describe("CrdtBus", () => {
  it("appends entries with increasing clock", () => {
    const bus = new CrdtBus("v1");
    const e1 = bus.append("s1", makeMsg("hello"));
    const e2 = bus.append("s1", makeMsg("world"));

    expect(e1.logicalClock).toBe(1);
    expect(e2.logicalClock).toBe(2);
    expect(e1.vesselId).toBe("v1");
  });

  it("merges entries from other vessels", () => {
    const bus = new CrdtBus("v1");
    bus.append("s1", makeMsg("from v1"));

    bus.merge([
      { sessionId: "s1", vesselId: "v2", logicalClock: 1, message: makeMsg("from v2") },
    ]);

    const entries = bus.getAllEntries();
    expect(entries).toHaveLength(2);
  });

  it("deduplicates entries on merge", () => {
    const bus = new CrdtBus("v1");
    const e1 = bus.append("s1", makeMsg("hello"));

    bus.merge([e1]);
    expect(bus.getAllEntries()).toHaveLength(1);
  });

  it("toMessages returns sorted messages by clock", () => {
    const bus = new CrdtBus("v2");
    bus.append("s1", makeMsg("second", "2026-01-01T00:00:02.000Z"));

    bus.merge([
      { sessionId: "s1", vesselId: "v1", logicalClock: 1, message: makeMsg("first", "2026-01-01T00:00:01.000Z") },
    ]);

    const messages = bus.toMessages("s1");
    expect(messages).toHaveLength(2);
  });

  it("triggers merge events via onMerge", async () => {
    const bus = new CrdtBus("v1");
    const events: string[] = [];

    const unsub = bus.onMerge((event) => {
      events.push(event.entry.message.content);
    });

    bus.append("s1", makeMsg("test-merge-event"));
    expect(events).toContain("test-merge-event");

    unsub();
    bus.append("s1", makeMsg("after-unsub"));
    expect(events.filter((e) => e === "after-unsub")).toHaveLength(0);
  });
});
