import { planObjective } from "../planner/planner.js";
import { createWorkspaceBranch } from "../security/branch.js";
export class AgentLoop {
    options;
    constructor(options) {
        this.options = options;
    }
    async speculate(objective, childSessionId) {
        const branchDir = await createWorkspaceBranch(this.options.workspace, childSessionId);
        if (this.options.chronicle) {
            const parentHistory = await this.options.chronicle.load(this.options.sessionId);
            if (this.options.chronicle.overwrite) {
                await this.options.chronicle.overwrite(childSessionId, parentHistory);
            }
            else {
                await this.options.chronicle.append(childSessionId, parentHistory);
            }
        }
        const childLoop = new AgentLoop({
            ...this.options,
            workspace: branchDir,
            sessionId: childSessionId,
        });
        return await childLoop.run(objective);
    }
    async run(objective, onText) {
        const observations = [];
        const maxSteps = this.options.maxSteps ?? 10;
        const runes = this.options.runes
            .describe()
            .map((r) => ({ name: r.name, description: r.description, inputSchema: r.inputSchema }));
        const chronicle = this.options.chronicle;
        if (chronicle && typeof chronicle.compact === "function") {
            const messages = await chronicle.load(this.options.sessionId);
            const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
            if (estimatedTokens > 80_000) {
                await chronicle.compact(this.options.sessionId);
            }
        }
        let lastToolCall;
        let lastTurn;
        for (let step = 1; step <= maxSteps; step++) {
            const parser = onText ? new ReActStreamParser(onText) : undefined;
            const turnRequest = {
                workspace: this.options.workspace,
                sessionId: this.options.sessionId,
                tools: runes,
                ...(parser ? { onText: (chunk) => parser.ingest(chunk) } : {}),
            };
            if (step === 1) {
                turnRequest.prompt = this.buildFirstTurnPrompt(objective, runes);
            }
            else if (lastToolCall) {
                const prev = observations[observations.length - 1];
                const content = typeof prev.output === "string" ? prev.output : JSON.stringify(prev.output ?? prev.error);
                turnRequest.promptMessage = {
                    role: "tool",
                    name: lastToolCall.name,
                    toolCallId: lastToolCall.id,
                    content,
                    createdAt: new Date(),
                };
            }
            else {
                const prev = observations[observations.length - 1];
                turnRequest.prompt = `Observation: ${JSON.stringify(prev.output ?? prev.error)}`;
            }
            const turn = await this.options.sovereign.run(turnRequest);
            lastTurn = turn;
            if (parser) {
                parser.flush();
            }
            let thoughtProcess;
            lastToolCall = undefined;
            if (turn.response.toolCalls && turn.response.toolCalls.length > 0) {
                const tc = turn.response.toolCalls[0];
                lastToolCall = { id: tc.id, name: tc.name };
                if (tc.name === "finish") {
                    thoughtProcess = { type: "finish", thought: turn.response.content || "Finished task" };
                }
                else {
                    thoughtProcess = {
                        type: "call",
                        thought: turn.response.content || `Calling tool ${tc.name}`,
                        rune: tc.name,
                        input: tc.arguments,
                    };
                }
            }
            else {
                thoughtProcess = parseAction(turn.response.content);
            }
            if (thoughtProcess?.thought) {
                this.options.flowBus?.emit({ type: "thought.emitted", thought: thoughtProcess.thought, at: new Date() });
            }
            if (!thoughtProcess) {
                const errorMsg = "Format Error: Your response did not follow the ReAct loop format. You must start with 'Thought: <reasoning>', followed by 'Action: <rune_name_or_finish>', and then 'Input: <json_input>' on the next lines. Please correct your formatting.";
                observations.push({
                    step,
                    thought: "Formatting parse failed",
                    error: errorMsg,
                });
                if (onText && !parser) {
                    onText(`\x1b[31mParse Error: Invalid ReAct response format.\x1b[0m\n`);
                }
                continue;
            }
            if (thoughtProcess.type === "finish") {
                break;
            }
            const { thought, rune, input } = thoughtProcess;
            let output;
            let error;
            try {
                if (!rune)
                    throw new Error("No rune specified in action");
                output = await this.options.runes.invoke(rune, input, {
                    workspace: this.options.workspace,
                    sessionId: this.options.sessionId,
                    audit: this.options.audit ?? true,
                    sovereign: this.options.sovereign,
                    chronicle: this.options.chronicle,
                });
            }
            catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            observations.push({
                step,
                thought,
                rune,
                input,
                output,
                error,
            });
            if (onText && !parser) {
                onText(`\x1b[90mThought: ${thought}\x1b[0m\n`);
                if (rune)
                    onText(`\x1b[36mInvoke: ${rune}\x1b[0m\n`);
            }
        }
        const plan = planObjective(objective);
        let final;
        if (observations.length === 0 && lastTurn) {
            final = lastTurn;
        }
        else {
            final = await this.options.sovereign.run({
                prompt: `Objective: ${objective}\n\nBased on the execution history, provide the final conversational answer to the user. Do NOT use the ReAct format (Thought/Action/Input) here; respond directly to the user.`,
                workspace: this.options.workspace,
                sessionId: this.options.sessionId,
                ...(onText ? { onText } : {}),
            });
        }
        return { plan, observations, final };
    }
    buildFirstTurnPrompt(objective, runes) {
        return [
            `You are an AI Agent working toward this objective: "${objective}"`,
            "If the objective is a simple greeting, conversational reply, or question that can be answered directly without executing any runes, respond directly to the user.",
            "Otherwise, you can execute the available Runes. If your environment supports native function/tool calling, execute the tools directly using the tool calling schema. Ensure you explain your reasoning in your message content alongside or before calling the tool.",
            "If native tool calling is not supported or fails, you MUST fall back to using the text-based ReAct loop format below:",
            "Thought: (Reason about what to do next)",
            "Action: (The rune to call, or 'finish' if done)",
            "Input: (The JSON input for the rune)",
            "",
            `Available Runes: ${JSON.stringify(runes, null, 2)}`,
            "",
            "Please output your reasoning, call the appropriate tool natively, or fall back to the text-based ReAct format.",
        ].join("\n");
    }
}
function parseAction(content) {
    const thoughtMatch = content.match(/Thought:\s*(.*)/i);
    const actionMatch = content.match(/Action:\s*([a-zA-Z0-9._-]+)/i);
    const inputMatch = content.match(/Input:\s*(\{[\s\S]*\})/);
    const thought = thoughtMatch?.[1] ?? "Continuing work";
    const action = actionMatch?.[1]?.toLowerCase();
    if (action === "finish")
        return { type: "finish", thought };
    if (action && inputMatch) {
        try {
            const input = JSON.parse(inputMatch[1]);
            return { type: "call", thought, rune: action, input };
        }
        catch {
            return { type: "call", thought, rune: action, input: {} };
        }
    }
    if (content && !content.includes("Action:")) {
        return { type: "finish", thought: content };
    }
    return undefined;
}
export class ReActStreamParser {
    write;
    state = "none";
    buffer = "";
    constructor(write) {
        this.write = write;
    }
    ingest(chunk) {
        this.buffer += chunk;
        while (true) {
            const prevState = this.state;
            const prevBufferLen = this.buffer.length;
            if (this.state === "none") {
                const match = this.buffer.match(/thought:\s*/i);
                if (match) {
                    this.state = "thought";
                    this.write("\x1b[90m🧠 ");
                    const remaining = this.buffer.slice(match.index + match[0].length);
                    this.buffer = remaining;
                }
                else {
                    const thoughtPrefix = "thought:";
                    const trimmed = this.buffer.trim().toLowerCase();
                    const isPrefix = thoughtPrefix.startsWith(trimmed) || trimmed === "";
                    if (isPrefix && this.buffer.length <= 20) {
                        break;
                    }
                    else {
                        this.state = "direct";
                        this.write(this.buffer);
                        this.buffer = "";
                    }
                }
            }
            else if (this.state === "thought") {
                const match = this.buffer.match(/\r?\n\s*action:\s*/i);
                if (match) {
                    const textBefore = this.buffer.slice(0, match.index);
                    if (textBefore) {
                        this.write(textBefore);
                    }
                    this.write("\x1b[0m\n");
                    this.state = "action";
                    const remaining = this.buffer.slice(match.index + match[0].length);
                    this.buffer = remaining;
                }
                else {
                    const prefixLen = getPotentialActionPrefixLength(this.buffer);
                    if (prefixLen > 0) {
                        const safeLen = this.buffer.length - prefixLen;
                        if (safeLen > 0) {
                            const safeText = this.buffer.slice(0, safeLen);
                            this.write(safeText);
                            this.buffer = this.buffer.slice(safeLen);
                        }
                        break;
                    }
                    else {
                        this.write(this.buffer);
                        this.buffer = "";
                        break;
                    }
                }
            }
            else if (this.state === "action") {
                const indexN = this.buffer.indexOf("\n");
                const indexR = this.buffer.indexOf("\r");
                const firstNewline = indexN !== -1 && indexR !== -1 ? Math.min(indexN, indexR) : indexN !== -1 ? indexN : indexR;
                if (firstNewline !== -1) {
                    const runeName = this.buffer.slice(0, firstNewline).trim();
                    if (runeName && runeName.toLowerCase() !== "finish") {
                        this.write(`\x1b[36m⚡ Running ${runeName}...\x1b[0m\n`);
                    }
                    this.state = "input";
                    const remaining = this.buffer.slice(firstNewline + 1);
                    this.buffer = remaining;
                }
                else {
                    break;
                }
            }
            else if (this.state === "input") {
                this.buffer = "";
                break;
            }
            else if (this.state === "direct") {
                this.write(this.buffer);
                this.buffer = "";
                break;
            }
            if (this.state === prevState && this.buffer.length === prevBufferLen) {
                break;
            }
        }
    }
    flush() {
        if (this.state === "none" || this.state === "direct") {
            if (this.buffer) {
                this.write(this.buffer);
            }
        }
        else if (this.state === "thought") {
            if (this.buffer) {
                this.write(this.buffer);
            }
            this.write("\x1b[0m\n");
        }
        else if (this.state === "action") {
            const runeName = this.buffer.trim();
            if (runeName && runeName.toLowerCase() !== "finish") {
                this.write(`\x1b[36m⚡ Running ${runeName}...\x1b[0m\n`);
            }
        }
        this.buffer = "";
    }
}
function getPotentialActionPrefixLength(str) {
    const lastN = str.lastIndexOf("\n");
    const lastR = str.lastIndexOf("\r");
    const lastIndex = Math.max(lastN, lastR);
    if (lastIndex === -1) {
        if (str.endsWith("\r")) {
            return 1;
        }
        return 0;
    }
    const suffix = str.slice(lastIndex);
    const normalized = suffix.replace(/^[\r\n]\s*/, "");
    if (normalized === "") {
        return suffix.length;
    }
    if ("action:".startsWith(normalized.toLowerCase())) {
        return suffix.length;
    }
    return 0;
}
//# sourceMappingURL=agent.js.map