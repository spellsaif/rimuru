import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  RuneRegistry,
  runeToPredicate,
  supportsFunctionCalling,
  validatePredicateRoundTrip,
  predicatesToToolDescriptions,
  workspaceRune,
  jsonSchemaToZod,
} from "../src/index.js";
import type { Predicate, Rune, RuneContext } from "../src/index.js";

describe("Predicate protocol", () => {
  it("converts Rune to Predicate preserving id, vow, and description", () => {
    const predicate = runeToPredicate(workspaceRune);
    expect(predicate.id).toBe("workspace.ask");
    expect(predicate.vow).toBe("read");
    expect(predicate.description).toBe("Answers a simple workspace-scoped question without network access.");
  });

  it("Predicate invoke matches Rune invoke", async () => {
    const predicate = runeToPredicate(workspaceRune);
    const result = await predicate.invoke(
      { question: "test question" },
      { workspace: "/tmp", sessionId: "test" },
    );
    expect(result).toEqual({ answer: "Workspace /tmp received: test question" });
  });

  it("RuneRegistry.registerPredicate stores and retrieves predicates", () => {
    const registry = new RuneRegistry();
    const testRune: Rune = {
      name: "test.echo",
      description: "Echo input",
      risk: "read",
      async invoke(input) {
        return input;
      },
    };
    const pred = runeToPredicate(testRune);
    registry.registerPredicate(pred);
    expect(registry.predicate("test.echo")).toBeDefined();
    expect(registry.allPredicates()).toHaveLength(1);
  });

  it("allPredicates returns all registered predicates", () => {
    const registry = new RuneRegistry();
    const rune1: Rune = {
      name: "test.one",
      description: "One",
      risk: "read",
      async invoke() {
        return 1;
      },
    };
    const rune2: Rune = {
      name: "test.two",
      description: "Two",
      risk: "write",
      async invoke() {
        return 2;
      },
    };
    registry.registerPredicate(runeToPredicate(rune1));
    registry.registerPredicate(runeToPredicate(rune2));
    expect(registry.allPredicates()).toHaveLength(2);
  });

  it("supportsFunctionCalling returns true for known providers", () => {
    expect(supportsFunctionCalling("openai-compatible")).toBe(true);
    expect(supportsFunctionCalling("anthropic")).toBe(true);
    expect(supportsFunctionCalling("gemini")).toBe(true);
    expect(supportsFunctionCalling("openrouter")).toBe(true);
    expect(supportsFunctionCalling("mock")).toBe(false);
  });

  it("validatePredicateRoundTrip validates well-formed predicate", () => {
    const zodInput = jsonSchemaToZod({
      type: "object",
      properties: { name: { type: "string" } },
    })!;
    const zodOutput = jsonSchemaToZod({
      type: "object",
      properties: { result: { type: "string" } },
    })!;
    const pred: Predicate = {
      id: "test.valid",
      description: "Valid",
      vow: "read",
      input: zodInput,
      output: zodOutput,
      cost: { barrier: "none" },
      async invoke(input) {
        return { result: (input as any).name ?? "ok" };
      },
    };
    expect(validatePredicateRoundTrip(pred)).toEqual([]);
  });

  it("predicatesToToolDescriptions produces correct output", () => {
    const zodInput = jsonSchemaToZod({
      type: "object",
      required: ["x"],
      properties: { x: { type: "number" } },
    })!;
    const pred: Predicate = {
      id: "test.tool",
      description: "Test tool",
      vow: "read",
      input: zodInput,
      output: jsonSchemaToZod({ type: "object", properties: {} })!,
      cost: { barrier: "none" },
      async invoke(input) {
        return (input as any).x * 2;
      },
    };
    const tools = predicatesToToolDescriptions([pred]);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("test.tool");
    expect(tools[0]!.description).toBe("Test tool");
  });

  it("auto-wrapping via asPredicate on RuneRegistry", () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);
    const pred = registry.asPredicate("workspace.ask");
    expect(pred.id).toBe("workspace.ask");
    expect(pred.vow).toBe("read");
  });
});
