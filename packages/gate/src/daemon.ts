import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeConfig, RuntimeServices } from "@rimuru/core";
import {
  createRuntime,
  runAgentTurn,
  runChatTurn,
  runDueRituals,
  listRituals,
} from "@rimuru/core";

export interface DaemonState {
  readonly pid: number;
  readonly workspace: string;
  readonly startedAt: string;
  readonly port?: number;
  readonly ritualIntervalMs: number;
}

export interface DaemonOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly ritualIntervalMs?: number;
}

let running = false;
let interval: ReturnType<typeof setInterval> | undefined;

export async function startDaemon(options: DaemonOptions): Promise<DaemonState> {
  if (running) throw new Error("Daemon is already running");

  const state: DaemonState = {
    pid: process.pid,
    workspace: options.workspace,
    startedAt: new Date().toISOString(),
    ritualIntervalMs: options.ritualIntervalMs ?? 60_000,
  };

  await writeDaemonState(options.workspace, state);

  const runtime = await createRuntime({
    config: options.config,
    workspace: options.workspace,
  });

  running = true;
  let tickRunning = false;

  interval = setInterval(async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      await runDueRituals(options.workspace, new Date(), async (ritual) => {
        if (ritual.sessionId.startsWith("ritual:") || ritual.sessionId.startsWith("learning:")) {
          // Agent turns for learning/self-improvement rituals
          await runAgentTurn({
            config: options.config,
            workspace: options.workspace,
            objective: ritual.prompt,
            sessionId: ritual.sessionId,
          });
        } else {
          // Chat turns for simple message rituals
          await runChatTurn({
            config: options.config,
            workspace: options.workspace,
            prompt: ritual.prompt,
            sessionId: ritual.sessionId,
          });
        }
      });
    } catch (err) {
      console.error("[daemon] Ritual tick error:", err instanceof Error ? err.message : err);
    } finally {
      tickRunning = false;
    }
  }, state.ritualIntervalMs);

  interval.unref();

  // Graceful shutdown
  process.on("SIGTERM", async () => { await stopDaemon(options.workspace); process.exit(0); });
  process.on("SIGINT", async () => { await stopDaemon(options.workspace); process.exit(0); });

  return state;
}

export async function stopDaemon(workspace: string): Promise<{ stopped: boolean; reason?: string }> {
  if (interval) {
    clearInterval(interval);
    interval = undefined;
  }
  running = false;
  try {
    await clearDaemonState(workspace);
  } catch {
    return { stopped: true, reason: "State file already cleared" };
  }
  return { stopped: true };
}

export async function daemonStatus(workspace: string): Promise<{
  running: boolean;
  pid?: number;
  startedAt?: string;
  ritualCount?: number;
}> {
  const state = await readDaemonState(workspace);
  if (!state) return { running: false };

  if (!isProcessAlive(state.pid)) {
    await clearDaemonState(workspace);
    return { running: false };
  }

  const rituals = await listRituals(workspace);
  return {
    running: true,
    pid: state.pid,
    startedAt: state.startedAt,
    ritualCount: rituals.length,
  };
}

export async function renderSystemdService(workspace: string, nodePath?: string): Promise<string> {
  const home = process.env.HOME ?? "/root";
  const node = nodePath ?? process.execPath;

  return [
    "[Unit]",
    "Description=Rimuru Sovereign Agent Daemon",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${process.env.USER ?? "root"}`,
    `WorkingDirectory=${workspace}`,
    `ExecStart=${node} ${join(home, ".rimuru", "daemon.mjs")} --workspace ${workspace}`,
    "Restart=on-failure",
    "RestartSec=10",
    "StandardOutput=journal",
    "StandardError=journal",
    "SyslogIdentifier=rimuru-daemon",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ].join("\n");
}

function daemonStatePath(workspace: string): string {
  return join(workspace, ".rimuru", "daemon-state.json");
}

async function writeDaemonState(workspace: string, state: DaemonState): Promise<void> {
  const path = daemonStatePath(workspace);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readDaemonState(workspace: string): Promise<DaemonState | undefined> {
  try {
    const raw = await readFile(daemonStatePath(workspace), "utf8");
    return JSON.parse(raw) as DaemonState;
  } catch {
    return undefined;
  }
}

async function clearDaemonState(workspace: string): Promise<void> {
  await rm(daemonStatePath(workspace), { force: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
