import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeConfig, GateStatus } from "@rimuru/core";

export interface GateState {
  readonly pid: number;
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly workspace: string;
  readonly startedAt: string;
}

export interface GateRuntimeStatus extends GateStatus {
  readonly runtime: "running" | "stopped" | "stale";
  readonly pid?: number;
  readonly url?: string;
  readonly startedAt?: string;
}

export function getGateStatus(config: RuntimeConfig, workspace: string): GateStatus {
  return {
    name: "rimuru-gate",
    state: "ready",
    workspace,
    soul: config.sessionId,
    shard: config.provider,
    model: config.model,
    vows: config.allowedRisks,
    barrier: config.sandboxMode,
  };
}

export async function writeGateState(workspace: string, state: GateState): Promise<void> {
  const path = gateStatePath(workspace);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function readGateState(workspace: string): Promise<GateState | undefined> {
  try {
    const raw = await readFile(gateStatePath(workspace), "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.url !== "string" ||
      typeof parsed.host !== "string" ||
      typeof parsed.port !== "number" ||
      typeof parsed.workspace !== "string" ||
      typeof parsed.startedAt !== "string"
    )
      return undefined;
    return {
      pid: parsed.pid,
      url: parsed.url,
      host: parsed.host,
      port: parsed.port,
      workspace: parsed.workspace,
      startedAt: parsed.startedAt,
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function clearGateState(workspace: string): Promise<void> {
  await rm(gateStatePath(workspace), { force: true });
}

export async function getGateRuntimeStatus(config: RuntimeConfig, workspace: string): Promise<GateRuntimeStatus> {
  const status = getGateStatus(config, workspace);
  const state = await readGateState(workspace);
  if (!state) return { ...status, runtime: "stopped" };
  return {
    ...status,
    runtime: isProcessAlive(state.pid) ? "running" : "stale",
    pid: state.pid,
    url: state.url,
    startedAt: state.startedAt,
  };
}

export async function stopGate(workspace: string): Promise<{ stopped: boolean; pid?: number; reason?: string }> {
  const state = await readGateState(workspace);
  if (!state) return { stopped: false, reason: "Gate is not running" };
  if (!isProcessAlive(state.pid)) {
    await clearGateState(workspace);
    return { stopped: false, pid: state.pid, reason: "Gate state was stale" };
  }
  process.kill(state.pid, "SIGTERM");
  await clearGateState(workspace);
  return { stopped: true, pid: state.pid };
}

function gateStatePath(workspace: string): string {
  return join(workspace, ".rimuru", "gate-state.json");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
