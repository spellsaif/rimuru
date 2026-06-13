import { type AgentRunResult } from "../agent/agent.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { JsonChronicle } from "../core/chronicle.js";
import { FlowBus } from "../core/events.js";
import { RuneRegistry } from "../core/runes.js";
import { Sovereign } from "../core/sovereign.js";
import { JsonTraceStore } from "../core/trace.js";
import type { PermissionDecision, PermissionRequest, RunResult, RuneRisk } from "../core/types.js";
import { discoverSandboxedRunes } from "./discovery.js";
export { discoverSandboxedRunes };
export interface RuntimePaths {
    readonly workspace: string;
    readonly memoryDir: string;
    readonly rimuruDir: string;
    readonly traceDir: string;
    readonly pluginDir: string;
}
export interface RuntimeServices {
    readonly paths: RuntimePaths;
    readonly flowBus: FlowBus;
    readonly chronicle: JsonChronicle;
    readonly traceStore: JsonTraceStore;
    readonly runes: RuneRegistry;
    readonly sovereign: Sovereign;
}
export interface CreateRuntimeOptions {
    readonly config: RuntimeConfig;
    readonly workspace: string;
    readonly flowBus?: FlowBus;
    readonly approvals?: boolean;
    readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
    readonly systemPrompt?: string;
}
export interface ChatTurnOptions {
    readonly config: RuntimeConfig;
    readonly workspace: string;
    readonly prompt: string;
    readonly sessionId?: string;
    readonly flowBus?: FlowBus;
    readonly trace?: boolean;
    readonly onText?: (text: string) => void;
}
export interface AgentTurnOptions {
    readonly config: RuntimeConfig;
    readonly workspace: string;
    readonly objective: string;
    readonly sessionId?: string;
    readonly flowBus?: FlowBus;
    readonly approvals?: boolean;
    readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
    readonly trace?: boolean;
    readonly onText?: (text: string) => void;
    readonly systemPrompt?: string;
}
export declare function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeServices>;
export declare function createRuntimeRuneRegistry(options: {
    readonly workspace: string;
    readonly allowedRisks: readonly RuneRisk[];
    readonly flowBus?: FlowBus;
    readonly approvals?: boolean;
    readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
}): Promise<RuneRegistry>;
export declare function runAgentTurn(options: AgentTurnOptions): Promise<AgentRunResult>;
export declare function runChatTurn(options: ChatTurnOptions): Promise<RunResult>;
export declare function runtimePaths(config: RuntimeConfig, workspace: string): RuntimePaths;
export declare function isRisk(value: string): value is RuneRisk;
