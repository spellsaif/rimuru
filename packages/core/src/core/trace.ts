import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Flow, Message } from "./types.js";
import { redactSecrets } from "../security/redact.js";

export interface TraceRecord {
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly messages: readonly Message[];
  readonly events: readonly Flow[];
}

export class JsonTraceStore {
  constructor(private readonly root: string) {}

  async save(record: TraceRecord): Promise<string> {
    const file = join(this.root, `${safeName(record.sessionId)}-${record.createdAt.getTime()}.json`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(serializeTrace(record), null, 2), "utf8");
    return file;
  }

  async list(): Promise<readonly string[]> {
    try {
      return (await readdir(this.root)).filter((entry) => entry.endsWith(".json")).sort();
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  async inspect(name: string): Promise<unknown> {
    return JSON.parse(await readFile(join(this.root, safeName(name).endsWith(".json") ? safeName(name) : `${safeName(name)}.json`), "utf8")) as unknown;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function serializeTrace(record: TraceRecord): unknown {
  return {
    sessionId: record.sessionId,
    createdAt: record.createdAt.toISOString(),
    messages: record.messages.map((message) => ({
      ...message,
      content: redactSecrets(message.content),
      createdAt: message.createdAt.toISOString()
    })),
    events: record.events.map((event) => ({ ...event, at: event.at.toISOString() }))
  };
}
