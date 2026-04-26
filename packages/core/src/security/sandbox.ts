import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertCommandName } from "./workspace.js";

const execFileAsync = promisify(execFile);

export type SandboxMode = "none" | "readonly" | "docker";

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
  const { stdout, stderr } = await execFileAsync(input.command, [...(input.args ?? [])], { cwd: input.workspace, signal: input.signal, maxBuffer: 1024 * 1024 });
  return { stdout, stderr };
}

export function sandboxModeFromEnv(env: NodeJS.ProcessEnv = process.env): SandboxMode {
  const value = env.RIMURU_SANDBOX ?? "none";
  if (value === "none" || value === "readonly" || value === "docker") return value;
  throw new Error(`Unsupported sandbox mode: ${value}`);
}
