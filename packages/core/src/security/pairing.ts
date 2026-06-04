import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PairingEntry {
  readonly code: string;
  readonly circle: string;
  readonly from: string;
  readonly createdAt: string;
}

export interface AllowedSender {
  readonly circle: string;
  readonly from: string;
  readonly approvedAt: string;
}

interface PairingFile {
  readonly pending: readonly PairingEntry[];
  readonly allowed: readonly AllowedSender[];
}

export async function requestPairing(workspace: string, circle: string, from: string): Promise<PairingEntry> {
  const store = await readPairings(workspace);
  const existing = store.pending.find((entry) => entry.circle === circle && entry.from === from);
  if (existing) return existing;
  const entry = { code: String(randomInt(100000, 999999)), circle, from, createdAt: new Date().toISOString() };
  await writePairings(workspace, { ...store, pending: [...store.pending, entry] });
  return entry;
}

export async function approvePairing(workspace: string, code: string): Promise<AllowedSender> {
  const store = await readPairings(workspace);
  const pending = store.pending.find((entry) => entry.code === code);
  if (!pending) throw new Error(`Unknown pairing code: ${code}`);
  const allowed = { circle: pending.circle, from: pending.from, approvedAt: new Date().toISOString() };
  await writePairings(workspace, {
    pending: store.pending.filter((entry) => entry.code !== code),
    allowed: uniqueAllowed([...store.allowed, allowed]),
  });
  return allowed;
}

export async function listPairings(workspace: string): Promise<PairingFile> {
  return readPairings(workspace);
}

export async function isSenderAllowed(
  workspace: string,
  circle: string,
  from: string,
  configuredAllow: readonly string[] = [],
): Promise<boolean> {
  if (configuredAllow.includes("*") || configuredAllow.includes(from)) return true;
  const store = await readPairings(workspace);
  return store.allowed.some((entry) => entry.circle === circle && entry.from === from);
}

export async function requireSenderAllowed(
  workspace: string,
  circle: string,
  from: string,
  configuredAllow: readonly string[] = [],
): Promise<{ readonly allowed: true } | { readonly allowed: false; readonly pairing: PairingEntry }> {
  if (await isSenderAllowed(workspace, circle, from, configuredAllow)) return { allowed: true };
  return { allowed: false, pairing: await requestPairing(workspace, circle, from) };
}

async function readPairings(workspace: string): Promise<PairingFile> {
  try {
    const parsed = JSON.parse(await readFile(pairingPath(workspace), "utf8")) as Partial<PairingFile>;
    return { pending: parsed.pending ?? [], allowed: parsed.allowed ?? [] };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return { pending: [], allowed: [] };
    throw error;
  }
}

async function writePairings(workspace: string, store: PairingFile): Promise<void> {
  const path = pairingPath(workspace);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function pairingPath(workspace: string): string {
  return join(workspace, ".rimuru", "pairings.json");
}

function uniqueAllowed(entries: readonly AllowedSender[]): readonly AllowedSender[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.circle}:${entry.from}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
