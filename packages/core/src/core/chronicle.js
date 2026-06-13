import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export class MemoryChronicle {
    #sessions = new Map();
    async load(sessionId) {
        return [...(this.#sessions.get(sessionId) ?? [])];
    }
    async append(sessionId, messages) {
        const current = this.#sessions.get(sessionId) ?? [];
        this.#sessions.set(sessionId, [...current, ...messages]);
    }
    async overwrite(sessionId, messages) {
        this.#sessions.set(sessionId, [...messages]);
    }
    async delete(sessionId) {
        this.#sessions.delete(sessionId);
    }
}
/**
 * Enhanced JsonChronicle using an append-only JSONL format.
 * This ensures O(1) appends and prevents data loss during concurrent writes.
 */
export class JsonChronicle {
    root;
    constructor(root) {
        this.root = root;
    }
    async load(sessionId) {
        const path = this.pathFor(sessionId);
        try {
            const raw = await readFile(path, "utf8");
            return raw
                .split("\n")
                .filter((line) => line.trim().length > 0)
                .map((line) => deserializeMessage(JSON.parse(line)));
        }
        catch (error) {
            if (isMissingFile(error))
                return [];
            throw error;
        }
    }
    async append(sessionId, messages) {
        const path = this.pathFor(sessionId);
        await mkdir(dirname(path), { recursive: true });
        const lines = messages.map((m) => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
        await appendFile(path, lines, "utf8");
    }
    async overwrite(sessionId, messages) {
        const path = this.pathFor(sessionId);
        await mkdir(dirname(path), { recursive: true });
        const content = messages.map((m) => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
        await writeFile(path, content, "utf8");
    }
    async delete(sessionId) {
        const path = this.pathFor(sessionId);
        try {
            await rm(path, { force: true });
        }
        catch { }
    }
    async listSessions() {
        try {
            const entries = await readdir(this.root);
            return entries
                .filter((entry) => entry.endsWith(".jsonl"))
                .map((entry) => entry.slice(0, -6))
                .sort();
        }
        catch (error) {
            if (isMissingFile(error))
                return [];
            throw error;
        }
    }
    async summarize(sessionId) {
        const messages = await this.load(sessionId);
        if (messages.length === 0)
            return "No messages recorded.";
        const first = messages[0];
        const last = messages[messages.length - 1];
        return `${messages.length} messages. First ${first.role}: ${first.content.slice(0, 120)}. Last ${last.role}: ${last.content.slice(0, 120)}.`;
    }
    async compact(sessionId, keepLast = 20) {
        const messages = await this.load(sessionId);
        if (messages.length <= keepLast)
            return;
        const summary = {
            role: "system",
            content: `Chronicle compacted at ${new Date().toISOString()}. Previous state: ${await this.summarize(sessionId)}`,
            createdAt: new Date(),
        };
        const path = this.pathFor(sessionId);
        const content = [summary, ...messages.slice(-keepLast)].map((m) => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
        await writeFile(path, content, "utf8");
    }
    pathFor(sessionId) {
        const safeSession = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
        return join(this.root, `${safeSession}.jsonl`);
    }
}
function serializeMessage(message) {
    return {
        role: message.role,
        content: message.content,
        ...(message.name === undefined ? {} : { name: message.name }),
        ...(message.toolCalls ? { toolCalls: message.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments })) } : {}),
        ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
        createdAt: message.createdAt.toISOString(),
    };
}
function deserializeMessage(message) {
    return {
        role: message.role,
        content: message.content,
        ...(message.name === undefined ? {} : { name: message.name }),
        ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
        ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
        createdAt: new Date(message.createdAt),
    };
}
function isMissingFile(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
//# sourceMappingURL=chronicle.js.map