import type { RuneRegistry } from "../core/runes.js";
import type { Sovereign } from "../core/sovereign.js";
import type { RunResult, Flow, Chronicle, Message } from "../core/types.js";
import { FlowBus } from "../core/events.js";
import { planObjective, type Plan } from "../planner/planner.js";
import { createWorkspaceBranch, deleteWorkspaceBranch, mergeWorkspaceBranch } from "../security/branch.js";


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

export class AgentLoop {
  constructor(private readonly options: { 
    readonly sovereign: Sovereign; 
    readonly runes: RuneRegistry; 
    readonly workspace: string;
    readonly sessionId: string;
    readonly maxSteps?: number;
    readonly audit?: boolean;
    readonly flowBus?: FlowBus;
    readonly chronicle?: Chronicle;
  }) {}



  /**
   * Runs a dynamic ReAct (Reason+Act) loop to solve the objective.
   */
  async run(objective: string, onText?: (text: string) => void): Promise<AgentRunResult> {
    const startingHistory = this.options.chronicle ? await this.options.chronicle.load(this.options.sessionId) : [];
    const observations: AgentObservation[] = [];
    const maxSteps = this.options.maxSteps ?? 10;
    const runes = this.options.runes.describe().map((r) => ({ name: r.name, description: r.description, inputSchema: r.inputSchema }));

    let currentStatus = "working";

    let lastToolCall: { id: string; name: string } | undefined;

    for (let step = 1; step <= maxSteps; step++) {
      let turnRequest: any;
      if (step === 1) {
        turnRequest = {
          prompt: this.buildFirstTurnPrompt(objective, runes),
          workspace: this.options.workspace,
          sessionId: this.options.sessionId,
          tools: runes
        };
      } else if (lastToolCall) {
        const prev = observations[observations.length - 1]!;
        const content = typeof prev.output === "string" ? prev.output : JSON.stringify(prev.output ?? prev.error);
        turnRequest = {
          promptMessage: {
            role: "tool",
            name: lastToolCall.name,
            toolCallId: lastToolCall.id,
            content,
            createdAt: new Date()
          },
          workspace: this.options.workspace,
          sessionId: this.options.sessionId,
          tools: runes
        };
      } else {
        const prev = observations[observations.length - 1]!;
        turnRequest = {
          prompt: `Observation: ${JSON.stringify(prev.output ?? prev.error)}`,
          workspace: this.options.workspace,
          sessionId: this.options.sessionId,
          tools: runes
        };
      }
      
      const turn = await this.options.sovereign.run(turnRequest);

      let thoughtProcess: { type: "call" | "finish"; thought: string; rune?: string; input?: unknown } | undefined;
      lastToolCall = undefined;

      if (turn.response.toolCalls && turn.response.toolCalls.length > 0) {
        const tc = turn.response.toolCalls[0]!;
        lastToolCall = { id: tc.id, name: tc.name };
        if (tc.name === "finish") {
          thoughtProcess = { type: "finish", thought: turn.response.content || "Finished task" };
        } else {
          thoughtProcess = {
            type: "call",
            thought: turn.response.content || `Calling tool ${tc.name}`,
            rune: tc.name,
            input: tc.arguments
          };
        }
      } else {
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
          error: errorMsg
        });
        if (onText) {
          onText(`\x1b[31mParse Error: Invalid ReAct response format.\x1b[0m\n`);
        }
        continue;
      }

      if (thoughtProcess.type === "finish") {
        currentStatus = "finished";
        break;
      }

      const { thought, rune, input } = thoughtProcess;
      let output: unknown;
      let error: string | undefined;

      const runeMeta = this.options.runes.describe().find((r) => r.name === rune);
      const isMutative = runeMeta && (runeMeta.risk === "write" || runeMeta.risk === "execute");

      try {
        if (!rune) throw new Error("No rune specified in action");

        if (isMutative) {
          const branchId = `${this.options.sessionId}-step-${step}`;
          const branchDir = await createWorkspaceBranch(this.options.workspace, branchId);
          try {
            output = await this.options.runes.invoke(rune, input, {
              workspace: branchDir,
              sessionId: this.options.sessionId,
              audit: this.options.audit ?? true
            });
            await mergeWorkspaceBranch(this.options.workspace, branchId);
          } finally {
            await deleteWorkspaceBranch(this.options.workspace, branchId);
          }
        } else {
          output = await this.options.runes.invoke(rune, input, {
            workspace: this.options.workspace,
            sessionId: this.options.sessionId,
            audit: this.options.audit ?? true
          });
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      observations.push({
        step,
        thought,
        rune,
        input,
        output,
        error
      });

      if (onText) {
        onText(`\x1b[90mThought: ${thought}\x1b[0m\n`);
        if (rune) onText(`\x1b[36mInvoke: ${rune}\x1b[0m\n`);
      }
    }

    const plan = planObjective(objective);

    // Final synthesis
    const final = await this.options.sovereign.run({
      prompt: `Objective: ${objective}\n\nBased on the execution history, provide the final conversational answer to the user. Do NOT use the ReAct format (Thought/Action/Input) here; respond directly to the user.`,
      workspace: this.options.workspace,
      sessionId: this.options.sessionId,
      ...(onText ? { onText } : {})
    });

    if (this.options.chronicle && this.options.chronicle.overwrite) {
      const userObjectiveMessage: Message = {
        role: "user",
        content: objective,
        createdAt: new Date()
      };
      const finalAssistantMessage: Message = {
        role: "assistant",
        content: final.response.content,
        createdAt: new Date()
      };
      await this.options.chronicle.overwrite(this.options.sessionId, [
        ...startingHistory,
        userObjectiveMessage,
        finalAssistantMessage
      ]);
    }

    return { plan, observations, final };
  }

  private buildFirstTurnPrompt(objective: string, runes: unknown[]): string {
    return [
      `You are an AI Agent working toward this objective: "${objective}"`,
      "Use the following ReAct loop format:",
      "Thought: (Reason about what to do next)",
      "Action: (The rune to call, or 'finish' if done)",
      "Input: (The JSON input for the rune)",
      "",
      `Available Runes: ${JSON.stringify(runes, null, 2)}`,
      "",
      "Please output your first Thought, Action, and Input."
    ].join("\n");
  }
}

function parseAction(content: string): { type: "call" | "finish"; thought: string; rune?: string; input?: unknown } | undefined {
  const thoughtMatch = content.match(/Thought:\s*(.*)/i);
  const actionMatch = content.match(/Action:\s*([a-zA-Z0-9._-]+)/i);
  const inputMatch = content.match(/Input:\s*(\{[\s\S]*\})/);

  const thought = thoughtMatch?.[1] ?? "Continuing work";
  const action = actionMatch?.[1]?.toLowerCase();

  if (action === "finish") return { type: "finish", thought };
  
  if (action && inputMatch) {
    try {
      const input = JSON.parse(inputMatch[1]);
      return { type: "call", thought, rune: action, input };
    } catch {
      return { type: "call", thought, rune: action, input: {} };
    }
  }

  // Fallback: If no Action header is present but we have response content,
  // treat it as the final answer/finish.
  if (content && !content.includes("Action:")) {
    return { type: "finish", thought: content };
  }

  return undefined;
}
