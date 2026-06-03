import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Flow, FlowBus, Sovereign, JsonChronicle, JsonTraceStore, AgentLoop, RuneRegistry } from "@rimuru/core";

export interface TuiState {
  readonly sessionId: string;
  readonly workspace: string;
  readonly provider: string;
  readonly model: string;
}

export interface InteractiveTuiOptions {
  readonly sovereign: Sovereign;
  readonly runes: RuneRegistry;
  readonly flowBus: FlowBus;
  readonly chronicle: JsonChronicle;
  readonly traceStore: JsonTraceStore;
  readonly workspace: string;
  readonly sessionId: string;
  readonly provider: string;
  readonly model: string;
}

export async function runInteractiveTui(options: InteractiveTuiOptions): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log(`\n\x1b[35m\x1b[1m🌌 RIMURU SOVEREIGN TERMINAL\x1b[0m`);
  console.log(`\x1b[90mSession:\x1b[0m ${options.sessionId} \x1b[90m|\x1b[0m \x1b[90mModel:\x1b[0m ${options.model} (${options.provider})`);
  console.log(`\x1b[90mWorkspace:\x1b[0m ${options.workspace}`);
  console.log(`\x1b[90m──────────────────────────────────────────────────\x1b[0m\n`);

  try {
    while (true) {
      const prompt = await rl.question(`\x1b[32m\x1b[1m❯ YOU:\x1b[0m `);
      const trimmed = prompt.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log(`\n\x1b[35mSession closed.\x1b[0m`);
        break;
      }

      console.log(); // New line before response starts

      const loop = new AgentLoop({
        sovereign: options.sovereign,
        runes: options.runes,
        workspace: options.workspace,
        sessionId: options.sessionId,
        flowBus: options.flowBus,
        audit: true,
        chronicle: options.chronicle
      });

      // Listen to FlowBus events for live execution feedback
      const unlisten = options.flowBus.listen((event: Flow) => {
        if (event.type === "rune.completed") {
          console.log(`\x1b[32m✓ ${event.rune} completed.\x1b[0m`);
        } else if (event.type === "rune.failed") {
          console.log(`\x1b[31m✗ ${event.rune} failed.\x1b[0m`);
        } else if (event.type === "rune.denied") {
          console.log(`\x1b[31m🚨 ${event.rune} denied: ${event.reason}\x1b[0m`);
        }
      });

      let isFirstText = true;
      try {
        await loop.run(trimmed, (text) => {
          // Strip ANSI from text to inspect content
          const clean = text.replace(/\u001b\[[0-9;]*m/g, "").trim();
          if (clean.startsWith("Thought:")) {
            console.log(`\x1b[90m🧠 ${clean.slice(8).trim()}\x1b[0m`);
            return;
          }
          if (clean.startsWith("Invoke:")) {
            console.log(`\x1b[36m⚡ Running ${clean.slice(7).trim()}...\x1b[0m`);
            return;
          }
          
          if (isFirstText) {
            process.stdout.write(`\x1b[35m\x1b[1m✨ RIMURU:\x1b[0m `);
            isFirstText = false;
          }
          process.stdout.write(text);
        });
      } catch (error: any) {
        console.log(`\x1b[31mError during execution: ${error.message || String(error)}\x1b[0m`);
      } finally {
        unlisten();
      }

      console.log("\n"); // New line before next prompt
    }
  } finally {
    rl.close();
  }
}

export async function promptApproval(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
