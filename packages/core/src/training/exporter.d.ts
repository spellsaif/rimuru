import type { Message, RunResult } from "../core/types.js";
export interface ShareGPTMessage {
    from: "system" | "human" | "gpt";
    value: string;
    tool_calls?: {
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }[];
}
export interface ShareGPTTrajectory {
    id: string;
    conversations: ShareGPTMessage[];
    metadata: {
        sessionId: string;
        exportedAt: string;
        runeCount: number;
        toolCalls: number;
        errors: number;
    };
}
export declare function exportTrajectory(sessionId: string, transcript: readonly Message[], workspace?: string): ShareGPTTrajectory;
export declare function exportRunResult(result: RunResult, workspace?: string): ShareGPTTrajectory;
export declare function exportTrajectoryFromSessions(sessions: Map<string, readonly Message[]>, workspace?: string): ShareGPTTrajectory[];
