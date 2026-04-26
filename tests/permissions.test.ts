import { describe, expect, it } from "vitest";
import { RuneRegistry, shellRune, StaticPermissionPolicy } from "../src/index.js";

describe("permissions", () => {
  it("denies execution runes by default read-only policy", async () => {
    const registry = new RuneRegistry({ policy: new StaticPermissionPolicy() });
    registry.register(shellRune);

    await expect(registry.invoke("workspace.shell", { command: "node", args: ["--version"] }, { workspace: process.cwd(), sessionId: "s" })).rejects.toThrow(
      "risk 'execute' is not allowed"
    );
  });
});
