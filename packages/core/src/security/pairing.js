import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export async function requestPairing(workspace, circle, from) {
    const store = await readPairings(workspace);
    const existing = store.pending.find((entry) => entry.circle === circle && entry.from === from);
    if (existing)
        return existing;
    const entry = { code: String(randomInt(100000, 999999)), circle, from, createdAt: new Date().toISOString() };
    await writePairings(workspace, { ...store, pending: [...store.pending, entry] });
    return entry;
}
export async function approvePairing(workspace, code) {
    const store = await readPairings(workspace);
    const pending = store.pending.find((entry) => entry.code === code);
    if (!pending)
        throw new Error(`Unknown pairing code: ${code}`);
    const allowed = { circle: pending.circle, from: pending.from, approvedAt: new Date().toISOString() };
    await writePairings(workspace, {
        pending: store.pending.filter((entry) => entry.code !== code),
        allowed: uniqueAllowed([...store.allowed, allowed]),
    });
    return allowed;
}
export async function listPairings(workspace) {
    return readPairings(workspace);
}
export async function isSenderAllowed(workspace, circle, from, configuredAllow = []) {
    if (configuredAllow.includes("*") || configuredAllow.includes(from))
        return true;
    const store = await readPairings(workspace);
    return store.allowed.some((entry) => entry.circle === circle && entry.from === from);
}
export async function requireSenderAllowed(workspace, circle, from, configuredAllow = []) {
    if (await isSenderAllowed(workspace, circle, from, configuredAllow))
        return { allowed: true };
    return { allowed: false, pairing: await requestPairing(workspace, circle, from) };
}
async function readPairings(workspace) {
    try {
        const parsed = JSON.parse(await readFile(pairingPath(workspace), "utf8"));
        return { pending: parsed.pending ?? [], allowed: parsed.allowed ?? [] };
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return { pending: [], allowed: [] };
        throw error;
    }
}
async function writePairings(workspace, store) {
    const path = pairingPath(workspace);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
function pairingPath(workspace) {
    return join(workspace, ".rimuru", "pairings.json");
}
function uniqueAllowed(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
        const key = `${entry.circle}:${entry.from}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=pairing.js.map