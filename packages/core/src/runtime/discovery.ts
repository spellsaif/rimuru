import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Rune, RuneContext, RuneRisk } from "../core/types.js";

const execFileAsync = promisify(execFile);

/**
 * Persona management.
 * Loads the system prompt from SOUL.md if it exists in the workspace.
 */
export async function loadSoul(workspace: string): Promise<string | undefined> {
  try {
    const content = await readFile(resolve(workspace, "SOUL.md"), "utf8");
    return content.trim();
  } catch {
    return undefined;
  }
}

/**
 * Dynamic skill discovery.
 * Scans the workspace for folders containing RUNE.md and registers them as tools.
 */
export async function discoverWorkspaceRunes(workspace: string): Promise<readonly Rune[]> {
  const runes: Rune[] = [];
  try {
    const entries = await readdir(workspace, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const runeMdPath = join(workspace, entry.name, "RUNE.md");
        try {
          const content = await readFile(runeMdPath, "utf8");
          const rune = parseRuneMd(entry.name, content, join(workspace, entry.name));
          if (rune) runes.push(rune);
        } catch {
          // No RUNE.md in this folder, skip
        }
      }
    }
  } catch {
    // Ignore workspace read errors
  }
  return runes;
}

interface RuneMdMeta {
  name: string;
  description: string;
  risk: RuneRisk;
  command?: string;
}

function parseRuneMd(folderName: string, content: string, root: string): Rune | undefined {
  const meta: Partial<RuneMdMeta> = { name: folderName };

  const lines = content.split("\n");
  for (const line of lines) {
    if (line.startsWith("# name:")) meta.name = line.slice(7).trim();
    if (line.startsWith("# description:")) meta.description = line.slice(14).trim();
    if (line.startsWith("# risk:")) meta.risk = line.slice(7).trim() as RuneRisk;
    if (line.startsWith("# command:")) meta.command = line.slice(10).trim();
  }

  if (!meta.name || !meta.description || !meta.risk) return undefined;

  return {
    name: `workspace.${meta.name}`,
    description: meta.description,
    risk: meta.risk,
    async invoke(input: unknown, context: RuneContext) {
      if (!meta.command) return content; // Just return instructions if no command

      const cmd = meta.command.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return typeof input === "object" && input !== null ? String((input as any)[key] ?? "") : "";
      });

      const tokens = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      if (tokens.length === 0) throw new Error("Empty command");
      const program = tokens[0]!.replace(/^"|"$/g, "");
      const args = tokens.slice(1).map((arg) => arg.replace(/^"|"$/g, ""));

      const { runSandboxedCommand } = await import("../security/sandbox.js");
      const result = await runSandboxedCommand({
        command: program,
        args,
        workspace: context?.workspace ?? root,
      });
      return result.stdout || result.stderr;
    },
  };
}

import { executeDynamicRune } from "../security/sandbox-vm.js";

/**
 * Discovers sandboxed runes in .rimuru/runes/ workspace directory.
 */
export async function discoverSandboxedRunes(workspace: string): Promise<readonly Rune[]> {
  const runes: Rune[] = [];
  const runesDir = resolve(workspace, ".rimuru", "runes");
  try {
    const entries = await readdir(runesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        const jsPath = join(runesDir, entry.name);
        const nameWithoutExt = entry.name.slice(0, -3);
        const jsonPath = join(runesDir, `${nameWithoutExt}.json`);

        try {
          const code = await readFile(jsPath, "utf8");
          const jsonContent = await readFile(jsonPath, "utf8");
          const config = JSON.parse(jsonContent);

          const rune: Rune = {
            name: config.name || `custom.${nameWithoutExt}`,
            description: config.description || `Custom sandboxed tool: ${nameWithoutExt}`,
            risk: (config.risk as RuneRisk) || "execute",
            inputSchema: config.inputSchema,
            outputSchema: config.outputSchema,
            async invoke(input) {
              return await executeDynamicRune(code, input);
            },
          };
          runes.push(rune);
        } catch (error) {
          console.warn(`[discovery] Failed to load sandboxed JS Rune from ${entry.name}:`, error);
        }
      } else if (entry.isFile() && entry.name.endsWith(".wasm")) {
        const nameWithoutExt = entry.name.slice(0, -5);
        const jsonPath = join(runesDir, `${nameWithoutExt}.json`);

        try {
          const jsonContent = await readFile(jsonPath, "utf8");
          const config = JSON.parse(jsonContent);

          const rune: Rune = {
            name: config.name || `custom.${nameWithoutExt}`,
            description: config.description || `Custom WASI sandboxed tool: ${nameWithoutExt}`,
            risk: (config.risk as RuneRisk) || "execute",
            inputSchema: config.inputSchema,
            outputSchema: config.outputSchema,
            async invoke(input, context) {
              const { runSandboxedCommand } = await import("../security/sandbox.js");
              const jsonInput = JSON.stringify(input);
              const result = await runSandboxedCommand(
                {
                  command: join(runesDir, nameWithoutExt),
                  workspace: context.workspace,
                  stdin: jsonInput,
                },
                "wasi",
              );
              const stdoutTrimmed = (result.stdout || "").trim();
              try {
                return JSON.parse(stdoutTrimmed);
              } catch {
                return stdoutTrimmed || result.stderr || "WASI execution completed";
              }
            },
          };
          runes.push(rune);
        } catch (error) {
          console.warn(`[discovery] Failed to load sandboxed WASM Rune from ${entry.name}:`, error);
        }
      }
    }
  } catch {
    // If the directory doesn't exist or is unreadable, skip
  }
  return runes;
}
