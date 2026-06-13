import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export class HashEmbeddingProvider {
    dimensions;
    name = "hash-local";
    constructor(dimensions = 64) {
        this.dimensions = dimensions;
    }
    async embed(text) {
        const vector = Array.from({ length: this.dimensions }, () => 0);
        for (const term of terms(text)) {
            const index = hash(term) % this.dimensions;
            vector[index] = (vector[index] ?? 0) + 1;
        }
        return normalize(vector);
    }
}
export class JsonSemanticMemoryStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async all() {
        try {
            return JSON.parse(await readFile(this.path, "utf8"));
        }
        catch (error) {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
                return [];
            throw error;
        }
    }
    async upsert(records) {
        const current = new Map((await this.all()).map((record) => [record.id, record]));
        for (const record of records)
            current.set(record.id, record);
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path, `${JSON.stringify([...current.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`, "utf8");
    }
    async search(embedding, options = {}) {
        const limit = options.limit ?? 8;
        return (await this.all())
            .filter((record) => !options.sessionId || record.sessionId === options.sessionId)
            .map((record) => ({ record, score: cosine(embedding, record.embedding) }))
            .filter((result) => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    async compact(options = {}) {
        const keepPerSession = options.keepPerSession ?? 50;
        const grouped = new Map();
        for (const record of await this.all())
            grouped.set(record.sessionId, [...(grouped.get(record.sessionId) ?? []), record]);
        const kept = [...grouped.values()].flatMap((records) => records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, keepPerSession));
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path, `${JSON.stringify(kept.sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`, "utf8");
    }
}
export class SemanticMemory {
    options;
    constructor(options) {
        this.options = options;
    }
    async remember(input) {
        const createdAt = (this.options.clock ?? (() => new Date()))().toISOString();
        const record = {
            id: `${input.sessionId}:${input.scope}:${hash(`${input.text}:${createdAt}`).toString(16)}`,
            sessionId: input.sessionId,
            scope: input.scope,
            text: input.text,
            summary: summarize(input.text),
            metadata: input.metadata ?? {},
            embedding: await this.options.embeddings.embed(input.text),
            createdAt,
        };
        await this.options.store.upsert([record]);
        return record;
    }
    async indexChronicle(sessionId, chronicle) {
        const messages = await chronicle.load(sessionId);
        const records = [];
        for (let index = 0; index < messages.length; index += 1) {
            const message = messages[index];
            if (!message.content.trim())
                continue;
            records.push(await this.recordForMessage(sessionId, index, message));
        }
        await this.options.store.upsert(records);
        return records;
    }
    async search(query, options = {}) {
        return this.options.store.search(await this.options.embeddings.embed(query), options);
    }
    async compact(options = {}) {
        await this.options.store.compact(options);
    }
    async recordForMessage(sessionId, index, message) {
        const text = `${message.role}: ${message.content}`;
        return {
            id: `${sessionId}:chronicle:${index}`,
            sessionId,
            scope: "chronicle",
            text,
            summary: summarize(text),
            metadata: { role: message.role, index: String(index) },
            embedding: await this.options.embeddings.embed(text),
            createdAt: message.createdAt.toISOString(),
        };
    }
}
export function createSemanticMemory(root) {
    return new SemanticMemory({
        store: new JsonSemanticMemoryStore(join(root, "semantic-memory.json")),
        embeddings: new HashEmbeddingProvider(),
    });
}
export function semanticMemoryRunes(memory) {
    return [
        {
            name: "memory.remember",
            description: "Stores text in semantic memory for the current session.",
            risk: "write",
            inputSchema: {
                type: "object",
                required: ["text"],
                properties: { text: { type: "string" }, scope: { type: "string" } },
            },
            async invoke(input, context) {
                return memory.remember({ sessionId: context.sessionId, scope: input.scope ?? "note", text: input.text });
            },
        },
        {
            name: "memory.search",
            description: "Searches semantic memory using local embeddings.",
            risk: "read",
            inputSchema: {
                type: "object",
                required: ["query"],
                properties: { query: { type: "string" }, limit: { type: "number" } },
            },
            async invoke(input, context) {
                return {
                    results: await memory.search(input.query, {
                        sessionId: context.sessionId,
                        ...(input.limit === undefined ? {} : { limit: input.limit }),
                    }),
                };
            },
        },
    ];
}
function summarize(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 240);
}
function terms(value) {
    return value.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
}
function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}
function normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0)
        return vector;
    return vector.map((value) => value / magnitude);
}
function cosine(left, right) {
    const size = Math.min(left.length, right.length);
    let score = 0;
    for (let index = 0; index < size; index += 1)
        score += (left[index] ?? 0) * (right[index] ?? 0);
    return score;
}
//# sourceMappingURL=semantic.js.map