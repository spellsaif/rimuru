import { z } from "zod";
import type { Rune, RuneContext, RuneRisk, RuneSchema } from "./types.js";
import { jsonSchemaToZod, zodToOpenAISchema, zodToAnthropicSchema } from "./schema.js";

export type Vow = RuneRisk;

export type Barrier = "none" | "readonly" | "docker" | "wasi" | "firecracker" | "pyodide";

export interface PredicateCost {
  readonly tokens?: number;
  readonly ms?: number;
  readonly barrier: Barrier;
}

export interface Predicate<I = unknown, O = unknown> {
  readonly id: string;
  readonly description: string;
  readonly vow: Vow;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  readonly cost: PredicateCost;
  invoke(input: I, ctx: RuneContext): Promise<O>;
}

export function runeToPredicate(rune: Rune, cost?: Partial<PredicateCost>): Predicate {
  const zodInput = jsonSchemaToZod(rune.inputSchema) ?? z.object({});
  const zodOutput = jsonSchemaToZod(rune.outputSchema) ?? z.any();
  return {
    id: rune.name,
    description: rune.description,
    vow: rune.risk,
    input: zodInput,
    output: zodOutput,
    cost: {
      barrier: cost?.barrier ?? "none",
      tokens: cost?.tokens,
      ms: cost?.ms,
    },
    invoke(input: any, ctx: RuneContext): Promise<any> {
      return rune.invoke(input, ctx);
    },
  };
}

export function predicateToToolSchema(
  predicate: Predicate,
  providerKind: string,
): Record<string, unknown> {
  if (providerKind === "anthropic") {
    return zodToAnthropicSchema(predicate.input, {
      name: predicate.id,
      description: predicate.description,
    }) as Record<string, unknown>;
  }
  return zodToOpenAISchema(predicate.input, {
    name: predicate.id,
    description: predicate.description,
  }) as Record<string, unknown>;
}

export function predicatesToToolDescriptions(predicates: readonly Predicate[]): readonly ProviderTool[] {
  return predicates.map((p) => ({
    name: p.id,
    description: p.description,
    inputSchema: zodToInputSchema(p.input),
  }));
}

function zodToInputSchema(zodType: z.ZodType<any>): RuneSchema | undefined {
  try {
    const jsonSchema = JSON.parse(JSON.stringify(zodType));
    if (jsonSchema?.type === "object") return jsonSchema as RuneSchema;
  } catch {}
  return undefined;
}

export interface ProviderTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: RuneSchema;
}

export function supportsFunctionCalling(providerKind: string): boolean {
  const fcProviders = new Set(["openai-compatible", "anthropic", "gemini", "openrouter"]);
  return fcProviders.has(providerKind);
}

export function validatePredicateRoundTrip(predicate: Predicate): string[] {
  const errors: string[] = [];
  try {
    predicate.input.parse({});
  } catch (e: any) {
    errors.push(`input: ${e.message}`);
  }
  try {
    predicate.output.parse({});
  } catch (e: any) {
    errors.push(`output: ${e.message}`);
  }
  return errors;
}
