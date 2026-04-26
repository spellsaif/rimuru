import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Rune, RuneRisk } from "../core/types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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
    async invoke(input: unknown) {
      if (!meta.command) return content; // Just return instructions if no command

      const cmd = meta.command.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return typeof input === "object" && input !== null ? String((input as any)[key] ?? "") : "";
      });

      const { stdout, stderr } = await execAsync(cmd, { cwd: root });
      return stdout || stderr;
    }
  };
}
