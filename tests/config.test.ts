import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../src/index.js";

describe("loadRuntimeConfig", () => {
  it("uses safe mock defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-config-"));
    try {
      const config = await loadRuntimeConfig({ workspace: root, env: {} });

      expect(config.provider).toBe("mock");
      expect(config.model).toBe("mock");
      expect(config.sessionId).toBe("default");
      expect(config.allowedRisks).toEqual(["read"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets environment override file config", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-config-"));
    try {
      await writeFile(
        join(root, "rimuru.config.json"),
        JSON.stringify({
          provider: "mock",
          model: "file-model",
          sessionId: "file-session",
          allowedRisks: ["read", "execute"],
        }),
        "utf8",
      );

      const config = await loadRuntimeConfig({
        workspace: root,
        env: { RIMURU_MODEL: "env-model", RIMURU_SESSION: "env-session" },
      });

      expect(config.model).toBe("env-model");
      expect(config.sessionId).toBe("env-session");
      expect(config.allowedRisks).toEqual(["read", "execute"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts Rimuru vocabulary aliases", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-config-"));
    try {
      await writeFile(
        join(root, "rimuru.config.json"),
        JSON.stringify({
          shard: "ollama",
          model: "llama3.1",
          soul: "main",
          vows: ["read", "write"],
          barrier: "readonly",
        }),
        "utf8",
      );

      const config = await loadRuntimeConfig({
        workspace: root,
        env: { RIMURU_SOUL: "env-soul", RIMURU_VOWS: "read,execute" },
      });

      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("llama3.1");
      expect(config.sessionId).toBe("env-soul");
      expect(config.allowedRisks).toEqual(["read", "execute"]);
      expect(config.sandboxMode).toBe("readonly");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
