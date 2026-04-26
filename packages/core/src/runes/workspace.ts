import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Rune, RuneContext } from "../core/types.js";
import { applyUnifiedPatch } from "../edit/patch.js";
import { runSandboxedCommand } from "../security/sandbox.js";
import { assertCommandName, resolveWorkspacePath } from "../security/workspace.js";

const execFileAsync = promisify(execFile);

export const readFileRune: Rune<{ readonly path: string }, { readonly path: string; readonly content: string }> = {
  name: "workspace.readFile",
  description: "Reads a UTF-8 file inside the current workspace.",
  risk: "read",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  async invoke(input, context) {
    const path = safeWorkspacePath(context, input.path);
    return { path, content: await readFile(path, "utf8") };
  }

};

export const listDirRune: Rune<{ readonly path?: string }, { readonly path: string; readonly entries: readonly { name: string; isDirectory: boolean; size?: number }[] }> = {
  name: "workspace.listDir",
  description: "Lists entries in a directory.",
  risk: "read",
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
  async invoke(input, context) {
    const { readdir, stat } = await import("node:fs/promises");
    const path = safeWorkspacePath(context, input.path ?? ".");
    const names = await readdir(path);
    const entries = await Promise.all(names.map(async (name) => {
      const s = await stat(join(path, name));
      return { name, isDirectory: s.isDirectory(), size: s.size };
    }));
    return { path, entries };
  }
};


export const searchRune: Rune<{ readonly pattern: string; readonly include?: string }, { readonly matches: readonly string[] }> = {
  name: "workspace.search",
  description: "Searches workspace text with ripgrep and returns matching file/line entries.",
  risk: "read",
  inputSchema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" }, include: { type: "string" } } },
  async invoke(input, context) {
    const args = [
      "--line-number",
      "--color",
      "never",
      "--glob",
      "!dist/**",
      "--glob",
      "!node_modules/**",
      "--glob",
      "!.rimuru/**",
      input.pattern,
      "."
    ];
    if (input.include) args.splice(3, 0, "--glob", input.include);
    try {
      const { stdout } = await execFileAsync("rg", args, { cwd: context.workspace, signal: context.signal, maxBuffer: 1024 * 1024 });
      return { matches: stdout.split("\n").filter(Boolean) };
    } catch (error) {
      if (isExitCode(error, 1)) return { matches: [] };
      throw error;
    }
  }
};


export const findFilesRune: Rune<{ readonly query: string }, { readonly files: readonly string[] }> = {
  name: "workspace.findFiles",
  description: "Finds files in the workspace matching a glob query.",
  risk: "read",
  inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  async invoke(input, context) {
    const { glob } = await import("glob");
    const matches = await glob(input.query, { cwd: context.workspace, ignore: ["node_modules/**", "dist/**", ".rimuru/**"] });
    return { files: matches.map(m => String(m)) };
  }
};


export const shellRune: Rune<{ readonly command: string; readonly args?: readonly string[] }, { readonly stdout: string; readonly stderr: string }> = {
  name: "workspace.shell",
  description: "Runs a non-interactive command in the workspace when execution is allowed.",
  risk: "execute",
  inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" }, args: { type: "array" } } },
  async invoke(input, context) {
    assertCommandName(input.command);
    return runSandboxedCommand({ command: input.command, workspace: context.workspace, ...(input.args === undefined ? {} : { args: input.args }), ...(context.signal === undefined ? {} : { signal: context.signal }) });
  }
};

export const editFileRune: Rune<
  { readonly path: string; readonly find?: string; readonly replace?: string; readonly patch?: string; readonly dryRun?: boolean; readonly formatter?: readonly string[] },
  { readonly path?: string; readonly changed: boolean; readonly preview?: string; readonly files?: readonly { readonly path: string; readonly changed: boolean; readonly preview: string; readonly rollbackPath?: string }[] }
> = {
  name: "workspace.editFile",
  description: "Safely edits a workspace file by applying a unified patch or legacy text replacement.",
  risk: "write",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" }, patch: { type: "string" }, dryRun: { type: "boolean" }, formatter: { type: "array" } } },
  async invoke(input, context) {
    if (input.patch) {
      const result = await applyUnifiedPatch({
        workspace: context.workspace,
        patch: input.patch,
        resolvePath: (path) => safeWorkspacePath(context, path),
        rollbackDir: safeWorkspacePath(context, ".rimuru/rollbacks"),
        ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
        ...(input.formatter === undefined ? {} : { formatter: input.formatter })
      });
      return { changed: result.changed, files: result.files };
    }
    if (input.find === undefined || input.replace === undefined) throw new Error("workspace.editFile requires either patch or find/replace");
    const path = safeWorkspacePath(context, input.path);
    const before = await readFile(path, "utf8");
    if (!before.includes(input.find)) return { path, changed: false, preview: "No match found" };
    const after = before.replace(input.find, input.replace);
    let rollbackPath: string | undefined;
    if (!input.dryRun) {
      rollbackPath = safeWorkspacePath(context, join(".rimuru/rollbacks", `${Date.now()}-${safeName(input.path)}.json`));
      await mkdir(dirname(rollbackPath), { recursive: true });
      await writeFile(rollbackPath, `${JSON.stringify({ path: input.path, before, after, createdAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
      await writeFile(path, after, "utf8");
    }
    return { path, changed: true, preview: createPreview(before, after), ...(rollbackPath ? { files: [{ path: input.path, changed: true, preview: createPreview(before, after), rollbackPath }] } : {}) };
  }
};

export const applyPatchRune: Rune<
  { readonly patch: string; readonly dryRun?: boolean; readonly formatter?: readonly string[] },
  { readonly changed: boolean; readonly files: readonly { readonly path: string; readonly changed: boolean; readonly preview: string; readonly rollbackPath?: string }[] }
> = {
  name: "workspace.applyPatch",
  description: "Applies a unified patch inside the workspace with dry-run, conflict detection, rollback records, and optional formatting.",
  risk: "write",
  inputSchema: { type: "object", required: ["patch"], properties: { patch: { type: "string" }, dryRun: { type: "boolean" }, formatter: { type: "array" } } },
  async invoke(input, context) {
    return applyUnifiedPatch({
      workspace: context.workspace,
      patch: input.patch,
      resolvePath: (path) => safeWorkspacePath(context, path),
      rollbackDir: safeWorkspacePath(context, ".rimuru/rollbacks"),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.formatter === undefined ? {} : { formatter: input.formatter })
    });
  }
};

export const writeFileRune: Rune<{ readonly path: string; readonly content: string }, { readonly path: string }> = {
  name: "workspace.writeFile",
  description: "Creates or overwrites a file with the given content.",
  risk: "write",
  inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } },
  async invoke(input, context) {
    const path = safeWorkspacePath(context, input.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.content, "utf8");
    return { path };
  }
};

export const deleteFileRune: Rune<{ readonly path: string }, { readonly path: string }> = {
  name: "workspace.deleteFile",
  description: "Deletes a file from the workspace.",
  risk: "write",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  async invoke(input, context) {
    const { unlink } = await import("node:fs/promises");
    const path = safeWorkspacePath(context, input.path);
    await unlink(path);
    return { path };
  }
};


export const workspaceRunes = [
  readFileRune, 
  listDirRune, 
  searchRune, 
  findFilesRune, 
  shellRune, 
  editFileRune, 
  writeFileRune, 
  deleteFileRune,
  applyPatchRune
] as const;


function safeWorkspacePath(context: RuneContext, path: string): string {
  return resolveWorkspacePath(context.workspace, path);
}

function isExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function createPreview(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const changes: string[] = ["--- before", "+++ after"];
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      if (beforeLines[index] !== undefined) changes.push(`- ${beforeLines[index]}`);
      if (afterLines[index] !== undefined) changes.push(`+ ${afterLines[index]}`);
    }
    if (changes.length >= 20) break;
  }
  return changes.length === 2 ? "No visible line changes" : changes.join("\n");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
