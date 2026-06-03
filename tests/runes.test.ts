import { describe, expect, it } from "vitest";
import { RuneRegistry, workspaceRune } from "../src/index.js";

describe("RuneRegistry", () => {
  it("registers, lists, and invokes runes", async () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);

    const result = await registry.invoke("workspace.ask", { question: "where am I?" }, { workspace: "/isekai", sessionId: "s1" });

    expect(registry.list().map((rune) => rune.name)).toEqual(["workspace.ask"]);
    expect(result).toEqual({ answer: "Workspace /isekai received: where am I?" });
  });

  it("rejects duplicate rune names", () => {
    const registry = new RuneRegistry();
    registry.register(workspaceRune);

    expect(() => registry.register(workspaceRune)).toThrow("Rune already registered");
  });

  it("recursively validates nested input schemas", async () => {
    const registry = new RuneRegistry();
    const nestedRune = {
      name: "test.nested",
      description: "nested validation test",
      risk: "read" as const,
      inputSchema: {
        type: "object" as const,
        required: ["meta"],
        properties: {
          meta: {
            type: "object" as const,
            required: ["id", "tags"],
            properties: {
              id: { type: "number" as const },
              tags: { type: "array" as const }
            }
          }
        }
      },
      async invoke(input: any) {
        return input;
      }
    };
    registry.register(nestedRune);

    // Valid nested input
    const valid = await registry.invoke("test.nested", { meta: { id: 123, tags: ["foo"] } }, { workspace: "/isekai", sessionId: "s1" });
    expect(valid).toEqual({ meta: { id: 123, tags: ["foo"] } });

    // Invalid nested input
    await expect(
      registry.invoke("test.nested", { meta: { id: "not-a-number", tags: ["foo"] } }, { workspace: "/isekai", sessionId: "s1" })
    ).rejects.toThrow("meta.id: ");
  });
});
