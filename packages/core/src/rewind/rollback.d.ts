export interface RollbackRecord {
    readonly path: string;
    readonly before: string;
    readonly after: string;
    readonly createdAt: string;
}
export interface RollbackSummary {
    readonly id: string;
    readonly path: string;
    readonly createdAt: string;
}
export declare function listRollbacks(workspace: string): Promise<readonly RollbackSummary[]>;
export declare function inspectRollback(workspace: string, id: string): Promise<RollbackRecord>;
export declare function applyRollback(workspace: string, id: string): Promise<{
    readonly path: string;
    readonly restored: boolean;
}>;
