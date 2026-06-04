import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createRuntime,
  spawnVesselRune,
  delegateVesselRune,
  discoverSandboxedRunes,
  loadRuntimeConfig,
} from "../src/index.js";

describe("Local Multi-Agent Swarms & Dynamic Runes Loader", () => {
  it("spawns a child agent and verifies metadata & parent vows validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-swarm-"));
    try {
      // 1. Create a config file in the workspace
      await writeFile(
        join(root, "rimuru.config.json"),
        JSON.stringify({
          provider: "mock",
          model: "mock",
          sessionId: "parent-session",
          allowedRisks: ["read", "write", "execute"],
        }),
        "utf8",
      );

      // Create memory directory (which chronicle uses)
      const memoryDir = join(root, ".rimuru", "sessions");
      await mkdir(memoryDir, { recursive: true });

      const context = {
        workspace: root,
        sessionId: "parent-session",
        audit: false,
      };

      // 2. Spawn child vessel with sub-vows (read, write)
      const spawnResult = await spawnVesselRune.invoke(
        {
          soul: "You are a read-only child agent.",
          vows: ["read"],
          objective: "Inspect the registry",
        },
        context,
      );

      expect(spawnResult.sessionId).toContain("parent-session:child-");
      expect(spawnResult.response).toContain("Rimuru heard: Objective: Inspect the registry");

      // Verify the metadata was written correctly to the memory directory
      const safeChildSessionId = spawnResult.sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
      const metaContent = await readFile(join(memoryDir, `${safeChildSessionId}.meta.json`), "utf8");
      const meta = JSON.parse(metaContent);
      expect(meta.soul).toBe("You are a read-only child agent.");
      expect(meta.vows).toEqual(["read"]);

      // 3. Test escalation prevention: child requests 'network' which parent does not have
      await expect(
        spawnVesselRune.invoke(
          {
            soul: "Malicious agent",
            vows: ["read", "network"],
            objective: "Do bad stuff",
          },
          context,
        ),
      ).rejects.toThrow("Permission escalation denied");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("delegates a follow-up objective to an existing child Vessel session", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-swarm-delegate-"));
    try {
      await writeFile(
        join(root, "rimuru.config.json"),
        JSON.stringify({
          provider: "mock",
          model: "mock",
          sessionId: "parent-session",
          allowedRisks: ["read", "execute"],
        }),
        "utf8",
      );

      const memoryDir = join(root, ".rimuru", "sessions");
      await mkdir(memoryDir, { recursive: true });

      const context = {
        workspace: root,
        sessionId: "parent-session",
        audit: false,
      };

      // First spawn a child
      const spawnResult = await spawnVesselRune.invoke(
        {
          soul: "Assistant",
          vows: ["read"],
          objective: "Objective 1",
        },
        context,
      );

      // Now delegate follow up
      const delegateResult = await delegateVesselRune.invoke(
        {
          sessionId: spawnResult.sessionId,
          objective: "Objective 2",
        },
        context,
      );

      expect(delegateResult.response).toContain("Rimuru heard: Objective: Objective 2");

      // Test delegation with non-existent session
      await expect(
        delegateVesselRune.invoke(
          {
            sessionId: "non-existent-session-id",
            objective: "Objective 3",
          },
          context,
        ),
      ).rejects.toThrow("Child Vessel session not found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("dynamically discovers and invokes sandboxed QuickJS Runes from .rimuru/runes/", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-loader-"));
    try {
      const runesDir = join(root, ".rimuru", "runes");
      await mkdir(runesDir, { recursive: true });

      // 1. Create a valid sandboxed JS + JSON Rune pair
      const jsCode = `
        const result = input.val1 * input.val2;
        globalThis.output = { product: result };
      `;
      const jsonMeta = {
        name: "custom.multiply",
        description: "Multiplies two numbers in a QuickJS sandbox.",
        risk: "execute",
        inputSchema: {
          type: "object",
          required: ["val1", "val2"],
          properties: {
            val1: { type: "number" },
            val2: { type: "number" },
          },
        },
        outputSchema: {
          type: "object",
          required: ["product"],
          properties: {
            product: { type: "number" },
          },
        },
      };

      await writeFile(join(runesDir, "multiply.js"), jsCode, "utf8");
      await writeFile(join(runesDir, "multiply.json"), JSON.stringify(jsonMeta, null, 2), "utf8");

      // 2. Create the configuration in the workspace
      await writeFile(
        join(root, "rimuru.config.json"),
        JSON.stringify({
          provider: "mock",
          model: "mock",
          sessionId: "main-session",
          allowedRisks: ["read", "execute"],
        }),
        "utf8",
      );

      // 3. Initialize runtime (which automatically runs the discovery loader)
      const config = await loadRuntimeConfig({ workspace: root });
      const runtime = await createRuntime({ config, workspace: root });

      // 4. Verify the custom Rune was discovered and registered
      const registeredRunes = runtime.runes.list();
      const multiplyRune = registeredRunes.find((r) => r.name === "custom.multiply");
      expect(multiplyRune).toBeDefined();
      expect(multiplyRune?.description).toBe("Multiplies two numbers in a QuickJS sandbox.");
      expect(multiplyRune?.risk).toBe("execute");

      // 5. Invoke the sandboxed Rune and verify the execution output
      const result = await runtime.runes.invoke(
        "custom.multiply",
        { val1: 7, val2: 8 },
        { workspace: root, sessionId: "main-session" },
      );

      expect(result).toEqual({ product: 56 });

      // 6. Verify that an invalid JS/JSON does not crash runtime creation and is just skipped
      await writeFile(join(runesDir, "broken.js"), "broken code", "utf8");
      // JSON is missing for broken.js, it should warn and skip
      const discovered = await discoverSandboxedRunes(root);
      expect(discovered.find((r) => r.name.includes("broken"))).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
