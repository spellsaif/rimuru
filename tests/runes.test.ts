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
});
