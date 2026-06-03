import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertCommandName, assertFormatterName } from "../security/workspace.js";

const execFileAsync = promisify(execFile);

export interface PatchFile {
  readonly oldPath: string;
  readonly newPath: string;
  readonly hunks: readonly PatchHunk[];
}

export interface PatchHunk {
  readonly header: string;
  readonly lines: readonly PatchLine[];
}

export type PatchLine =
  | { readonly type: "context"; readonly text: string }
  | { readonly type: "remove"; readonly text: string }
  | { readonly type: "add"; readonly text: string };

export interface PatchApplyResult {
  readonly changed: boolean;
  readonly files: readonly { readonly path: string; readonly changed: boolean; readonly preview: string; readonly rollbackPath?: string }[];
}

export interface ApplyPatchOptions {
  readonly workspace: string;
  readonly patch: string;
  readonly resolvePath: (path: string) => string;
  readonly dryRun?: boolean;
  readonly rollbackDir?: string;
  readonly formatter?: readonly string[];
}

export function parseUnifiedPatch(patch: string): readonly PatchFile[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const files: PatchFile[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index]?.startsWith("--- ")) {
      index += 1;
      continue;
    }
    const oldPath = cleanPatchPath(lines[index]!.slice(4).trim());
    index += 1;
    if (!lines[index]?.startsWith("+++ ")) throw new Error("Invalid unified patch: missing +++ file header");
    const newPath = cleanPatchPath(lines[index]!.slice(4).trim());
    index += 1;
    const hunks: PatchHunk[] = [];

    while (index < lines.length && !lines[index]?.startsWith("--- ")) {
      if (!lines[index]?.startsWith("@@")) {
        index += 1;
        continue;
      }
      const header = lines[index]!;
      index += 1;
      const hunkLines: PatchLine[] = [];
      while (index < lines.length && !lines[index]?.startsWith("@@") && !lines[index]?.startsWith("--- ")) {
        const line = lines[index]!;
        index += 1;
        if (line === "" && index >= lines.length) continue;
        if (line === "\\ No newline at end of file") continue;
        if (line.startsWith("+")) hunkLines.push({ type: "add", text: line.slice(1) });
        else if (line.startsWith("-")) hunkLines.push({ type: "remove", text: line.slice(1) });
        else if (line.startsWith(" ")) hunkLines.push({ type: "context", text: line.slice(1) });
        else if (line === "") hunkLines.push({ type: "context", text: "" });
        else throw new Error(`Invalid unified patch line: ${line}`);
      }
      hunks.push({ header, lines: hunkLines });
    }

    if (hunks.length === 0) throw new Error(`Invalid unified patch: no hunks for ${newPath}`);
    files.push({ oldPath, newPath, hunks });
  }

  if (files.length === 0) throw new Error("Invalid unified patch: no file changes found");
  return files;
}

export async function applyUnifiedPatch(options: ApplyPatchOptions): Promise<PatchApplyResult> {
  const files = parseUnifiedPatch(options.patch);
  
  // 1. Calculate all patch contents in memory first to prevent partial/corrupted writes on failure
  const prep: { 
    file: PatchFile;
    target: string;
    before: string;
    after: string;
    changed: boolean;
    isDeletion: boolean;
  }[] = [];

  for (const file of files) {
    const target = options.resolvePath(file.newPath === "/dev/null" ? file.oldPath : file.newPath);
    let before = "";
    try {
      before = await readFile(target, "utf8");
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        before = "";
      } else {
        throw error;
      }
    }
    const isDeletion = file.newPath === "/dev/null";
    const after = isDeletion ? "" : applyPatchToText(before, file);
    const changed = before !== after;
    prep.push({ file, target, before, after, changed, isDeletion });
  }

  // 2. Commit all changes to the filesystem safely
  const results: { path: string; changed: boolean; preview: string; rollbackPath?: string }[] = [];

  for (const { file, target, before, after, changed, isDeletion } of prep) {
    let rollbackPath: string | undefined;

    if (changed && !options.dryRun) {
      if (options.rollbackDir) {
        rollbackPath = join(options.rollbackDir, `${Date.now()}-${safeName(file.newPath)}.json`);
        await mkdir(dirname(rollbackPath), { recursive: true });
        await writeFile(rollbackPath, `${JSON.stringify({ path: file.newPath, before, after, createdAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
      }
      if (isDeletion) {
        await unlink(target);
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, after, "utf8");
        if (options.formatter && options.formatter.length > 0) {
          const [command, ...args] = options.formatter;
          if (command) {
            assertFormatterName(command);
            await execFileAsync(command, [...args, target], { cwd: options.workspace, maxBuffer: 1024 * 1024 });
          }
        }
      }
    }
    results.push({ path: file.newPath, changed, preview: createUnifiedPreview(file.newPath, before, after), ...(rollbackPath ? { rollbackPath } : {}) });
  }

  return { changed: results.some((result) => result.changed), files: results };
}

export function applyPatchToText(before: string, file: PatchFile): string {
  const hadFinalNewline = before === "" ? true : before.endsWith("\n");
  const source = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  let cursor = 0;
  const output: string[] = [];

  for (const hunk of file.hunks) {
    const expected = hunk.lines.filter((line) => line.type !== "add").map((line) => line.text);
    const start = findSequence(source, expected, cursor);
    if (start === -1) throw new Error(`Patch conflict in ${file.newPath}: hunk does not match (${hunk.header})`);
    output.push(...source.slice(cursor, start));
    for (const line of hunk.lines) {
      if (line.type === "context") output.push(line.text);
      if (line.type === "add") output.push(line.text);
    }
    cursor = start + expected.length;
  }

  output.push(...source.slice(cursor));
  return `${output.join("\n")}${hadFinalNewline ? "\n" : ""}`;
}

function findSequence(source: readonly string[], expected: readonly string[], from: number): number {
  if (expected.length === 0) return from;
  for (let index = from; index <= source.length - expected.length; index += 1) {
    if (expected.every((line, offset) => source[index + offset] === line)) return index;
  }
  return -1;
}

function createUnifiedPreview(path: string, before: string, after: string): string {
  if (before === after) return `--- ${path}\n+++ ${path}\nNo changes`;
  const beforeLines = before.replace(/\n$/, "").split("\n");
  const afterLines = after.replace(/\n$/, "").split("\n");
  const lines = [`--- ${path}`, `+++ ${path}`, "@@ preview @@"];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] === afterLines[index]) continue;
    if (beforeLines[index] !== undefined) lines.push(`- ${beforeLines[index]}`);
    if (afterLines[index] !== undefined) lines.push(`+ ${afterLines[index]}`);
    if (lines.length >= 42) break;
  }
  return lines.join("\n");
}

function cleanPatchPath(path: string): string {
  const clean = path.split("\t")[0]?.trim() ?? path;
  if (clean === "/dev/null") return clean;
  return clean.replace(/^[ab]\//, "");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
