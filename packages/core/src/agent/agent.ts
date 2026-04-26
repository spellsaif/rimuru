import type { RuneRegistry } from "../core/runes.js";
import type { Sovereign } from "../core/sovereign.js";
import type { RunResult, Flow } from "../core/types.js";
import { FlowBus } from "../core/events.js";


export interface AgentObservation {
  readonly step: number;
  readonly thought: string;
  readonly rune?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: string;
}

export interface AgentRunResult {
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
  }) {}



  /**
   * Runs a dynamic ReAct (Reason+Act) loop to solve the objective.
   */
  async run(objective: string, onText?: (text: string) => void): Promise<AgentRunResult> {
    const observations: AgentObservation[] = [];
    const maxSteps = this.options.maxSteps ?? 10;
    const runes = this.options.runes.describe().map((r) => ({ name: r.name, description: r.description, inputSchema: r.inputSchema }));

    let currentStatus = "working";

    for (let step = 1; step <= maxSteps; step++) {
      const prompt = this.buildReActPrompt(objective, observations, runes);
      
      const turn = await this.options.sovereign.run({
        prompt,
        workspace: this.options.workspace,
        sessionId: `${this.options.sessionId}:step-${step}`
      });

      const thoughtProcess = parseAction(turn.response.content);
      if (thoughtProcess?.thought) {
        this.options.flowBus?.emit({ type: "thought.emitted", thought: thoughtProcess.thought, at: new Date() });
      }
      
      if (!thoughtProcess || thoughtProcess.type === "finish") {

        currentStatus = "finished";
        break;
      }

      const { thought, rune, input } = thoughtProcess;
      let output: unknown;
      let error: string | undefined;

      try {
        if (!rune) throw new Error("No rune specified in action");
        output = await this.options.runes.invoke(rune, input, {
          workspace: this.options.workspace,
          sessionId: this.options.sessionId,
          audit: this.options.audit ?? true
        });
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

    // Final synthesis
    const final = await this.options.sovereign.run({
      prompt: `Objective: ${objective}\n\nHistory of thoughts and tool outputs:\n${JSON.stringify(observations, null, 2)}\n\nBased on the above, provide the final answer to the user.`,
      workspace: this.options.workspace,
      sessionId: this.options.sessionId,
      ...(onText ? { onText } : {})
    });

    return { observations, final };
  }

  private buildReActPrompt(objective: string, history: readonly AgentObservation[], runes: unknown[]): string {
    return [
      `You are an AI Agent working toward this objective: "${objective}"`,
      "Use the following ReAct loop format:",
      "Thought: (Reason about what to do next)",
      "Action: (The rune to call, or 'finish' if done)",
      "Input: (The JSON input for the rune)",
      "",
      `Available Runes: ${JSON.stringify(runes, null, 2)}`,
      "",
      "Past Observations:",
      history.map(o => `Step ${o.step}: Thought: ${o.thought}\nAction: ${o.rune}\nInput: ${JSON.stringify(o.input)}\nOutput: ${JSON.stringify(o.output ?? o.error)}`).join("\n---\n"),
      "",
      "Current Thought and Action:"
    ].join("\n");
  }
}

function parseAction(content: string): { type: "call" | "finish"; thought: string; rune?: string; input?: unknown } | undefined {
  const thoughtMatch = content.match(/Thought:\s*(.*)/i);
  const actionMatch = content.match(/Action:\s*(\w+)/i);
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

  return undefined;
}
