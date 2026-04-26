import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Chronicle, Message, Rune } from "../core/types.js";

export interface EmbeddingProvider {
  readonly name: string;
  embed(text: string): Promise<readonly number[]>;
}

export interface SemanticMemoryRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly scope: "chronicle" | "workspace" | "note";
  readonly text: string;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly embedding: readonly number[];
  readonly createdAt: string;
}

export interface SemanticMemorySearchResult {
  readonly record: SemanticMemoryRecord;
  readonly score: number;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "hash-local";

  constructor(private readonly dimensions = 64) {}

  async embed(text: string): Promise<readonly number[]> {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    for (const term of terms(text)) {
      const index = hash(term) % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    return normalize(vector);
  }
}

export class JsonSemanticMemoryStore {
  constructor(private readonly path: string) {}

  async all(): Promise<readonly SemanticMemoryRecord[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as SemanticMemoryRecord[];
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  async upsert(records: readonly SemanticMemoryRecord[]): Promise<void> {
    const current = new Map((await this.all()).map((record) => [record.id, record]));
    for (const record of records) current.set(record.id, record);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify([...current.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`, "utf8");
  }

  async search(embedding: readonly number[], options: { readonly sessionId?: string; readonly limit?: number } = {}): Promise<readonly SemanticMemorySearchResult[]> {
    const limit = options.limit ?? 8;
    return (await this.all())
      .filter((record) => !options.sessionId || record.sessionId === options.sessionId)
      .map((record) => ({ record, score: cosine(embedding, record.embedding) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async compact(options: { readonly keepPerSession?: number } = {}): Promise<void> {
    const keepPerSession = options.keepPerSession ?? 50;
    const grouped = new Map<string, SemanticMemoryRecord[]>();
    for (const record of await this.all()) grouped.set(record.sessionId, [...(grouped.get(record.sessionId) ?? []), record]);
    const kept = [...grouped.values()].flatMap((records) => records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, keepPerSession));
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(kept.sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`, "utf8");
  }
}

export class SemanticMemory {
  constructor(private readonly options: { readonly store: JsonSemanticMemoryStore; readonly embeddings: EmbeddingProvider; readonly clock?: () => Date }) {}

  async remember(input: { readonly sessionId: string; readonly scope: SemanticMemoryRecord["scope"]; readonly text: string; readonly metadata?: Readonly<Record<string, string>> }): Promise<SemanticMemoryRecord> {
    const createdAt = (this.options.clock ?? (() => new Date()))().toISOString();
    const record: SemanticMemoryRecord = {
      id: `${input.sessionId}:${input.scope}:${hash(`${input.text}:${createdAt}`).toString(16)}`,
      sessionId: input.sessionId,
      scope: input.scope,
      text: input.text,
      summary: summarize(input.text),
      metadata: input.metadata ?? {},
      embedding: await this.options.embeddings.embed(input.text),
      createdAt
    };
    await this.options.store.upsert([record]);
    return record;
  }

  async indexChronicle(sessionId: string, chronicle: Chronicle): Promise<readonly SemanticMemoryRecord[]> {
    const messages = await chronicle.load(sessionId);
    const records: SemanticMemoryRecord[] = [];
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]!;
      if (!message.content.trim()) continue;
      records.push(await this.recordForMessage(sessionId, index, message));
    }
    await this.options.store.upsert(records);
    return records;
  }

  async search(query: string, options: { readonly sessionId?: string; readonly limit?: number } = {}): Promise<readonly SemanticMemorySearchResult[]> {
    return this.options.store.search(await this.options.embeddings.embed(query), options);
  }

  async compact(options: { readonly keepPerSession?: number } = {}): Promise<void> {
    await this.options.store.compact(options);
  }

  private async recordForMessage(sessionId: string, index: number, message: Message): Promise<SemanticMemoryRecord> {
    const text = `${message.role}: ${message.content}`;
    return {
      id: `${sessionId}:chronicle:${index}`,
      sessionId,
      scope: "chronicle",
      text,
      summary: summarize(text),
      metadata: { role: message.role, index: String(index) },
      embedding: await this.options.embeddings.embed(text),
      createdAt: message.createdAt.toISOString()
    };
  }
}

export function createSemanticMemory(root: string): SemanticMemory {
  return new SemanticMemory({ store: new JsonSemanticMemoryStore(join(root, "semantic-memory.json")), embeddings: new HashEmbeddingProvider() });
}

export function semanticMemoryRunes(memory: SemanticMemory): readonly Rune[] {
  return [
    {
      name: "memory.remember",
      description: "Stores text in semantic memory for the current session.",
      risk: "write",
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, scope: { type: "string" } } },
      async invoke(input: { readonly text: string; readonly scope?: SemanticMemoryRecord["scope"] }, context) {
        return memory.remember({ sessionId: context.sessionId, scope: input.scope ?? "note", text: input.text });
      }
    },
    {
      name: "memory.search",
      description: "Searches semantic memory using local embeddings.",
      risk: "read",
      inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "number" } } },
      async invoke(input: { readonly query: string; readonly limit?: number }, context) {
        return { results: await memory.search(input.query, { sessionId: context.sessionId, ...(input.limit === undefined ? {} : { limit: input.limit }) }) };
      }
    }
  ];
}

function summarize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function terms(value: string): readonly string[] {
  return value.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalize(vector: readonly number[]): readonly number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function cosine(left: readonly number[], right: readonly number[]): number {
  const size = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < size; index += 1) score += (left[index] ?? 0) * (right[index] ?? 0);
  return score;
}
