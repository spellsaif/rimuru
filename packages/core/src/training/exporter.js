export function exportTrajectory(sessionId, transcript, workspace) {
    const conversations = [];
    let toolCalls = 0;
    let errors = 0;
    for (const msg of transcript) {
        const shareMsg = {
            from: roleToShareGPT(msg.role),
            value: msg.content,
        };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
            shareMsg.tool_calls = msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
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
export function exportRunResult(result, workspace) {
    return exportTrajectory(`run-${Date.now()}`, result.transcript, workspace);
}
export function exportTrajectoryFromSessions(sessions, workspace) {
    return [...sessions.entries()].map(([sessionId, messages]) => exportTrajectory(sessionId, messages, workspace));
}
function roleToShareGPT(role) {
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
//# sourceMappingURL=exporter.js.map