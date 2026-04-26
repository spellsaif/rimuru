import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  ApprovalPermissionPolicy,
  editFileRune,
  JsonTraceStore,
  loadPlugin,
  planObjective,
  redactSecrets,
  resolveWorkspacePath,
  StaticPermissionPolicy,
  validatePluginManifest
} from "../src/index.js";

describe("advanced foundations", () => {
  it("redacts common secrets", () => {
    expect(redactSecrets("email a@example.com token sk_abcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED]");
  });

  it("resolves only paths inside the workspace", () => {
    expect(resolveWorkspacePath("/tmp/work", "src/a.ts")).toBe("/tmp/work/src/a.ts");
    expect(() => resolveWorkspacePath("/tmp/work", "../secret")).toThrow("Path escapes workspace");
  });

  it("dry-runs and applies safe file edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-edit-"));
    try {
      const path = join(root, "a.txt");
      await writeFile(path, "hello claw", "utf8");

      const dry = await editFileRune.invoke({ path: "a.txt", find: "claw", replace: "rimuru", dryRun: true }, { workspace: root, sessionId: "s" });
      expect(dry.changed).toBe(true);
      expect(await readFile(path, "utf8")).toBe("hello claw");

      await editFileRune.invoke({ path: "a.txt", find: "claw", replace: "rimuru" }, { workspace: root, sessionId: "s" });
      expect(await readFile(path, "utf8")).toBe("hello rimuru");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates deterministic plans", () => {
    expect(planObjective("check git diff").steps.map((step) => step.suggestedRune).filter(Boolean)).toEqual(["git.status", "git.diff"]);
  });

  it("validates plugin manifests", () => {
    expect(
      validatePluginManifest({ name: "tempest", version: "1.0.0", runes: [{ name: "tempest.read", risk: "read", description: "Read things" }] })
    ).toMatchObject({ name: "tempest" });
    expect(() => validatePluginManifest({ name: "bad", version: "1.0.0", runes: [{ name: "bad", risk: "root", description: "no" }] })).toThrow(
      "Invalid plugin rune"
    );
  });

  it("loads executable plugin runes", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-plugin-"));
    try {
      await mkdir(join(root, "tempest"), { recursive: true });
      await writeFile(
        join(root, "tempest", "rimuru.plugin.json"),
        JSON.stringify({ name: "tempest", version: "1.0.0", entry: "plugin.mjs", runes: [{ name: "tempest.echo", risk: "read", description: "Echo input" }] }),
        "utf8"
      );
      await writeFile(
        join(root, "tempest", "plugin.mjs"),
        "export function createRunes() { return [{ name: 'tempest.echo', description: 'Echo input', risk: 'read', async invoke(input) { return { input }; } }]; }\n",
        "utf8"
      );

      const plugin = await loadPlugin(join(root, "tempest"));

      expect(plugin.manifest.name).toBe("tempest");
      expect(plugin.runes[0]?.name).toBe("tempest.echo");
      await expect(plugin.runes[0]?.invoke({ ok: true }, { workspace: root, sessionId: "s" })).resolves.toEqual({ input: { ok: true } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stores redacted traces", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-trace-"));
    try {
      const store = new JsonTraceStore(root);
      const file = await store.save({
        sessionId: "s/1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        messages: [{ role: "user", content: "secret sk_abcdefghijklmnopqrstuvwxyz", createdAt: new Date("2026-01-01T00:00:00.000Z") }],
        events: []
      });
      expect(await readFile(file, "utf8")).toContain("[REDACTED]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports approval for a session", async () => {
    let prompts = 0;
    const policy = new ApprovalPermissionPolicy({
      fallback: new StaticPermissionPolicy({ allow: ["read"] }),
      async prompt() {
        prompts += 1;
        return { allowed: true, reason: "approved for session" };
      }
    });
    const request = { rune: "workspace.shell", risk: "execute" as const, input: {}, workspace: "/tmp", sessionId: "s" };

    await expect(policy.decide(request)).resolves.toEqual({ allowed: true, reason: "approved for session" });
    await expect(policy.decide(request)).resolves.toEqual({ allowed: true, reason: "approved for session" });
    expect(prompts).toBe(1);
  });
});
