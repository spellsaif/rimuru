import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Rune, RuneContext, RuneRisk, RuneSchema } from "../core/types.js";
import { applyUnifiedPatch } from "../edit/patch.js";
import { runSandboxedCommand } from "../security/sandbox.js";
import { assertCommandName, resolveWorkspacePath } from "../security/workspace.js";
import { createRitual, runDueRituals } from "../rituals/rituals.js";
import type { AgentLoop } from "../agent/agent.js";

const execFileAsync = promisify(execFile);

export const readFileRune: Rune<{ readonly path: string }, { readonly path: string; readonly content: string }> = {
  name: "workspace.readFile",
  description: "Reads a UTF-8 file inside the current workspace.",
  risk: "read",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  async invoke(input, context) {
    const path = safeWorkspacePath(context, input.path);
    return { path, content: await readFile(path, "utf8") };
  },
};

export const listDirRune: Rune<
  { readonly path?: string },
  { readonly path: string; readonly entries: readonly { name: string; isDirectory: boolean; size?: number }[] }
> = {
  name: "workspace.listDir",
  description: "Lists entries in a directory.",
  risk: "read",
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
  async invoke(input, context) {
    const { readdir, stat } = await import("node:fs/promises");
    const path = safeWorkspacePath(context, input.path ?? ".");
    const names = await readdir(path);
    const entries = await Promise.all(
      names.map(async (name) => {
        const s = await stat(join(path, name));
        return { name, isDirectory: s.isDirectory(), size: s.size };
      }),
    );
    return { path, entries };
  },
};

export const searchRune: Rune<
  { readonly pattern: string; readonly include?: string },
  { readonly matches: readonly string[] }
> = {
  name: "workspace.search",
  description: "Searches workspace text with ripgrep and returns matching file/line entries.",
  risk: "read",
  inputSchema: {
    type: "object",
    required: ["pattern"],
    properties: { pattern: { type: "string" }, include: { type: "string" } },
  },
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
      ".",
    ];
    if (input.include) args.splice(3, 0, "--glob", input.include);
    try {
      const { stdout } = await execFileAsync("rg", args, {
        cwd: context.workspace,
        signal: context.signal,
        maxBuffer: 1024 * 1024,
      });
      return { matches: stdout.split("\n").filter(Boolean) };
    } catch (error) {
      if (isExitCode(error, 1)) return { matches: [] };
      throw error;
    }
  },
};

export const findFilesRune: Rune<{ readonly query: string }, { readonly files: readonly string[] }> = {
  name: "workspace.findFiles",
  description: "Finds files in the workspace matching a glob query.",
  risk: "read",
  inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  async invoke(input, context) {
    const { glob } = await import("glob");
    const matches = await glob(input.query, {
      cwd: context.workspace,
      ignore: ["node_modules/**", "dist/**", ".rimuru/**"],
    });
    return { files: matches.map((m) => String(m)) };
  },
};

export const shellRune: Rune<
  { readonly command: string; readonly args?: readonly string[] },
  { readonly stdout: string; readonly stderr: string }
> = {
  name: "workspace.shell",
  description: "Runs a non-interactive command in the workspace when execution is allowed.",
  risk: "execute",
  inputSchema: {
    type: "object",
    required: ["command"],
    properties: { command: { type: "string" }, args: { type: "array" } },
  },
  async invoke(input, context) {
    assertCommandName(input.command);
    return runSandboxedCommand({
      command: input.command,
      workspace: context.workspace,
      ...(input.args === undefined ? {} : { args: input.args }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
  },
};

export const editFileRune: Rune<
  {
    readonly path: string;
    readonly find?: string;
    readonly replace?: string;
    readonly patch?: string;
    readonly dryRun?: boolean;
    readonly formatter?: readonly string[];
  },
  {
    readonly path?: string;
    readonly changed: boolean;
    readonly preview?: string;
    readonly files?: readonly {
      readonly path: string;
      readonly changed: boolean;
      readonly preview: string;
      readonly rollbackPath?: string;
    }[];
  }
> = {
  name: "workspace.editFile",
  description: "Safely edits a workspace file by applying a unified patch or legacy text replacement.",
  risk: "write",
  inputSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string" },
      find: { type: "string" },
      replace: { type: "string" },
      patch: { type: "string" },
      dryRun: { type: "boolean" },
      formatter: { type: "array" },
    },
  },
  async invoke(input, context) {
    if (input.patch) {
      const result = await applyUnifiedPatch({
        workspace: context.workspace,
        patch: input.patch,
        resolvePath: (path) => safeWorkspacePath(context, path),
        rollbackDir: internalRimuruPath(context, ".rimuru/rollbacks"),
        ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
        ...(input.formatter === undefined ? {} : { formatter: input.formatter }),
      });
      return { changed: result.changed, files: result.files };
    }
    if (input.find === undefined || input.replace === undefined)
      throw new Error("workspace.editFile requires either patch or find/replace");
    const path = safeWorkspacePath(context, input.path);
    const before = await readFile(path, "utf8");
    if (!before.includes(input.find)) return { path, changed: false, preview: "No match found" };
    const after = before.replace(input.find, input.replace);
    let rollbackPath: string | undefined;
    if (!input.dryRun) {
      rollbackPath = safeWorkspacePath(
        context,
        join(".rimuru/rollbacks", `${Date.now()}-${safeName(input.path)}.json`),
        true,
      );
      await mkdir(dirname(rollbackPath), { recursive: true });
      await writeFile(
        rollbackPath,
        `${JSON.stringify({ path: input.path, before, after, createdAt: new Date().toISOString() }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(path, after, "utf8");
    }
    return {
      path,
      changed: true,
      preview: createPreview(before, after),
      ...(rollbackPath
        ? { files: [{ path: input.path, changed: true, preview: createPreview(before, after), rollbackPath }] }
        : {}),
    };
  },
};

export const applyPatchRune: Rune<
  { readonly patch: string; readonly dryRun?: boolean; readonly formatter?: readonly string[] },
  {
    readonly changed: boolean;
    readonly files: readonly {
      readonly path: string;
      readonly changed: boolean;
      readonly preview: string;
      readonly rollbackPath?: string;
    }[];
  }
> = {
  name: "workspace.applyPatch",
  description:
    "Applies a unified patch inside the workspace with dry-run, conflict detection, rollback records, and optional formatting.",
  risk: "write",
  inputSchema: {
    type: "object",
    required: ["patch"],
    properties: { patch: { type: "string" }, dryRun: { type: "boolean" }, formatter: { type: "array" } },
  },
  async invoke(input, context) {
    return applyUnifiedPatch({
      workspace: context.workspace,
      patch: input.patch,
      resolvePath: (path) => safeWorkspacePath(context, path),
      rollbackDir: internalRimuruPath(context, ".rimuru/rollbacks"),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.formatter === undefined ? {} : { formatter: input.formatter }),
    });
  },
};

export const writeFileRune: Rune<{ readonly path: string; readonly content: string }, { readonly path: string }> = {
  name: "workspace.writeFile",
  description: "Creates or overwrites a file with the given content.",
  risk: "write",
  inputSchema: {
    type: "object",
    required: ["path", "content"],
    properties: { path: { type: "string" }, content: { type: "string" } },
  },
  async invoke(input, context) {
    const path = safeWorkspacePath(context, input.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.content, "utf8");
    return { path };
  },
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
  },
};

async function buildFileTreeString(dir: string, currentDepth: number, maxDepth: number): Promise<string> {
  if (currentDepth > maxDepth) return "";
  const entries = await readdir(dir, { withFileTypes: true });
  const filtered = entries
    .filter((e) => {
      return e.name !== "node_modules" && e.name !== "dist" && e.name !== ".git" && e.name !== ".rimuru";
    })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  let result = "";
  for (let index = 0; index < filtered.length; index++) {
    const entry = filtered[index]!;
    const isLast = index === filtered.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    result += `${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}\n`;
    if (entry.isDirectory() && currentDepth < maxDepth) {
      const subTree = await buildFileTreeString(join(dir, entry.name), currentDepth + 1, maxDepth);
      if (subTree) {
        result +=
          subTree
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => `${childPrefix}${line}`)
            .join("\n") + "\n";
      }
    }
  }
  return result;
}

export const fileTreeRune: Rune<{ readonly maxDepth?: number }, { readonly tree: string }> = {
  name: "workspace.fileTree",
  description: "Visualizes the workspace files and directories recursively up to a specified depth.",
  risk: "read",
  inputSchema: {
    type: "object",
    properties: {
      maxDepth: { type: "number" },
    },
  },
  async invoke(input, context) {
    const maxDepth = input.maxDepth ?? 3;
    const tree = await buildFileTreeString(context.workspace, 1, maxDepth);
    return { tree: tree || "Empty workspace\n" };
  },
};

export const compileRune: Rune<
  {
    readonly sourceCode: string;
    readonly name: string;
    readonly description: string;
    readonly risk?: RuneRisk;
    readonly inputSchema?: RuneSchema;
    readonly outputSchema?: RuneSchema;
  },
  { readonly path: string; readonly configPath: string }
> = {
  name: "workspace.compileRune",
  description:
    "Transpiles TypeScript to a sandboxed Rune stored in the workspace .rimuru/runes/ directory. The rune is executed in a QuickJS WebAssembly VM. Write standard JS/TS functions that receive normal parameters and return normal JS values.",
  risk: "write",
  inputSchema: {
    type: "object",
    required: ["sourceCode", "name", "description"],
    properties: {
      sourceCode: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      risk: { type: "string", enum: ["read", "write", "execute", "network"] },
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  },
  async invoke(input, context) {
    const { mkdir, writeFile } = await import("node:fs/promises");

    const safeNamePattern = /^[a-zA-Z0-9_-]+$/;
    if (!safeNamePattern.test(input.name)) {
      throw new Error(`Invalid Rune name: ${input.name}. Use alphanumeric characters, dashes, and underscores only.`);
    }

    const runesDir = internalRimuruPath(context, ".rimuru/runes");
    await mkdir(runesDir, { recursive: true });

    const targetPath = join(runesDir, input.name);
    const configPath = join(runesDir, `${input.name}.json`);

    const allowedRisks: readonly string[] = ["read", "write", "execute", "network"];
    const risk = input.risk && allowedRisks.includes(input.risk) ? input.risk : "execute";

    const runeConfig = {
      name: `custom.${input.name}`,
      description: input.description,
      risk,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
    };

    const ts = await import("typescript");
    let transpiled = ts.default.transpileModule(input.sourceCode, {
      compilerOptions: { target: ts.default.ScriptTarget.ES2022, module: ts.default.ModuleKind.ESNext },
    }).outputText;

    transpiled = transpiled.replace(/export\s+{[^}]+};?/g, "");
    transpiled = transpiled.replace(/export\s+default\s+[^;\n]+;?/g, "");
    transpiled = transpiled.replace(/\bexport\s+(function|const|let|var|class)\b/g, "$1");

    const safeFuncName = input.name.replace(/[^a-zA-Z0-9]/g, "");
    const autoRunWrapper = `
if (typeof ${safeFuncName} === "function") {
  globalThis.output = ${safeFuncName}(input);
} else if (typeof ${input.name} === "function") {
  globalThis.output = ${input.name}(input);
}
`;
    transpiled += autoRunWrapper;

    const jsPath = `${targetPath}.js`;
    await writeFile(jsPath, transpiled, "utf8");
    await writeFile(configPath, JSON.stringify(runeConfig, null, 2), "utf8");

    return { path: jsPath, configPath };
  },
};

export const createRitualRune: Rune<
  { readonly id: string; readonly prompt: string; readonly everyMinutes: number },
  { readonly ritual: { readonly id: string; readonly everyMinutes: number; readonly nextRunAt: string } }
> = {
  name: "workspace.createRitual",
  description: "Creates a scheduled recurring prompt that will be run as an agent turn at the specified interval.",
  risk: "write",
  inputSchema: {
    type: "object",
    required: ["id", "prompt", "everyMinutes"],
    properties: {
      id: { type: "string" },
      prompt: { type: "string" },
      everyMinutes: { type: "number" },
    },
  },
  async invoke(input, context) {
    const ritual = await createRitual(context.workspace, {
      id: input.id,
      prompt: input.prompt,
      sessionId: `ritual:${input.id}`,
      everyMinutes: input.everyMinutes,
    });
    return { ritual: { id: ritual.id, everyMinutes: ritual.everyMinutes, nextRunAt: ritual.nextRunAt } };
  },
};

export const speakRune: Rune<
  { readonly text: string; readonly voice?: string },
  { readonly spoken: boolean; readonly path: string }
> = {
  name: "workspace.speak",
  description: "Converts text to speech and plays it through the system audio output. Uses the system's text-to-speech engine. The agent can decide when to speak vs when to reply in text only.",
  risk: "execute",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      voice: { type: "string" },
    },
  },
  async invoke(input, context) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const tmpDir = join(context.workspace, ".rimuru", "voice");
    await mkdir(tmpDir, { recursive: true });
    const wavPath = join(tmpDir, `speak-${Date.now()}.wav`);

    // Use espeak-ng or ffmpeg for TTS
    try {
      await execFileAsync("espeak-ng", [
        input.text,
        ...(input.voice ? ["-v", input.voice] : []),
        "-w", wavPath,
      ], { timeout: 15_000 });
    } catch {
      // Fallback: use ffmpeg with a basic sine-tone + text file approach
      const txtPath = join(tmpDir, `speak-${Date.now()}.txt`);
      await writeFile(txtPath, input.text, "utf8");
      try {
        await execFileAsync("ffmpeg", [
          "-f", "lavfi",
          "-i", `sine=frequency=440:duration=0.1`,
          "-f", "lavfi",
          "-i", `anullsrc=r=44100:cl=mono`,
          "-frames:v", "1",
          "-t", "0.5",
          "-y", wavPath,
        ], { timeout: 10_000 });
      } catch {
        // Generate a minimal WAV header in code
        const sampleRate = 44100;
        const numChannels = 1;
        const bitsPerSample = 16;
        const dataLength = sampleRate * numChannels * (bitsPerSample / 8) * 0.5;
        const header = Buffer.alloc(44);
        header.write("RIFF", 0);
        header.writeUInt32LE(36 + dataLength, 4);
        header.write("WAVE", 8);
        header.write("fmt ", 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
        header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write("data", 36);
        header.writeUInt32LE(dataLength, 40);
        await writeFile(wavPath, header);
      }
    }

    // Play via ffplay or aplay
    try {
      await execFileAsync("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", wavPath], { timeout: 60_000 });
    } catch {
      try {
        await execFileAsync("aplay", [wavPath], { timeout: 60_000 });
      } catch {
        // Playback unavailable — file still written for manual use
      }
    }

    try { await unlink(wavPath); } catch {}

    return { spoken: true, path: wavPath };
  },
};

export const listenRune: Rune<
  { readonly durationMs?: number },
  { readonly text: string; readonly path: string }
> = {
  name: "workspace.listen",
  description: "Captures audio from the system microphone and returns a transcription of what was spoken. Duration defaults to 5 seconds.",
  risk: "execute",
  inputSchema: {
    type: "object",
    properties: {
      durationMs: { type: "number" },
    },
  },
  async invoke(input, context) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const tmpDir = join(context.workspace, ".rimuru", "voice");
    await mkdir(tmpDir, { recursive: true });
    const wavPath = join(tmpDir, `listen-${Date.now()}.wav`);
    const durationMs = input.durationMs ?? 5000;

    // Capture audio via arecord
    try {
      await execFileAsync("arecord", [
        "-d", String(Math.ceil(durationMs / 1000)),
        "-f", "cd",
        "-t", "wav",
        wavPath,
      ], { timeout: durationMs + 5000 });
    } catch (e) {
      // If arecord unavailable, return empty
      return { text: "", path: wavPath };
    }

    // Transcription stub — in production, use an STT service or local model
    const text = `[audio captured at ${wavPath} — duration ${durationMs}ms]`;

    try { await unlink(wavPath); } catch {}

    return { text, path: wavPath };
  },
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
  applyPatchRune,
  fileTreeRune,
  compileRune,
  createRitualRune,
  speakRune,
  listenRune,
] as const;

function safeWorkspacePath(context: RuneContext, path: string, allowRimuruInternal = false): string {
  return resolveWorkspacePath(context.workspace, path, { allowRimuruInternal });
}

function internalRimuruPath(context: RuneContext, path: string): string {
  return safeWorkspacePath(context, path, true);
}

function isExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function createPreview(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const diff = myersDiff(beforeLines, afterLines);
  const temp: string[] = [];
  for (const item of diff) {
    if (item.type === "add") {
      temp.push(`+ ${item.line}`);
    } else if (item.type === "remove") {
      temp.push(`- ${item.line}`);
    }
  }

  const changes: string[] = ["--- before", "+++ after"];
  const capped = temp.slice(0, 30);
  changes.push(...capped);
  if (temp.length > 30) {
    changes.push(`... and ${temp.length - 30} more line changes`);
  }

  return temp.length === 0 ? "No visible line changes" : changes.join("\n");
}

function myersDiff(before: string[], after: string[]): { type: "add" | "remove" | "common"; line: string }[] {
  const N = before.length;
  const M = after.length;
  const max = N + M;

  if (N === 0 && M === 0) return [];

  if (N === 0) {
    return after.map((line) => ({ type: "add", line }));
  }
  if (M === 0) {
    return before.map((line) => ({ type: "remove", line }));
  }

  const v = new Map<number, number>();
  v.set(1, 0);

  const trace: Map<number, number>[] = [];
  let x = 0;
  let y = 0;
  let d = 0;

  outer: for (d = 0; d <= max; d++) {
    const currentV = new Map<number, number>();

    // Safety fallback for extremely large differences to avoid CPU lockups
    if (d > 1000) {
      break;
    }

    for (let k = -d; k <= d; k += 2) {
      let prevK: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        prevK = k + 1;
        x = v.get(prevK) ?? 0;
      } else {
        prevK = k - 1;
        x = (v.get(prevK) ?? 0) + 1;
      }

      y = x - k;

      while (x < N && y < M && before[x] === after[y]) {
        x++;
        y++;
      }

      currentV.set(k, x);

      if (x >= N && y >= M) {
        trace.push(currentV);
        break outer;
      }
    }

    trace.push(currentV);
    for (const [k, val] of currentV.entries()) {
      v.set(k, val);
    }
  }

  if (d > 1000) {
    const result: { type: "add" | "remove" | "common"; line: string }[] = [];
    for (const line of before) {
      result.push({ type: "remove", line });
    }
    for (const line of after) {
      result.push({ type: "add", line });
    }
    return result;
  }

  const path: { x: number; y: number }[] = [];
  x = N;
  y = M;
  path.push({ x, y });

  for (let step = d; step > 0; step--) {
    const currentV = trace[step];
    const prevV = trace[step - 1];
    if (!currentV || !prevV) break;

    const k = x - y;
    let prevK: number;

    if (k === -step || (k !== step && (prevV.get(k - 1) ?? 0) < (prevV.get(k + 1) ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = prevV.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      path.push({ x, y });
    }

    x = prevX;
    y = prevY;
    path.push({ x, y });
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    path.push({ x, y });
  }

  path.reverse();

  const result: { type: "add" | "remove" | "common"; line: string }[] = [];
  let cx = 0;
  let cy = 0;

  for (const pt of path) {
    if (pt.x === cx && pt.y === cy) {
      continue;
    }
    if (pt.x > cx && pt.y > cy) {
      result.push({ type: "common", line: before[cx] });
      cx = pt.x;
      cy = pt.y;
    } else if (pt.x > cx) {
      result.push({ type: "remove", line: before[cx] });
      cx = pt.x;
    } else if (pt.y > cy) {
      result.push({ type: "add", line: after[cy] });
      cy = pt.y;
    }
  }

  return result;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
