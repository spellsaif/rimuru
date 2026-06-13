import type { FlowBus } from "../core/events.js";
import type { RuneRegistry } from "../core/runes.js";
import type { Sovereign } from "../core/sovereign.js";
import type { Chronicle, RunResult } from "../core/types.js";
import { type Plan } from "../planner/planner.js";
export interface AgentObservation {
    readonly step: number;
    readonly thought: string;
    readonly rune?: string;
    readonly input?: unknown;
    readonly output?: unknown;
    readonly error?: string;
}
export interface AgentRunResult {
    readonly plan: Plan;
    readonly observations: readonly AgentObservation[];
    readonly final: RunResult;
}
export declare class AgentLoop {
    private readonly options;
    constructor(options: {
        readonly sovereign: Sovereign;
        readonly runes: RuneRegistry;
        readonly workspace: string;
        readonly sessionId: string;
        readonly maxSteps?: number;
        readonly audit?: boolean;
        readonly flowBus?: FlowBus;
        readonly chronicle?: Chronicle;
    });
    speculate(objective: string, childSessionId: string): Promise<AgentRunResult>;
    run(objective: string, onText?: (text: string) => void): Promise<AgentRunResult>;
    private buildFirstTurnPrompt;
}
export declare class ReActStreamParser {
    private readonly write;
    private state;
    private buffer;
    constructor(write: (text: string) => void);
    ingest(chunk: string): void;
    flush(): void;
}
