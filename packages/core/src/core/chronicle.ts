import { appendFile, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Chronicle, Message } from "./types.js";

export class MemoryChronicle implements Chronicle {
  readonly #sessions = new Map<string, Message[]>();

  async load(sessionId: string): Promise<readonly Message[]> {
    return [...(this.#sessions.get(sessionId) ?? [])];
  }

  async append(sessionId: string, messages: readonly Message[]): Promise<void> {
    const current = this.#sessions.get(sessionId) ?? [];
    this.#sessions.set(sessionId, [...current, ...messages]);
  }

  async overwrite(sessionId: string, messages: readonly Message[]): Promise<void> {
    this.#sessions.set(sessionId, [...messages]);
  }

  async delete(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
  }
}

/**
 * Enhanced JsonChronicle using an append-only JSONL format.
 * This ensures O(1) appends and prevents data loss during concurrent writes.
 */
export class JsonChronicle implements Chronicle {
  constructor(private readonly root: string) {}

  async load(sessionId: string): Promise<readonly Message[]> {
    const path = this.pathFor(sessionId);
    try {
      const raw = await readFile(path, "utf8");
      return raw.split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => deserializeMessage(JSON.parse(line)));
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async append(sessionId: string, messages: readonly Message[]): Promise<void> {
    const path = this.pathFor(sessionId);
    await mkdir(dirname(path), { recursive: true });
    
    const lines = messages.map(m => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
    await appendFile(path, lines, "utf8");
  }

  async overwrite(sessionId: string, messages: readonly Message[]): Promise<void> {
    const path = this.pathFor(sessionId);
    await mkdir(dirname(path), { recursive: true });
    
    const content = messages.map(m => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
    await writeFile(path, content, "utf8");
  }

  async delete(sessionId: string): Promise<void> {
    const path = this.pathFor(sessionId);
    try {
      await rm(path, { force: true });
    } catch {}
  }

  async listSessions(): Promise<readonly string[]> {
    try {
      const entries = await readdir(this.root);
      return entries.filter((entry) => entry.endsWith(".jsonl")).map((entry) => entry.slice(0, -6)).sort();
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async summarize(sessionId: string): Promise<string> {
    const messages = await this.load(sessionId);
    if (messages.length === 0) return "No messages recorded.";
    const first = messages[0]!;
    const last = messages[messages.length - 1]!;
    return `${messages.length} messages. First ${first.role}: ${first.content.slice(0, 120)}. Last ${last.role}: ${last.content.slice(0, 120)}.`;
  }

  async compact(sessionId: string, keepLast = 20): Promise<void> {
    const messages = await this.load(sessionId);
    if (messages.length <= keepLast) return;
    
    const summary: Message = { 
      role: "system", 
      content: `Chronicle compacted at ${new Date().toISOString()}. Previous state: ${await this.summarize(sessionId)}`, 
      createdAt: new Date() 
    };
    
    const path = this.pathFor(sessionId);
    const content = [summary, ...messages.slice(-keepLast)].map(m => JSON.stringify(serializeMessage(m))).join("\n") + "\n";
    await writeFile(path, content, "utf8");
  }

  private pathFor(sessionId: string): string {
    const safeSession = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.root, `${safeSession}.jsonl`);
  }
}

interface SerializedMessage {
  readonly role: Message["role"];
  readonly content: string;
  readonly name?: string;
  readonly createdAt: string;
}

function serializeMessage(message: Message): SerializedMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.name === undefined ? {} : { name: message.name }),
    createdAt: message.createdAt.toISOString()
  };
}

function deserializeMessage(message: SerializedMessage): Message {
  return {
    role: message.role,
    content: message.content,
    ...(message.name === undefined ? {} : { name: message.name }),
    createdAt: new Date(message.createdAt)
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
