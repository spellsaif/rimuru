import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export async function listRituals(workspace) {
    return readRituals(workspace);
}
export async function createRitual(workspace, input) {
    assertRitualId(input.id);
    if (!input.prompt.trim())
        throw new Error("Ritual prompt is required");
    if (!Number.isInteger(input.everyMinutes) || input.everyMinutes < 1)
        throw new Error("Ritual interval must be at least one minute");
    const rituals = await readRituals(workspace);
    const ritual = {
        id: input.id,
        prompt: input.prompt,
        sessionId: input.sessionId,
        everyMinutes: input.everyMinutes,
        enabled: true,
        nextRunAt: (input.startAt ?? new Date(Date.now() + input.everyMinutes * 60_000)).toISOString(),
    };
    await writeRituals(workspace, [...rituals.filter((item) => item.id !== input.id), ritual].sort((a, b) => a.id.localeCompare(b.id)));
    return ritual;
}
export async function deleteRitual(workspace, id) {
    const rituals = await readRituals(workspace);
    const next = rituals.filter((ritual) => ritual.id !== id);
    await writeRituals(workspace, next);
    return { deleted: next.length !== rituals.length };
}
export async function setRitualEnabled(workspace, id, enabled) {
    const rituals = await readRituals(workspace);
    const ritual = rituals.find((item) => item.id === id);
    if (!ritual)
        throw new Error(`Unknown ritual: ${id}`);
    const next = { ...ritual, enabled };
    await writeRituals(workspace, rituals.map((item) => (item.id === id ? next : item)));
    return next;
}
export async function runDueRituals(workspace, now, runner) {
    const rituals = await readRituals(workspace);
    const ran = [];
    const next = [];
    for (const ritual of rituals) {
        if (!ritual.enabled || Date.parse(ritual.nextRunAt) > now.getTime()) {
            next.push(ritual);
            continue;
        }
        await runner(ritual);
        const updated = {
            ...ritual,
            lastRunAt: now.toISOString(),
            nextRunAt: new Date(now.getTime() + ritual.everyMinutes * 60_000).toISOString(),
        };
        ran.push(updated);
        next.push(updated);
    }
    if (ran.length > 0)
        await writeRituals(workspace, next);
    return ran;
}
async function readRituals(workspace) {
    try {
        const parsed = JSON.parse(await readFile(ritualPath(workspace), "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return [];
        throw error;
    }
}
async function writeRituals(workspace, rituals) {
    const path = ritualPath(workspace);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(rituals, null, 2)}\n`, "utf8");
}
function ritualPath(workspace) {
    return join(workspace, ".rimuru", "rituals", "rituals.json");
}
function assertRitualId(id) {
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id))
        throw new Error(`Invalid ritual id: ${id}`);
}
//# sourceMappingURL=rituals.js.map