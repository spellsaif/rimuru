import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LatticeRegistry,
  computeSkillCid,
  computeSourceHash,
  loadSkillManifest,
  mergeVows,
  strictestVow,
} from "../src/index.js";
import type { SkillManifest } from "../src/index.js";

async function tmpDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "lattice-test-"));
  return d;
}

const sampleManifest: SkillManifest = {
  name: "test-skill",
  version: "1.0.0",
  description: "A test skill",
  vows: ["read"],
  author: "test",
};

describe("LatticeRegistry", () => {
  it("publishes a skill from a directory", async () => {
    const regDir = await tmpDir();
    const skillDir = await tmpDir();
    await writeFile(join(skillDir, "skill.json"), JSON.stringify(sampleManifest));

    const registry = new LatticeRegistry({ registryDir: regDir });
    const cid = await registry.publish(skillDir);

    expect(cid).toMatch(/^rimuru-skill-/);
    const installed = registry.get("test-skill");
    expect(installed).toBeDefined();
    expect(installed!.manifest.version).toBe("1.0.0");

    await rm(regDir, { recursive: true, force: true });
    await rm(skillDir, { recursive: true, force: true });
  });

  it("installs a published skill by CID", async () => {
    const regDir = await tmpDir();
    const skillDir = await tmpDir();
    await writeFile(join(skillDir, "skill.json"), JSON.stringify(sampleManifest));

    const registry = new LatticeRegistry({ registryDir: regDir });
    const cid = await registry.publish(skillDir);

    const registry2 = new LatticeRegistry({ registryDir: regDir });
    const installed = await registry2.install(cid);
    expect(installed.manifest.name).toBe("test-skill");
    expect(installed.sourceCid).toBe(cid);

    await rm(regDir, { recursive: true, force: true });
    await rm(skillDir, { recursive: true, force: true });
  });

  it("throws on missing CID", async () => {
    const regDir = await tmpDir();
    const registry = new LatticeRegistry({ registryDir: regDir });
    await expect(registry.install("rimuru-skill-nope")).rejects.toThrow("not found");
    await rm(regDir, { recursive: true, force: true });
  });

  it("installs from mirror when available", async () => {
    const regDir = await tmpDir();
    const mirrorDir = await tmpDir();
    const manifestPath = join(mirrorDir, "rimuru-skill-mirrored.json");
    await writeFile(manifestPath, JSON.stringify(sampleManifest));

    const registry = new LatticeRegistry({ registryDir: regDir, mirrorDir });
    const installed = await registry.installFromMirror("rimuru-skill-mirrored");
    expect(installed.manifest.name).toBe("test-skill");

    await rm(regDir, { recursive: true, force: true });
    await rm(mirrorDir, { recursive: true, force: true });
  });

  it("lists published skills", async () => {
    const regDir = await tmpDir();
    const skillDir = await tmpDir();
    await writeFile(join(skillDir, "skill.json"), JSON.stringify(sampleManifest));

    const registry = new LatticeRegistry({ registryDir: regDir });
    await registry.publish(skillDir);
    expect(registry.list()).toHaveLength(1);

    await rm(regDir, { recursive: true, force: true });
    await rm(skillDir, { recursive: true, force: true });
  });

  it("composes two skills with inherited strictest vow", async () => {
    const regDir = await tmpDir();
    const skillDirA = await tmpDir();
    const skillDirB = await tmpDir();
    await writeFile(join(skillDirA, "skill.json"), JSON.stringify({ ...sampleManifest, name: "skill-a", vows: ["read"] }));
    await writeFile(join(skillDirB, "skill.json"), JSON.stringify({ ...sampleManifest, name: "skill-b", vows: ["write"] }));

    const registry = new LatticeRegistry({ registryDir: regDir });
    await registry.publish(skillDirA);
    await registry.publish(skillDirB);

    const composed = registry.compose("skill-a", "skill-b");
    expect(composed).toBeDefined();
    expect(composed!.manifest.name).toBe("skill-a.skill-b");
    expect(composed!.manifest.vows).toContain("read");
    expect(composed!.manifest.vows).toContain("write");
    expect(composed!.compose).toHaveLength(2);

    await rm(regDir, { recursive: true, force: true });
    await rm(skillDirA, { recursive: true, force: true });
    await rm(skillDirB, { recursive: true, force: true });
  });
});

describe("computeSkillCid", () => {
  it("produces deterministic CIDs", () => {
    const cid1 = computeSkillCid(sampleManifest, "abc123");
    const cid2 = computeSkillCid(sampleManifest, "abc123");
    expect(cid1).toBe(cid2);
  });

  it("changes when source hash changes", () => {
    const cid1 = computeSkillCid(sampleManifest, "abc123");
    const cid2 = computeSkillCid(sampleManifest, "def456");
    expect(cid1).not.toBe(cid2);
  });
});

describe("loadSkillManifest", () => {
  it("loads a valid manifest", async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, "skill.json"), JSON.stringify(sampleManifest));
    const loaded = await loadSkillManifest(dir);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("test-skill");
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined for missing file", async () => {
    const dir = await tmpDir();
    const loaded = await loadSkillManifest(dir);
    expect(loaded).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("mergeVows and strictestVow", () => {
  it("mergeVows combines unique vows sorted", () => {
    expect(mergeVows(["read", "write"], ["write", "execute"]).sort()).toEqual(["execute", "read", "write"]);
  });

  it("strictestVow returns the highest-risk vow", () => {
    expect(strictestVow(["read"])).toBe("read");
    expect(strictestVow(["read", "execute"])).toBe("execute");
    expect(strictestVow(["write", "read", "network"])).toBe("network");
  });
});
