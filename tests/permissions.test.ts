import { describe, expect, it } from "vitest";
import { RuneRegistry, StaticPermissionPolicy } from "../src/index.js";
import { permissionMiddleware } from "../src/index.js";

describe("permissions", () => {
  it("denies execution runes by default read-only policy", async () => {
    const policy = new StaticPermissionPolicy();
    const registry = new RuneRegistry({
      middlewares: [permissionMiddleware({ policy })],
    });
    registry.register({
      name: "workspace.shell",
      description: "shell",
      risk: "execute",
      async invoke() {},
    });

    await expect(
      registry.invoke(
        "workspace.shell",
        { command: "node", args: ["--version"] },
        { workspace: process.cwd(), sessionId: "s" },
      ),
    ).rejects.toThrow("risk 'execute' is not allowed");
  });
});
