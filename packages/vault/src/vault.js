import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { execSync } from "node:child_process";
export async function listVaultSecrets(workspace) {
    const vault = await readVault(workspace);
    return Object.entries(vault.secrets)
        .map(([name, entry]) => ({ name, updatedAt: entry.updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
export async function setVaultSecret(workspace, name, value, env = process.env) {
    assertSecretName(name);
    const vault = await readVault(workspace);
    const entry = encryptSecret(value, env);
    await writeVault(workspace, { version: 1, secrets: { ...vault.secrets, [name]: entry } });
    return { name, updatedAt: entry.updatedAt };
}
export async function getVaultSecret(workspace, name, env = process.env) {
    assertSecretName(name);
    const vault = await readVault(workspace);
    const entry = vault.secrets[name];
    if (!entry)
        throw new Error(`Unknown vault secret: ${name}`);
    return decryptSecret(entry, env);
}
export async function deleteVaultSecret(workspace, name) {
    assertSecretName(name);
    const vault = await readVault(workspace);
    if (!vault.secrets[name])
        return { deleted: false };
    const next = { ...vault.secrets };
    delete next[name];
    await writeVault(workspace, { version: 1, secrets: next });
    return { deleted: true };
}
async function readVault(workspace) {
    try {
        const parsed = JSON.parse(await readFile(vaultPath(workspace), "utf8"));
        if (parsed.version !== 1 || typeof parsed.secrets !== "object" || parsed.secrets === null)
            throw new Error("Invalid vault file");
        return { version: 1, secrets: parsed.secrets };
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return { version: 1, secrets: {} };
        throw error;
    }
}
async function writeVault(workspace, vault) {
    const path = vaultPath(workspace);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(vault, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
function encryptSecret(value, env) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", vaultKey(env), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        value: encrypted.toString("base64"),
        updatedAt: new Date().toISOString(),
    };
}
function decryptSecret(entry, env) {
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(env), Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(entry.value, "base64")), decipher.final()]).toString("utf8");
}
function vaultKey(env) {
    let secret = env.RIMURU_VAULT_KEY;
    if (!secret) {
        try {
            secret = execSync("secret-tool lookup app rimuru", {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        }
        catch {
            // Secure keychain query failed or not available, fall back
        }
    }
    if (!secret) {
        throw new Error("RIMURU_VAULT_KEY environment variable is not configured and secure keychain lookup failed. Vault decryption/encryption denied.");
    }
    // Use scrypt for strong key derivation with a fixed salt for local stability
    return scryptSync(secret, "rimuru-salt-v1", 32);
}
function vaultPath(workspace) {
    return join(workspace, ".rimuru", "vault.json");
}
function assertSecretName(name) {
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name))
        throw new Error(`Invalid vault secret name: ${name}`);
}
//# sourceMappingURL=vault.js.map