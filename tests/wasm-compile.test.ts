import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileRune, discoverSandboxedRunes, getVaultSecret, setVaultSecret } from "../src/index.js";
import { execSync } from "node:child_process";

describe("compile rune engine", () => {
  it("compiles and runs a TS rune dynamically", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-ts-compile-"));
    try {
      const context = {
        workspace: root,
        sessionId: "test-ts-session",
        allowedRisks: ["read", "write", "execute"] as any,
      };

      const sourceCode = `
        const a = input.val;
        globalThis.output = { doubled: a * 2 };
      `;

      const result = await compileRune.invoke(
        {
          sourceCode,
          name: "double_tool",
          description: "Doubles input values",
        },
        context as any,
      );

      expect(result.path).toContain("double_tool.js");
      expect(result.configPath).toContain("double_tool.json");

      const configContent = await readFile(result.configPath, "utf8");
      const config = JSON.parse(configContent);
      expect(config.name).toBe("custom.double_tool");
      expect(config.description).toBe("Doubles input values");

      const runes = await discoverSandboxedRunes(root);
      expect(runes).toHaveLength(1);
      const rune = runes[0]!;
      expect(rune.name).toBe("custom.double_tool");

      const output = await rune.invoke({ val: 21 }, context as any);
      expect(output).toEqual({ doubled: 42 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("compiles and runs a TS rune that exports a function matching the rune name", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-ts-export-"));
    try {
      const context = {
        workspace: root,
        sessionId: "test-ts-export-session",
        allowedRisks: ["read", "write", "execute"] as any,
      };

      const sourceCode = `
        export function loveCalculator(names: { person1: string, person2: string }): { score: number } {
          return { score: 99 };
        }
      `;

      const result = await compileRune.invoke(
        {
          sourceCode,
          name: "loveCalculator",
          description: "Calculates compatibility",
        },
        context as any,
      );

      expect(result.path).toContain("loveCalculator.js");
      expect(result.configPath).toContain("loveCalculator.json");

      const runes = await discoverSandboxedRunes(root);
      expect(runes).toHaveLength(1);
      const rune = runes[0]!;
      expect(rune.name).toBe("custom.loveCalculator");

      const output = await rune.invoke({ person1: "Rimuru", person2: "Ciel" }, context as any);
      expect(output).toEqual({ score: 99 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sanitizes invalid risk levels and falls back to execute", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-risk-fallback-"));
    try {
      const context = {
        workspace: root,
        sessionId: "test-risk-fallback-session",
        allowedRisks: ["read", "write", "execute"] as any,
      };

      const result = await compileRune.invoke(
        {
          sourceCode: `globalThis.output = "ok";`,
          name: "test_fallback",
          description: "Tests risk fallback",
          risk: "low" as any,
        },
        context as any,
      );

      const configContent = await readFile(result.configPath, "utf8");
      const config = JSON.parse(configContent);
      expect(config.risk).toBe("execute");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("integrates OS keychain / secret-tool lookup fallback for vault keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-vault-keychain-"));
    let originalKey: string | null = null;
    try {
      try {
        originalKey = execSync("secret-tool lookup app rimuru", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {}

      const testKey = "super-secret-keychain-vault-key-" + Date.now();
      try {
        execSync(`echo "${testKey}" | secret-tool store --label="Rimuru Vault" app rimuru`);
      } catch (err) {
        return;
      }

      const emptyEnv = {};
      await setVaultSecret(root, "my_api_key", "attested-value", emptyEnv);
      const retrieved = await getVaultSecret(root, "my_api_key", emptyEnv);
      expect(retrieved).toBe("attested-value");
    } finally {
      if (originalKey) {
        try {
          execSync(`echo "${originalKey}" | secret-tool store --label="Rimuru Vault" app rimuru`);
        } catch {}
      } else {
        try {
          execSync("secret-tool clear app rimuru");
        } catch {}
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
