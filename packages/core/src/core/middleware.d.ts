import type { Flow, PermissionPolicy, RuneMiddleware } from "./types.js";
import type { SkillRegistry } from "../skills/registry.js";
export interface AuditMiddlewareOptions {
    readonly emit?: (event: Flow) => void;
    readonly clock?: () => Date;
}
export declare function auditMiddleware(options?: AuditMiddlewareOptions): RuneMiddleware;
export interface PermissionMiddlewareOptions {
    readonly policy: PermissionPolicy;
    readonly emit?: (event: Flow) => void;
    readonly clock?: () => Date;
}
export declare function permissionMiddleware(options: PermissionMiddlewareOptions): RuneMiddleware;
export declare function isolationMiddleware(): RuneMiddleware;
export declare function skillMiddleware(skills: SkillRegistry): RuneMiddleware;
export interface StagingEntry {
    readonly id: string;
    readonly rune: string;
    readonly input: unknown;
    readonly output: unknown;
    readonly sessionId: string;
    readonly risk: string;
    readonly createdAt: string;
    approved?: boolean;
}
export interface StagingStore {
    stage(entry: StagingEntry): Promise<void>;
    pending(sessionId: string): Promise<readonly StagingEntry[]>;
    approve(id: string): Promise<void>;
    reject(id: string): Promise<void>;
}
export declare function stagingMiddleware(store: StagingStore): RuneMiddleware;
export declare function learningMiddleware(workspace: string, skills: SkillRegistry): RuneMiddleware;
