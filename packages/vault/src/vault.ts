import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

export interface VaultEntrySummary {
  readonly name: string;
  readonly updatedAt: string;
}

interface VaultFile {
  readonly version: 1;
  readonly secrets: Readonly<Record<string, EncryptedSecret>>;
}

interface EncryptedSecret {
  readonly iv: string;
  readonly tag: string;
  readonly value: string;
  readonly updatedAt: string;
}

export async function listVaultSecrets(workspace: string): Promise<readonly VaultEntrySummary[]> {
  const vault = await readVault(workspace);
  return Object.entries(vault.secrets)
    .map(([name, entry]) => ({ name, updatedAt: entry.updatedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setVaultSecret(workspace: string, name: string, value: string, env: NodeJS.ProcessEnv = process.env): Promise<VaultEntrySummary> {
  assertSecretName(name);
  const vault = await readVault(workspace);
  const entry = encryptSecret(value, env);
  await writeVault(workspace, { version: 1, secrets: { ...vault.secrets, [name]: entry } });
  return { name, updatedAt: entry.updatedAt };
}

export async function getVaultSecret(workspace: string, name: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  assertSecretName(name);
  const vault = await readVault(workspace);
  const entry = vault.secrets[name];
  if (!entry) throw new Error(`Unknown vault secret: ${name}`);
  return decryptSecret(entry, env);
}

export async function deleteVaultSecret(workspace: string, name: string): Promise<{ readonly deleted: boolean }> {
  assertSecretName(name);
  const vault = await readVault(workspace);
  if (!vault.secrets[name]) return { deleted: false };
  const next = { ...vault.secrets };
  delete next[name];
  await writeVault(workspace, { version: 1, secrets: next });
  return { deleted: true };
}

async function readVault(workspace: string): Promise<VaultFile> {
  try {
    const parsed = JSON.parse(await readFile(vaultPath(workspace), "utf8")) as Partial<VaultFile>;
    if (parsed.version !== 1 || typeof parsed.secrets !== "object" || parsed.secrets === null) throw new Error("Invalid vault file");
    return { version: 1, secrets: parsed.secrets as Readonly<Record<string, EncryptedSecret>> };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return { version: 1, secrets: {} };
    throw error;
  }
}

async function writeVault(workspace: string, vault: VaultFile): Promise<void> {
  const path = vaultPath(workspace);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(vault, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function encryptSecret(value: string, env: NodeJS.ProcessEnv): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), value: encrypted.toString("base64"), updatedAt: new Date().toISOString() };
}

function decryptSecret(entry: EncryptedSecret, env: NodeJS.ProcessEnv): string {
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(env), Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(entry.value, "base64")), decipher.final()]).toString("utf8");
}

function vaultKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.RIMURU_VAULT_KEY ?? `rimuru-local:${process.platform}:${env.USER ?? env.USERNAME ?? "user"}`;
  // Use scrypt for strong key derivation with a fixed salt for local stability
  return scryptSync(secret, "rimuru-salt-v1", 32);
}

function vaultPath(workspace: string): string {
  return join(workspace, ".rimuru", "vault.json");
}

function assertSecretName(name: string): void {
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name)) throw new Error(`Invalid vault secret name: ${name}`);
}
