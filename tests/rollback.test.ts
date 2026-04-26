import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRollback, editFileRune, inspectRollback, listRollbacks } from "../src/index.js";

describe("rollback", () => {
  it("lists, inspects, and applies edit rollback records", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-rollback-"));
    try {
      await writeFile(join(root, "story.txt"), "hello claw", "utf8");

      await editFileRune.invoke({ path: "story.txt", find: "claw", replace: "rimuru" }, { workspace: root, sessionId: "s" });

      const rollbacks = await listRollbacks(root);
      expect(rollbacks).toHaveLength(1);
      expect(rollbacks[0]).toMatchObject({ path: "story.txt" });

      const id = rollbacks[0]!.id;
      await expect(inspectRollback(root, id)).resolves.toMatchObject({ before: "hello claw", after: "hello rimuru" });
      await expect(applyRollback(root, id)).resolves.toEqual({ path: "story.txt", restored: true });
      await expect(readFile(join(root, "story.txt"), "utf8")).resolves.toBe("hello claw");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
