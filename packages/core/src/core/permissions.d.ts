import type { PermissionDecision, PermissionPolicy, PermissionRequest, RuneRisk, Shard } from "./types.js";
export interface StaticPermissionOptions {
    readonly allow?: readonly RuneRisk[];
    readonly deny?: readonly RuneRisk[];
}
export declare class StaticPermissionPolicy implements PermissionPolicy {
    #private;
    constructor(options?: StaticPermissionOptions);
    decide(request: PermissionRequest): Promise<PermissionDecision>;
}
export declare const readOnlyPolicy: StaticPermissionPolicy;
export declare const trustedLocalPolicy: StaticPermissionPolicy;
export type ApprovalPrompt = (request: PermissionRequest) => Promise<PermissionDecision>;
export declare class ApprovalPermissionPolicy implements PermissionPolicy {
    #private;
    constructor(options: {
        readonly fallback?: PermissionPolicy;
        readonly prompt: ApprovalPrompt;
    });
    decide(request: PermissionRequest): Promise<PermissionDecision>;
}
export declare class ConsensusPermissionPolicy implements PermissionPolicy {
    #private;
    constructor(options: {
        readonly voters: readonly PermissionPolicy[];
        readonly requiredApprovals?: number;
    });
    decide(request: PermissionRequest): Promise<PermissionDecision>;
}
export declare class ModelVoterPermissionPolicy implements PermissionPolicy {
    #private;
    constructor(options: {
        readonly shard: Shard;
        readonly name?: string;
    });
    decide(request: PermissionRequest): Promise<PermissionDecision>;
}
