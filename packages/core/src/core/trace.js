import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactSecrets } from "../security/redact.js";
export class JsonTraceStore {
    root;
    constructor(root) {
        this.root = root;
    }
    async save(record) {
        const file = join(this.root, `${safeName(record.sessionId)}-${record.createdAt.getTime()}.json`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(serializeTrace(record), null, 2), "utf8");
        return file;
    }
    async list() {
        try {
            return (await readdir(this.root)).filter((entry) => entry.endsWith(".json")).sort();
        }
        catch (error) {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
                return [];
            throw error;
        }
    }
    async inspect(name) {
        return JSON.parse(await readFile(join(this.root, safeName(name).endsWith(".json") ? safeName(name) : `${safeName(name)}.json`), "utf8"));
    }
}
function safeName(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function serializeTrace(record) {
    return {
        sessionId: record.sessionId,
        createdAt: record.createdAt.toISOString(),
        messages: record.messages.map((message) => ({
            ...message,
            content: redactSecrets(message.content),
            createdAt: message.createdAt.toISOString(),
        })),
        events: record.events.map((event) => ({ ...event, at: event.at.toISOString() })),
    };
}
//# sourceMappingURL=trace.js.map