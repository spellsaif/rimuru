import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactSecrets } from "../security/redact.js";
import type { RuneRisk } from "./types.js";

export type AuditEventType = "rune.requested" | "rune.allowed" | "rune.denied" | "rune.completed" | "rune.failed";

export interface AuditEvent {
  readonly id: string;
  readonly type: AuditEventType;
  readonly createdAt: string;
  readonly sessionId: string;
  readonly rune?: string;
  readonly risk?: RuneRisk;
  readonly reason?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: string;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "createdAt">;

export function auditLogPath(workspace: string): string {
  return join(workspace, ".rimuru", "audit.jsonl");
}

export async function appendAuditEvent(workspace: string, event: NewAuditEvent): Promise<AuditEvent | undefined> {
  const record = normalizeAuditEvent(event);
  const path = auditLogPath(workspace);
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  } catch {
    return undefined;
  }
}

export async function listAuditEvents(workspace: string, options: { readonly limit?: number } = {}): Promise<readonly AuditEvent[]> {
  try {
    const lines = (await readFile(auditLogPath(workspace), "utf8")).split("\n").filter(Boolean);
    return lines
      .slice(-(options.limit ?? 100))
      .map((line) => JSON.parse(line) as AuditEvent)
      .reverse();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function normalizeAuditEvent(event: NewAuditEvent): AuditEvent {
  return {
    id: `${Date.now()}-${randomUUID()}`,
    type: event.type,
    createdAt: new Date().toISOString(),
    sessionId: event.sessionId,
    ...(event.rune === undefined ? {} : { rune: event.rune }),
    ...(event.risk === undefined ? {} : { risk: event.risk }),
    ...(event.reason === undefined ? {} : { reason: redactSecrets(event.reason) }),
    ...(event.input === undefined ? {} : { input: redactedJsonValue(event.input) }),
    ...(event.output === undefined ? {} : { output: redactedJsonValue(event.output) }),
    ...(event.error === undefined ? {} : { error: redactSecrets(event.error) })
  };
}

function redactedJsonValue(value: unknown): unknown {
  try {
    const raw = JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item));
    if (raw === undefined) return undefined;
    return JSON.parse(redactSecrets(raw.length > 16_000 ? `${raw.slice(0, 16_000)}...` : raw)) as unknown;
  } catch {
    return redactSecrets(String(value)).slice(0, 16_000);
  }
}
