import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveWorkspacePath } from "../security/workspace.js";

export interface RollbackRecord {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly createdAt: string;
}

export interface RollbackSummary {
  readonly id: string;
  readonly path: string;
  readonly createdAt: string;
}

export async function listRollbacks(workspace: string): Promise<readonly RollbackSummary[]> {
  const root = rollbackRoot(workspace);
  try {
    const entries = (await readdir(root)).filter((entry) => entry.endsWith(".json")).sort().reverse();
    const summaries: RollbackSummary[] = [];
    for (const entry of entries) {
      const record = await readRollback(workspace, entry);
      summaries.push({ id: entry, path: record.path, createdAt: record.createdAt });
    }
    return summaries;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function inspectRollback(workspace: string, id: string): Promise<RollbackRecord> {
  return readRollback(workspace, id);
}

export async function applyRollback(workspace: string, id: string): Promise<{ readonly path: string; readonly restored: boolean }> {
  const record = await readRollback(workspace, id);
  const path = resolveWorkspacePath(workspace, record.path);
  await writeFile(path, record.before, "utf8");
  return { path: record.path, restored: true };
}

async function readRollback(workspace: string, id: string): Promise<RollbackRecord> {
  const raw = await readFile(join(rollbackRoot(workspace), safeRollbackId(id)), "utf8");
  const parsed = JSON.parse(raw) as Partial<RollbackRecord>;
  if (typeof parsed.path !== "string" || typeof parsed.before !== "string" || typeof parsed.after !== "string" || typeof parsed.createdAt !== "string") {
    throw new Error(`Invalid rollback record: ${id}`);
  }
  return { path: parsed.path, before: parsed.before, after: parsed.after, createdAt: parsed.createdAt };
}

function rollbackRoot(workspace: string): string {
  return join(workspace, ".rimuru", "rollbacks");
}

function safeRollbackId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.endsWith(".json") ? safe : `${safe}.json`;
}
