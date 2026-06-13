import type { Message, RunResult, ToolCall } from "../core/types.js";

export interface ShareGPTMessage {
  from: "system" | "human" | "gpt";
  value: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
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

export function exportTrajectory(
  sessionId: string,
  transcript: readonly Message[],
  workspace?: string,
): ShareGPTTrajectory {
  const conversations: ShareGPTMessage[] = [];
  let toolCalls = 0;
  let errors = 0;

  for (const msg of transcript) {
    const shareMsg: ShareGPTMessage = {
      from: roleToShareGPT(msg.role),
      value: msg.content,
    };

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      shareMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
      toolCalls += msg.toolCalls.length;
    }

    if (msg.role === "system" && msg.content.toLowerCase().includes("error")) {
      errors++;
    }

    conversations.push(shareMsg);
  }

  return {
    id: sessionId,
    conversations,
    metadata: {
      sessionId,
      exportedAt: new Date().toISOString(),
      runeCount: conversations.filter((c) => c.tool_calls).length,
      toolCalls,
      errors,
    },
  };
}

export function exportRunResult(
  result: RunResult,
  workspace?: string,
): ShareGPTTrajectory {
  return exportTrajectory(
    `run-${Date.now()}`,
    result.transcript,
    workspace,
  );
}

export function exportTrajectoryFromSessions(
  sessions: Map<string, readonly Message[]>,
  workspace?: string,
): ShareGPTTrajectory[] {
  return [...sessions.entries()].map(([sessionId, messages]) =>
    exportTrajectory(sessionId, messages, workspace),
  );
}

function roleToShareGPT(role: string): ShareGPTMessage["from"] {
  switch (role) {
    case "system":
      return "system";
    case "user":
      return "human";
    case "assistant":
      return "gpt";
    case "tool":
      return "human";
    default:
      return "human";
  }
}
