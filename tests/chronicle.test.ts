import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonChronicle } from "../src/index.js";

describe("JsonChronicle", () => {
  it("persists and reloads messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-"));
    try {
      const chronicle = new JsonChronicle(root);
      await chronicle.append("session/unsafe", [
        { role: "user", content: "slime", createdAt: new Date("2026-01-01T00:00:00.000Z") }
      ]);

      const loaded = await chronicle.load("session/unsafe");

      expect(loaded).toEqual([
        { role: "user", content: "slime", createdAt: new Date("2026-01-01T00:00:00.000Z") }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
