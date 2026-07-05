import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Chronicle, Message } from "./types.js";

export interface RecallOptions {
  readonly query: string;
  readonly budget?: number;
  readonly sessionId?: string;
}

export interface RecallResult {
  readonly messages: readonly Message[];
  readonly fromTier: string;
  readonly score: number;
}

export interface ColdStore {
  readonly name: string;
  store(entry: ColdEntry): Promise<void>;
  search(query: string, options: { readonly sessionId?: string; readonly limit?: number }): Promise<ColdSearchResult[]>;
  compact(sessionId: string): Promise<void>;
}

export interface ColdEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly text: string;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly embedding: readonly number[];
  readonly createdAt: string;
}

export interface ColdSearchResult {
  readonly entry: ColdEntry;
  readonly score: number;
}

export interface CrystalEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly topic: string;
  readonly summary: string;
  readonly sourceTurns: number;
  readonly tokenCount: number;
  readonly signedBy?: string;
  readonly signature?: string;
  readonly createdAt: string;
}

export interface CrystalStore {
  save(entry: CrystalEntry): Promise<void>;
  findByTopic(sessionId: string, topic: string): Promise<CrystalEntry | undefined>;
  list(sessionId: string): Promise<readonly CrystalEntry[]>;
}

export interface Embedder {
  embed(text: string): Promise<readonly number[]>;
}

const RING_BUFFER_DEFAULT = 50;
const CRYSTAL_DIR = "crystal";

export class HotTier {
  readonly #buffer: Message[] = [];
  readonly #capacity: number;

  constructor(capacity = RING_BUFFER_DEFAULT) {
    this.#capacity = capacity;
  }

  append(messages: readonly Message[]): void {
    for (const message of messages) {
      if (this.#buffer.length >= this.#capacity) {
        this.#buffer.shift();
      }
      this.#buffer.push(message);
    }
  }

  load(): readonly Message[] {
    return [...this.#buffer];
  }

  clear(): void {
    this.#buffer.length = 0;
  }

  get size(): number {
    return this.#buffer.length;
  }
}

export class WarmTier implements Chronicle {
  readonly #inner: Chronicle;

  constructor(inner: Chronicle) {
    this.#inner = inner;
  }

  async load(sessionId: string): Promise<readonly Message[]> {
    return this.#inner.load(sessionId);
  }

  async append(sessionId: string, messages: readonly Message[]): Promise<void> {
    return this.#inner.append(sessionId, messages);
  }

  async overwrite(sessionId: string, messages: readonly Message[]): Promise<void> {
    if (this.#inner.overwrite) {
      return this.#inner.overwrite(sessionId, messages);
    }
    throw new Error("overwrite not supported");
  }

  async delete(sessionId: string): Promise<void> {
    if (this.#inner.delete) {
      return this.#inner.delete(sessionId);
    }
    throw new Error("delete not supported");
  }
}

export class JsonColdStore implements ColdStore {
  readonly name = "json-cold";
  readonly #path: string;

  constructor(root: string) {
    this.#path = join(root, "cold-memory.json");
  }

  async store(entry: ColdEntry): Promise<void> {
    const existing = await this.#all();
    const map = new Map(existing.map((e) => [e.id, e]));
    map.set(entry.id, entry);
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(
      this.#path,
      `${JSON.stringify([...map.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`,
      "utf8",
    );
  }

  async search(
    query: string,
    options: { readonly sessionId?: string; readonly limit?: number },
  ): Promise<ColdSearchResult[]> {
    const limit = options.limit ?? 8;
    const all = await this.#all();
    const queryEmb = await this.#embed(query);
    return all
      .filter((e) => !options.sessionId || e.sessionId === options.sessionId)
      .map((e) => ({ entry: e, score: cosine(queryEmb, e.embedding) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async compact(sessionId: string): Promise<void> {
    const all = await this.#all();
    const sessionEntries = all.filter((e) => e.sessionId === sessionId);
    if (sessionEntries.length <= 100) return;
    const keep = sessionEntries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    const keepIds = new Set(keep.map((e) => e.id));
    const filtered = all.filter((e) => e.sessionId !== sessionId || keepIds.has(e.id));
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, `${JSON.stringify(filtered.sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`, "utf8");
  }

  async #all(): Promise<ColdEntry[]> {
    try {
      return JSON.parse(await readFile(this.#path, "utf8")) as ColdEntry[];
    } catch {
      return [];
    }
  }

  async #embed(text: string): Promise<readonly number[]> {
    const dimensions = 64;
    const vector = Array.from({ length: dimensions }, () => 0);
    const terms = text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
    for (const term of terms) {
      const index = fnv1a(term) % dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }
}

function fnv1a(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  const size = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < size; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class JsonCrystalStore implements CrystalStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root, CRYSTAL_DIR);
  }

  async save(entry: CrystalEntry): Promise<void> {
    const dir = join(this.#root, entry.sessionId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${entry.topic.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
    await writeFile(path, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  }

  async findByTopic(sessionId: string, topic: string): Promise<CrystalEntry | undefined> {
    const path = join(this.#root, sessionId, `${topic.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as CrystalEntry;
    } catch {
      return undefined;
    }
  }

  async list(sessionId: string): Promise<readonly CrystalEntry[]> {
    const dir = join(this.#root, sessionId);
    try {
      const entries = await readdir(dir);
      const results: CrystalEntry[] = [];
      for (const entry of entries) {
        if (entry.endsWith(".json")) {
          try {
            const raw = await readFile(join(dir, entry), "utf8");
            results.push(JSON.parse(raw) as CrystalEntry);
          } catch {}
        }
      }
      return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  }
}

export interface ReflectiveChronicleOptions {
  readonly warm: Chronicle;
  readonly cold?: ColdStore;
  readonly crystal?: CrystalStore;
  readonly embedder?: Embedder;
  readonly hotCapacity?: number;
  readonly clock?: () => Date;
}

export class ReflectiveChronicle implements Chronicle {
  readonly #hot: HotTier;
  readonly #warm: WarmTier;
  readonly #cold: ColdStore;
  readonly #crystal: CrystalStore;
  readonly #embedder: Embedder;
  readonly #clock: () => Date;

  constructor(options: ReflectiveChronicleOptions) {
    this.#hot = new HotTier(options.hotCapacity);
    this.#warm = new WarmTier(options.warm);
    this.#cold = options.cold ?? new JsonColdStore(resolve(".rimuru"));
    this.#crystal = options.crystal ?? new JsonCrystalStore(resolve(".rimuru"));
    this.#embedder = options.embedder ?? defaultEmbedder();
    this.#clock = options.clock ?? (() => new Date());
  }

  async load(sessionId: string): Promise<readonly Message[]> {
    const hot = this.#hot.load();
    const warm = await this.#warm.load(sessionId);
    if (hot.length === 0) return warm;
    const hotStart = hot[0]?.createdAt.getTime() ?? 0;
    const warmFiltered = warm.filter((m) => m.createdAt.getTime() < hotStart);
    return [...warmFiltered, ...hot];
  }

  async append(sessionId: string, messages: readonly Message[]): Promise<void> {
    this.#hot.append(messages);
    await this.#warm.append(sessionId, messages);
    await this.#indexCold(sessionId, messages);
  }

  async overwrite(sessionId: string, messages: readonly Message[]): Promise<void> {
    this.#hot.clear();
    await this.#warm.overwrite(sessionId, messages);
  }

  async delete(sessionId: string): Promise<void> {
    this.#hot.clear();
    await this.#warm.delete(sessionId);
  }

  async recall(query: string, options?: { readonly budget?: number; readonly sessionId?: string }): Promise<readonly Message[]> {
    const budget = options?.budget ?? 4000;
    const messages: Message[] = [];

    const hot = this.#hot.load();
    const hotTokens = estimateTokens(hot);
    if (hotTokens <= budget) {
      messages.push(...hot);
    }

    const warm = await this.#warm.load(options?.sessionId ?? "default");
    const warmTokens = estimateTokens(warm);
    if (warmTokens + estimateTokens(messages) <= budget) {
      messages.push(...warm);
    }

    const budgetRemaining = budget - estimateTokens(messages);
    if (budgetRemaining > 0) {
      const coldResults = await this.#cold.search(query, {
        sessionId: options?.sessionId,
        limit: Math.max(1, Math.floor(budgetRemaining / 200)),
      });
      for (const result of coldResults) {
        messages.push({
          role: "system",
          content: `[Cold Memory: ${result.entry.summary}] ${result.entry.text}`,
          createdAt: new Date(result.entry.createdAt),
        });
      }
    }

    const crystals = await this.#crystal.list(options?.sessionId ?? "default");
    for (const crystal of crystals) {
      if (estimateTokens(messages) >= budget) break;
      messages.push({
        role: "system",
        content: `[Crystal: ${crystal.topic}] ${crystal.summary}`,
        createdAt: new Date(crystal.createdAt),
      });
    }

    return messages.slice(0, estimateMaxMessages(budget));
  }

  async reflect(
    sessionId: string,
    summarizer: (messages: readonly Message[]) => Promise<{ topic: string; summary: string }>,
  ): Promise<CrystalEntry | undefined> {
    const hotMessages = this.#hot.load();
    if (hotMessages.length < 3) return undefined;

    const result = await summarizer(hotMessages);
    const crystalEntry: CrystalEntry = {
      id: `${sessionId}:crystal:${this.#clock().toISOString()}`,
      sessionId,
      topic: result.topic,
      summary: result.summary,
      sourceTurns: hotMessages.length,
      tokenCount: estimateTokens(hotMessages),
      createdAt: this.#clock().toISOString(),
    };

    await this.#crystal.save(crystalEntry);
    return crystalEntry;
  }

  async #indexCold(sessionId: string, messages: readonly Message[]): Promise<void> {
    for (const message of messages) {
      if (!message.content.trim()) continue;
      const text = `${message.role}: ${message.content}`;
      const embedding = await this.#embedder.embed(text);
      await this.#cold.store({
        id: `${sessionId}:cold:${this.#clock().toISOString()}:${hash(text).toString(16)}`,
        sessionId,
        text,
        summary: summarize(text),
        metadata: { role: message.role },
        embedding,
        createdAt: message.createdAt.toISOString(),
      });
    }
  }

  coldTier(): ColdStore {
    return this.#cold;
  }

  crystalTier(): CrystalStore {
    return this.#crystal;
  }

  hotTier(): HotTier {
    return this.#hot;
  }
}

function estimateTokens(messages: readonly Message[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 10, 0);
}

function estimateMaxMessages(budget: number): number {
  return Math.max(1, Math.floor(budget / 20));
}

function summarize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function hash(value: string): number {
  return fnv1a(value);
}

export function createReflectiveChronicle(options: {
  readonly warm: Chronicle;
  readonly cold?: ColdStore;
  readonly crystal?: CrystalStore;
  readonly root?: string;
  readonly hotCapacity?: number;
}): ReflectiveChronicle {
  return new ReflectiveChronicle({
    warm: options.warm,
    cold: options.cold ?? new JsonColdStore(options.root ?? resolve(".rimuru")),
    crystal: options.crystal ?? new JsonCrystalStore(options.root ?? resolve(".rimuru")),
    hotCapacity: options.hotCapacity,
  });
}

function defaultEmbedder(): Embedder {
  return {
    async embed(text: string): Promise<readonly number[]> {
      const dimensions = 64;
      const vector = Array.from({ length: dimensions }, () => 0);
      const terms = text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
      for (const term of terms) {
        const index = fnv1a(term) % dimensions;
        vector[index] = (vector[index] ?? 0) + 1;
      }
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      if (magnitude === 0) return vector;
      return vector.map((v) => v / magnitude);
    },
  };
}
