import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface MergeEnvelope {
  readonly branchId: string;
  readonly rootHash: string;
  readonly tests: readonly string[];
  readonly signedBy: string;
  readonly signature: string;
  readonly createdAt: string;
}

export type MergePolicy = "single" | "consensus";

export interface ConsensusConfig {
  readonly policy: "consensus";
  readonly requiredSignatures: number;
  readonly signers: readonly string[];
}

export async function createMergeEnvelope(options: {
  readonly branchId: string;
  readonly rootHash: string;
  readonly tests: readonly string[];
  readonly signedBy: string;
  readonly signingKey: string;
}): Promise<MergeEnvelope> {
  const payload = `${options.branchId}:${options.rootHash}:${options.tests.join(",")}`;
  const signature = createHmac("sha256", options.signingKey).update(payload).digest("hex");

  return {
    branchId: options.branchId,
    rootHash: options.rootHash,
    tests: options.tests,
    signedBy: options.signedBy,
    signature,
    createdAt: new Date().toISOString(),
  };
}

export function verifyMergeEnvelope(
  envelope: MergeEnvelope,
  secretKey: string,
): boolean {
  const payload = `${envelope.branchId}:${envelope.rootHash}:${envelope.tests.join(",")}`;
  const expected = createHmac("sha256", secretKey).update(payload).digest("hex");
  try {
    return expected === envelope.signature;
  } catch {
    return false;
  }
}

export async function saveMergeEnvelope(
  workspace: string,
  envelope: MergeEnvelope,
): Promise<void> {
  const dir = resolve(workspace, ".rimuru", "merges");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${envelope.branchId}.json`);
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

export async function loadMergeEnvelope(
  workspace: string,
  branchId: string,
): Promise<MergeEnvelope | undefined> {
  try {
    const path = resolve(workspace, ".rimuru", "merges", `${branchId}.json`);
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as MergeEnvelope;
  } catch {
    return undefined;
  }
}

export function deriveSigningKey(vaultKey: string): string {
  return createHash("sha256").update(`rimuru-merge-key:${vaultKey}`).digest("hex");
}
