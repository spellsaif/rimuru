import type { ReflectiveChronicle } from "../core/reflective-chronicle.js";
import type { Message, Shard } from "../core/types.js";
import { createRitual, deleteRitual, runDueRituals } from "./rituals.js";

export interface ReflectionRitualOptions {
  readonly chronicle: ReflectiveChronicle;
  readonly shard: Shard;
  readonly sessionId: string;
  readonly workspace: string;
  readonly intervalMinutes?: number;
  readonly minTurns?: number;
}

export async function startReflectionRitual(options: ReflectionRitualOptions): Promise<void> {
  const interval = options.intervalMinutes ?? 5;
  const minTurns = options.minTurns ?? 3;

  await createRitual(options.workspace, {
    id: "chronicle-reflection",
    prompt: "Reflect on recent conversation turns and generate a concise summary.",
    sessionId: options.sessionId,
    everyMinutes: interval,
  });
}

export async function runReflectionRitual(
  workspace: string,
  chronicle: ReflectiveChronicle,
  shard: Shard,
  sessionId: string,
  minTurns = 3,
): Promise<void> {
  await runDueRituals(workspace, new Date(), async (ritual) => {
    if (ritual.id !== "chronicle-reflection") return;

    const crystal = await chronicle.reflect(sessionId, async (messages: readonly Message[]) => {
      const prompt = [
        "Summarize the key topics and decisions from these conversation turns in 2-3 sentences.",
        "Format: TOPIC: <topic> SUMMARY: <summary>",
        "",
        ...messages.map((m) => `${m.role}: ${m.content.slice(0, 500)}`),
      ].join("\n");

      const response = await shard.complete([{ role: "user", content: prompt, createdAt: new Date() }]);
      const text = response.content;

      let topic = "general";
      let summary = text.slice(0, 500);

      const topicMatch = text.match(/TOPIC:\s*(.+)/i);
      if (topicMatch) topic = topicMatch[1]!.trim();

      const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
      if (summaryMatch) summary = summaryMatch[1]!.trim();

      return { topic, summary };
    });

    if (crystal) {
      console.log(`[reflection] Generated crystal entry: "${crystal.topic}" (${crystal.sourceTurns} turns)`);
    }
  });
}

export async function stopReflectionRitual(workspace: string): Promise<void> {
  await deleteRitual(workspace, "chronicle-reflection");
}
