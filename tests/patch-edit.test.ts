import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyPatchRune, applyPatchToText, parseUnifiedPatch } from "../src/index.js";

const patch = `--- a/story.txt
+++ b/story.txt
@@ -1,3 +1,3 @@
 hello
-claw
+rimuru
 world
`;

describe("patch-based editing", () => {
  it("parses unified patches", () => {
    const files = parseUnifiedPatch(patch);

    expect(files[0]?.newPath).toBe("story.txt");
    expect(files[0]?.hunks[0]?.lines.map((line) => line.type)).toEqual(["context", "remove", "add", "context"]);
  });

  it("applies hunks to text", () => {
    const file = parseUnifiedPatch(patch)[0]!;

    expect(applyPatchToText("hello\nclaw\nworld\n", file)).toBe("hello\nrimuru\nworld\n");
  });

  it("detects patch conflicts", () => {
    const file = parseUnifiedPatch(patch)[0]!;

    expect(() => applyPatchToText("hello\nother\nworld\n", file)).toThrow("Patch conflict");
  });

  it("dry-runs and applies workspace patches with rollback records", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-patch-"));
    try {
      await mkdir(join(root, ".rimuru", "rollbacks"), { recursive: true });
      await writeFile(join(root, "story.txt"), "hello\nclaw\nworld\n", "utf8");

      const dry = await applyPatchRune.invoke({ patch, dryRun: true }, { workspace: root, sessionId: "s" });
      expect(dry.changed).toBe(true);
      expect(await readFile(join(root, "story.txt"), "utf8")).toBe("hello\nclaw\nworld\n");

      const applied = await applyPatchRune.invoke({ patch }, { workspace: root, sessionId: "s" });
      expect(applied.files[0]?.rollbackPath).toContain(".rimuru/rollbacks");
      expect(await readFile(join(root, "story.txt"), "utf8")).toBe("hello\nrimuru\nworld\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
