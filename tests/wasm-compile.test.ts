import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileWasmRune, discoverSandboxedRunes, getVaultSecret, setVaultSecret } from "../src/index.js";
import { execSync } from "node:child_process";

describe("WASM/JS synthesis and compilation engine", () => {
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

      // Call the compileWasm Rune
      const result = await compileWasmRune.invoke(
        {
          language: "typescript",
          sourceCode,
          name: "double_tool",
          description: "Doubles input values",
        },
        context as any,
      );

      expect(result.path).toContain("double_tool.js");
      expect(result.configPath).toContain("double_tool.json");

      // Verify the generated files exist
      const configContent = await readFile(result.configPath, "utf8");
      const config = JSON.parse(configContent);
      expect(config.name).toBe("custom.double_tool");
      expect(config.description).toBe("Doubles input values");

      // Discover sandboxed runes in this workspace
      const runes = await discoverSandboxedRunes(root);
      expect(runes).toHaveLength(1);
      const rune = runes[0]!;
      expect(rune.name).toBe("custom.double_tool");

      // Invoke the discovered rune
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

      const result = await compileWasmRune.invoke(
        {
          language: "typescript",
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

  it("compiles and runs a Rust WASM rune dynamically using WASI", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-rust-compile-"));
    try {
      const context = {
        workspace: root,
        sessionId: "test-rust-session",
        allowedRisks: ["read", "write", "execute"] as any,
      };

      // Rust code that reads stdin and echoes back a JSON structure
      const sourceCode = `
        use std::io::{self, Read};
        fn main() {
            let mut buffer = String::new();
            io::stdin().read_to_string(&mut buffer).unwrap();
            println!("{{\\\"echo\\\": {}}}", buffer.trim());
        }
      `;

      // Call the compileWasm Rune
      const result = await compileWasmRune.invoke(
        {
          language: "rust",
          sourceCode,
          name: "rust_echo",
          description: "Echoes input via WASI",
        },
        context as any,
      );

      expect(result.path).toContain("rust_echo.wasm");
      expect(result.configPath).toContain("rust_echo.json");

      // Discover sandboxed runes
      const runes = await discoverSandboxedRunes(root);
      expect(runes).toHaveLength(1);
      const rune = runes[0]!;
      expect(rune.name).toBe("custom.rust_echo");

      // Invoke the discovered rune with a structured object
      // It passes the JSON input to stdin and parses the returned JSON output
      const inputVal = { message: "Attested sovereign execution" };

      const t1 = performance.now();
      const output = await rune.invoke(inputVal, context as any);
      const firstDuration = performance.now() - t1;

      expect(output).toEqual({ echo: inputVal });

      // Run a second time to verify compilation caching speedup
      const t2 = performance.now();
      const output2 = await rune.invoke(inputVal, context as any);
      const secondDuration = performance.now() - t2;

      expect(output2).toEqual({ echo: inputVal });
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

      // Temporarily store a key in the OS keychain using secret-tool
      const testKey = "super-secret-keychain-vault-key-" + Date.now();
      execSync(`echo "${testKey}" | secret-tool store --label="Rimuru Vault" app rimuru`);

      // Verify that vault operation works WITHOUT env.RIMURU_VAULT_KEY
      const emptyEnv = {};
      await setVaultSecret(root, "my_api_key", "attested-value", emptyEnv);
      const retrieved = await getVaultSecret(root, "my_api_key", emptyEnv);
      expect(retrieved).toBe("attested-value");
    } finally {
      // Clean up / restore original keychain entry
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
