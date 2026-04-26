import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readFileRune, searchRune } from "../src/index.js";

describe("workspace runes", () => {
  it("reads files without allowing workspace escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-runes-"));
    try {
      await writeFile(join(root, "story.txt"), "rimuru tempest", "utf8");

      await expect(readFileRune.invoke({ path: "story.txt" }, { workspace: root, sessionId: "s" })).resolves.toEqual({
        path: join(root, "story.txt"),
        content: "rimuru tempest"
      });
      await expect(readFileRune.invoke({ path: "../outside.txt" }, { workspace: root, sessionId: "s" })).rejects.toThrow("Path escapes workspace");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("searches workspace content", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-runes-"));
    try {
      await writeFile(join(root, "story.txt"), "rimuru tempest", "utf8");

      const result = await searchRune.invoke({ pattern: "tempest" }, { workspace: root, sessionId: "s" });

      expect(result.matches.some((match) => match.includes("story.txt:1:rimuru tempest"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
