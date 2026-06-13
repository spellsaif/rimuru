import { describe, expect, it, vi } from "vitest";
import { RuneRegistry } from "../src/core/runes.js";

describe("registry toolsets", () => {
  it("filters described runes by enabled toolsets", () => {
    const registry = new RuneRegistry();
    registry.register({ name: "a.read", description: "", risk: "read", async invoke() {} });
    registry.register({ name: "b.write", description: "", risk: "write", async invoke() {} });
    registry.register({ name: "c.network", description: "", risk: "network", async invoke() {} });

    registry.toolset("readonly", ["a.read"]);
    registry.toolset("writable", ["b.write", "c.network"]);

    expect(registry.describe()).toHaveLength(3);

    registry.enableToolset("readonly");
    expect(registry.describe()).toHaveLength(1);
    expect(registry.describe()[0]?.name).toBe("a.read");

    registry.enableToolset("writable");
    expect(registry.describe()).toHaveLength(3);

    registry.disableToolset("readonly");
    expect(registry.describe()).toHaveLength(2);
  });

  it("lists enabled toolsets", () => {
    const registry = new RuneRegistry();
    registry.toolset("files", ["a"]);
    registry.toolset("git", ["b"]);

    registry.enableToolset("files");
    expect(registry.getEnabledToolsets()).toEqual(["files"]);

    registry.enableToolset("git");
    expect(registry.getEnabledToolsets()).toEqual(["files", "git"]);

    registry.disableToolset("files");
    expect(registry.getEnabledToolsets()).toEqual(["git"]);
  });

  it("byRisk filters correctly", () => {
    const registry = new RuneRegistry();
    registry.register({ name: "a", description: "", risk: "read", async invoke() {} });
    registry.register({ name: "b", description: "", risk: "write", async invoke() {} });
    registry.register({ name: "c", description: "", risk: "read", async invoke() {} });
    registry.register({ name: "d", description: "", risk: "execute", async invoke() {} });

    expect(registry.byRisk("read")).toHaveLength(2);
    expect(registry.byRisk("write")).toHaveLength(1);
    expect(registry.byRisk("network")).toHaveLength(0);
  });

  it("case-insensitive toolset matching", () => {
    const registry = new RuneRegistry();
    registry.register({ name: "Test.Rune", description: "", risk: "read", async invoke() {} });
    registry.toolset("misc", ["test.rune"]);
    registry.enableToolset("misc");

    expect(registry.describe()).toHaveLength(1);
    expect(registry.describe()[0]?.name).toBe("Test.Rune");
  });
});
