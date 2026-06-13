import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillRegistry, HashEmbeddingProvider } from "../src/index.js";

describe("SkillRegistry", () => {
  it("registers and lists skills", () => {
    const embedder = new HashEmbeddingProvider(64);
    const registry = new SkillRegistry(embedder);
    registry.register({ name: "test-skill", description: "A test skill", content: "# Hello" });
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("test-skill")?.name).toBe("test-skill");
  });

  it("deregisters skills", () => {
    const registry = new SkillRegistry(new HashEmbeddingProvider(64));
    registry.register({ name: "remove-me", description: "", content: "" });
    registry.deregister("remove-me");
    expect(registry.get("remove-me")).toBeUndefined();
  });

  it("case-insensitive lookups", () => {
    const registry = new SkillRegistry(new HashEmbeddingProvider(64));
    registry.register({ name: "CaSe-Test", description: "", content: "" });
    expect(registry.get("case-test")).toBeDefined();
    expect(registry.get("CASE-TEST")).toBeDefined();
  });

  it("embeds and retrieves skills by semantic relevance", async () => {
    const registry = new SkillRegistry(new HashEmbeddingProvider(64));
    registry.register({ name: "k8s-deploy", description: "Deploy apps to Kubernetes clusters", content: "# Deploy\nUse kubectl apply" });
    registry.register({ name: "python-test", description: "Run Python unit tests with pytest", content: "# Tests\nRun pytest" });
    registry.register({ name: "docker-build", description: "Build Docker images for deployment", content: "# Docker\nBuild and push" });

    await registry.embedAll();

    const results = await registry.retrieveRelevant("deploy a containerized app to production", 2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.name).toMatch(/k8s|docker/);
  });

  it("formats skills for prompt injection", () => {
    const registry = new SkillRegistry(new HashEmbeddingProvider(64));
    registry.register({ name: "skill-a", description: "First skill", content: "Content A" });
    const formatted = registry.formatForPrompt([{ ...registry.get("skill-a")!, score: 0.85 }]);
    expect(formatted).toContain("skill-a");
    expect(formatted).toContain("85%");
    expect(formatted).toContain("Content A");
  });

  it("loads skills from a directory with SKILL.md files", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-skills-"));
    try {
      const skillDir = join(root, "my-skill");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), [
        "---",
        "name: my-skill",
        "description: Does the thing",
        "---",
        "# How to do the thing",
        "1. Step one",
        "2. Step two",
      ].join("\n"), "utf8");

      const registry = new SkillRegistry(new HashEmbeddingProvider(64));
      const count = await registry.loadFromDirectory(root);
      expect(count).toBe(1);
      expect(registry.get("my-skill")?.description).toBe("Does the thing");
      expect(registry.get("my-skill")?.content).toContain("# How to do the thing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns empty for non-existent directory", async () => {
    const registry = new SkillRegistry(new HashEmbeddingProvider(64));
    const count = await registry.loadFromDirectory("/tmp/definitely-not-exists-12345");
    expect(count).toBe(0);
  });

  it("creates and deletes skill directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-skills-create-"));
    try {
      await SkillRegistry.prototype.createSkill?.(root, "test-skill", "desc", "# Test", "devops");
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(join(root, "test-skill", "SKILL.md"), "utf8");
      expect(raw).toContain("name: test-skill");
      expect(raw).toContain("# Test");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
