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
  assertCommandName(input.command);
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
    try {
      const { WASI } = await import("node:wasi");
      const { readFile } = await import("node:fs/promises");
      const wasmPath = `${input.command}.wasm`;
      const wasi = new WASI({
        version: "preview1",
        args: [input.command, ...(input.args ?? [])],
        env: process.env,
        preopens: { "/workspace": input.workspace }
      });
      const wasmBuffer = await readFile(wasmPath);
      const wasmModule = await WebAssembly.compile(wasmBuffer);
      const instance = await WebAssembly.instantiate(wasmModule, wasi.getImportObject() as any);
      wasi.start(instance);
      return { stdout: "WASI execution completed", stderr: "" };
    } catch (e: any) {
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
