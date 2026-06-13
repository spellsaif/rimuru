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
export declare function auditLogPath(workspace: string): string;
export declare function appendAuditEvent(workspace: string, event: NewAuditEvent): Promise<AuditEvent | undefined>;
export declare function listAuditEvents(workspace: string, options?: {
    readonly limit?: number;
}): Promise<readonly AuditEvent[]>;
