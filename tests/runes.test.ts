import { describe, expect, it } from "vitest";
import { RuneRegistry, StaticPermissionPolicy, auditMiddleware, permissionMiddleware } from "../src/index.js";

describe("RuneRegistry", () => {
  it("registers, lists, and invokes runes", async () => {
    const registry = new RuneRegistry();
    const workspaceRune = {
      name: "workspace.ask",
      description: "test",
      risk: "read" as const,
      inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
      async invoke(input: any, context: any) {
        return { answer: `Workspace ${context.workspace} received: ${input.question}` };
      },
    };
    registry.register(workspaceRune);

    const result = await registry.invoke(
      "workspace.ask",
      { question: "where am I?" },
      { workspace: "/isekai", sessionId: "s1" },
    );

    expect(registry.list().map((rune) => rune.name)).toEqual(["workspace.ask"]);
    expect(result).toEqual({ answer: "Workspace /isekai received: where am I?" });
  });

  it("rejects duplicate rune names", () => {
    const registry = new RuneRegistry();
    const rune = {
      name: "test.foo",
      description: "",
      risk: "read" as const,
      async invoke() {},
    };
    registry.register(rune);

    expect(() => registry.register(rune)).toThrow("Rune already registered");
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
              tags: { type: "array" as const },
            },
          },
        },
      },
      async invoke(input: any) {
        return input;
      },
    };
    registry.register(nestedRune);

    const valid = await registry.invoke(
      "test.nested",
      { meta: { id: 123, tags: ["foo"] } },
      { workspace: "/isekai", sessionId: "s1" },
    );
    expect(valid).toEqual({ meta: { id: 123, tags: ["foo"] } });

    await expect(
      registry.invoke(
        "test.nested",
        { meta: { id: "not-a-number", tags: ["foo"] } },
        { workspace: "/isekai", sessionId: "s1" },
      ),
    ).rejects.toThrow("meta.id: ");
  });

  it("allows case-insensitive lookups and invocations", async () => {
    const rune = {
      name: "workspace.ask",
      description: "test",
      risk: "read" as const,
      inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
      async invoke(input: any, context: any) {
        return { answer: `Workspace ${context.workspace} received: ${input.question}` };
      },
    };
    const registry = new RuneRegistry();
    registry.register(rune);

    const resultLower = await registry.invoke(
      "workspace.ask",
      { question: "test" },
      { workspace: "/tmp", sessionId: "s" },
    );
    const resultUpper = await registry.invoke(
      "WORKSPACE.ASK",
      { question: "test" },
      { workspace: "/tmp", sessionId: "s" },
    );
    const resultMix = await registry.invoke(
      "WorkSpace.AsK",
      { question: "test" },
      { workspace: "/tmp", sessionId: "s" },
    );

    expect(resultLower).toBeDefined();
    expect(resultUpper).toBeDefined();
    expect(resultMix).toBeDefined();
  });

  it("filters by risk", () => {
    const registry = new RuneRegistry();
    registry.register({ name: "a.read", description: "", risk: "read", async invoke() {} });
    registry.register({ name: "b.write", description: "", risk: "write", async invoke() {} });
    registry.register({ name: "c.read", description: "", risk: "read", async invoke() {} });

    expect(registry.byRisk("read").map((r) => r.name)).toEqual(["a.read", "c.read"]);
    expect(registry.byRisk("write").map((r) => r.name)).toEqual(["b.write"]);
    expect(registry.byRisk("network")).toHaveLength(0);
  });

  it("denies execution runes via permission middleware", async () => {
    const policy = new StaticPermissionPolicy({ allow: ["read"] });
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

  it("emits audit events via audit middleware", async () => {
    const events: any[] = [];
    const registry = new RuneRegistry({
      middlewares: [
        auditMiddleware({
          emit: (e: any) => events.push(e),
        }),
      ],
    });
    registry.register({
      name: "test.echo",
      description: "echo",
      risk: "read",
      async invoke(input: any) {
        return input;
      },
    });

    await registry.invoke("test.echo", { x: 1 }, { workspace: "/tmp", sessionId: "s", audit: true });

    expect(events.map((e) => e.type)).toContain("rune.requested");
    expect(events.map((e) => e.type)).toContain("rune.completed");
  });

  it("invokeStream delegates to invoke", async () => {
    const registry = new RuneRegistry();
    registry.register({
      name: "test.echo",
      description: "echo",
      risk: "read",
      async invoke(input: any) {
        return input;
      },
    });

    const chunks: unknown[] = [];
    for await (const chunk of registry.invokeStream("test.echo", { x: 1 }, { workspace: "/tmp", sessionId: "s" })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ x: 1 }]);
  });
});
