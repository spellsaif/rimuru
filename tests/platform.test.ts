import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approvePairing, createCanvasArtifact, createRitual, getVaultSecret, listCanvasArtifacts, listPairings, listRituals, listVaultSecrets, listVessels, loadRuntimeConfig, normalizeDiscordEvent, requestPairing, setVaultSecret, setupWorkspace, validateRuntimeConfig } from "../src/index.js";

describe("platform spine", () => {
  it("sets up a workspace with vessel config", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-setup-"));
    try {
      const result = await setupWorkspace({ workspace: root, provider: "mock", vessel: "coding", soul: "work", vows: ["read", "write"], barrier: "readonly" });
      const raw = await readFile(result.configPath, "utf8");
      expect(raw).toContain("coding");

      const config = await loadRuntimeConfig({ workspace: root, env: { RIMURU_VESSEL: "coding" } });
      expect(config.sessionId).toBe("work");
      expect(config.allowedRisks).toEqual(["read", "write"]);
      expect(listVessels(config)).toEqual([expect.objectContaining({ name: "coding", active: true })]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stores vault secrets, pairings, rituals, and canvas artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-platform-"));
    try {
      await setVaultSecret(root, "telegram.token", "secret", { RIMURU_VAULT_KEY: "test" });
      await expect(listVaultSecrets(root)).resolves.toEqual([expect.objectContaining({ name: "telegram.token" })]);
      await expect(getVaultSecret(root, "telegram.token", { RIMURU_VAULT_KEY: "test" })).resolves.toBe("secret");

      const pending = await requestPairing(root, "telegram", "alice");
      await expect(approvePairing(root, pending.code)).resolves.toMatchObject({ circle: "telegram", from: "alice" });
      await expect(listPairings(root)).resolves.toMatchObject({ pending: [], allowed: [expect.objectContaining({ from: "alice" })] });

      await createRitual(root, { id: "daily", prompt: "summarize", sessionId: "default", everyMinutes: 60 });
      await expect(listRituals(root)).resolves.toEqual([expect.objectContaining({ id: "daily" })]);

      await createCanvasArtifact(root, { title: "plan", kind: "markdown", content: "# Plan" });
      await expect(listCanvasArtifacts(root)).resolves.toEqual([expect.objectContaining({ title: "plan", kind: "markdown" })]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("validates production configuration and normalizes Discord events", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-validate-"));
    try {
      await setupWorkspace({ workspace: root, provider: "openai-compatible", vows: ["read", "execute"], barrier: "none", circles: [{ name: "discord", kind: "discord", enabled: true }] });
      const config = await loadRuntimeConfig({ workspace: root, env: {} });

      expect(validateRuntimeConfig(config, {})).toEqual(expect.arrayContaining([expect.objectContaining({ code: "provider.missing_api_key" }), expect.objectContaining({ code: "policy.unbarriered_power" })]));
      expect(normalizeDiscordEvent({ name: "discord", kind: "discord" }, { content: "hello", author: { username: "alice" } })).toMatchObject({ circle: "discord", from: "alice", text: "hello" });
      expect(normalizeDiscordEvent({ name: "discord", kind: "discord" }, { type: 1 })).toEqual({ pong: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
