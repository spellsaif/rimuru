import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertCommandName } from "./workspace.js";

const execFileAsync = promisify(execFile);

export type SandboxMode = "none" | "readonly" | "docker" | "wasi";

export interface SandboxCommandInput {
  readonly command: string;
  readonly args?: readonly string[];
  readonly workspace: string;
  readonly signal?: AbortSignal;
}

export async function runSandboxedCommand(input: SandboxCommandInput, mode: SandboxMode = sandboxModeFromEnv()): Promise<{ readonly stdout: string; readonly stderr: string }> {
  if (mode !== "wasi") {
    assertCommandName(input.command);
  }
  if (mode === "readonly") throw new Error("Sandbox readonly mode denies command execution");
  if (mode === "docker") {
    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["run", "--rm", "--network", "none", "-v", `${input.workspace}:/workspace:ro`, "-w", "/workspace", "node:22-alpine", input.command, ...(input.args ?? [])],
      { cwd: input.workspace, signal: input.signal, maxBuffer: 1024 * 1024 }
    );
    return { stdout, stderr };
  }
  if (mode === "wasi") {
    let stdoutFile: any;
    let stderrFile: any;
    const { join, resolve } = await import("node:path");
    const { resolveWorkspacePath } = await import("./workspace.js");
    
    // Ensure wasm path does not escape workspace or access forbidden directories
    const wasmPath = resolve(input.workspace, `${input.command}.wasm`);
    resolveWorkspacePath(input.workspace, wasmPath);

    const stdoutPath = join(input.workspace, `.rimuru-wasi-stdout-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
    const stderrPath = join(input.workspace, `.rimuru-wasi-stderr-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
    try {
      const { WASI } = await import("node:wasi");
      const { readFile, open, unlink } = await import("node:fs/promises");
      
      stdoutFile = await open(stdoutPath, "w+");
      stderrFile = await open(stderrPath, "w+");
      
      const wasi = new WASI({
        version: "preview1",
        args: [input.command, ...(input.args ?? [])],
        env: process.env,
        preopens: { "/workspace": input.workspace },
        stdout: stdoutFile.fd,
        stderr: stderrFile.fd
      });
      const wasmBuffer = await readFile(wasmPath);
      const wasmModule = await WebAssembly.compile(wasmBuffer);
      const instance = await WebAssembly.instantiate(wasmModule, wasi.getImportObject() as any);
      wasi.start(instance);
      
      await stdoutFile.close();
      await stderrFile.close();
      stdoutFile = undefined;
      stderrFile = undefined;
      
      const stdout = await readFile(stdoutPath, "utf8");
      const stderr = await readFile(stderrPath, "utf8");
      
      await unlink(stdoutPath);
      await unlink(stderrPath);
      
      return { stdout, stderr };
    } catch (e: any) {
      if (stdoutFile) {
        try { await stdoutFile.close(); } catch {}
      }
      if (stderrFile) {
        try { await stderrFile.close(); } catch {}
      }
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(stdoutPath);
      } catch {}
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(stderrPath);
      } catch {}
      throw new Error(`WASI execution failed: wasm binary for '${input.command}' not found or invalid (${e.message})`);
    }
  }
  const { stdout, stderr } = await execFileAsync(input.command, [...(input.args ?? [])], { cwd: input.workspace, signal: input.signal, maxBuffer: 1024 * 1024 });
  return { stdout, stderr };
}

export function sandboxModeFromEnv(env: NodeJS.ProcessEnv = process.env): SandboxMode {
  const value = env.RIMURU_SANDBOX ?? "none";
  if (value === "none" || value === "readonly" || value === "docker" || value === "wasi") return value;
  throw new Error(`Unsupported sandbox mode: ${value}`);
}
