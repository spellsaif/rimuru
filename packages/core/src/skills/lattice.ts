import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Vow } from "../core/predicate.js";

export interface SkillManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly vows: readonly Vow[];
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly peerSkills?: readonly string[];
  readonly author?: string;
  readonly predicates?: readonly string[];
  readonly sbom?: Readonly<Record<string, string>>;
  readonly signature?: string;
}

export interface ComposedSkill {
  readonly manifest: SkillManifest;
  readonly sourceCid: string;
  readonly compose?: readonly string[];
}

export function computeSkillCid(manifest: SkillManifest, sourceHash: string): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(manifest))
    .update(sourceHash)
    .digest("hex");
  return `rimuru-skill-${hash.slice(0, 16)}`;
}

export function computeSourceHash(skillDir: string, content: string): string {
  return createHash("sha256").update(`${skillDir}:${content}`).digest("hex");
}

export async function loadSkillManifest(dir: string): Promise<SkillManifest | undefined> {
  try {
    const raw = await readFile(join(dir, "skill.json"), "utf8");
    const manifest = JSON.parse(raw) as SkillManifest;
    if (!manifest.name || !manifest.version) return undefined;
    return manifest;
  } catch {
    return undefined;
  }
}

export async function saveSkillManifest(dir: string, manifest: SkillManifest): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "skill.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export interface LatticeRegistryOptions {
  readonly registryDir: string;
  readonly mirrorDir?: string;
  readonly communityRegistryUrl?: string;
}

export class LatticeRegistry {
  readonly #registryDir: string;
  readonly #mirrorDir: string;
  readonly #communityUrl?: string;
  readonly #skills = new Map<string, ComposedSkill>();

  constructor(options: LatticeRegistryOptions) {
    this.#registryDir = options.registryDir;
    this.#mirrorDir = options.mirrorDir ?? join(options.registryDir, "mirror");
    this.#communityUrl = options.communityRegistryUrl;
  }

  async publish(skillDir: string): Promise<string> {
    const manifest = await loadSkillManifest(skillDir);
    if (!manifest) throw new Error(`No valid skill.json found in ${skillDir}`);

    const sourceHash = computeSourceHash(skillDir, JSON.stringify(manifest));
    const cid = computeSkillCid(manifest, sourceHash);

    const composed: ComposedSkill = {
      manifest,
      sourceCid: cid,
    };

    const destDir = join(this.#registryDir, cid);
    await mkdir(destDir, { recursive: true });
    await saveSkillManifest(destDir, manifest);
    await writeFile(join(destDir, "source.sha256"), sourceHash, "utf8");

    this.#skills.set(manifest.name.toLowerCase(), composed);
    return cid;
  }

  async install(cid: string): Promise<ComposedSkill> {
    const localDir = join(this.#registryDir, cid);
    try {
      const manifest = await loadSkillManifest(localDir);
      if (!manifest) throw new Error("Manifest not found");

      const composed: ComposedSkill = {
        manifest,
        sourceCid: cid,
      };
      this.#skills.set(manifest.name.toLowerCase(), composed);
      return composed;
    } catch {
      if (this.#communityUrl) {
        throw new Error(
          `Skill ${cid} not found locally. Community registry not yet implemented (${this.#communityUrl})`,
        );
      }
      throw new Error(`Skill ${cid} not found in registry`);
    }
  }

  async installFromMirror(cid: string): Promise<ComposedSkill> {
    const mirrorPath = join(this.#mirrorDir, `${cid}.json`);
    try {
      const raw = await readFile(mirrorPath, "utf8");
      const manifest = JSON.parse(raw) as SkillManifest;
      const composed: ComposedSkill = {
        manifest,
        sourceCid: cid,
      };
      this.#skills.set(manifest.name.toLowerCase(), composed);
      return composed;
    } catch {
      return this.install(cid);
    }
  }

  get(name: string): ComposedSkill | undefined {
    return this.#skills.get(name.toLowerCase());
  }

  list(): readonly ComposedSkill[] {
    return [...this.#skills.values()];
  }

  compose(a: string, b: string): ComposedSkill | undefined {
    const skillA = this.get(a);
    const skillB = this.get(b);
    if (!skillA || !skillB) return undefined;

    const strictestVows = mergeVows(skillA.manifest.vows, skillB.manifest.vows);

    const composedManifest: SkillManifest = {
      name: `${skillA.manifest.name}.${skillB.manifest.name}`,
      version: "1.0.0-composed",
      description: `Composition of ${skillA.manifest.name} → ${skillB.manifest.name}`,
      vows: strictestVows,
      peerSkills: [skillA.manifest.name, skillB.manifest.name],
      inputs: skillB.manifest.inputs,
      outputs: skillA.manifest.outputs,
    };

    const cid = computeSkillCid(
      composedManifest,
      computeSourceHash("composed", `${skillA.sourceCid}:${skillB.sourceCid}`),
    );

    const composed: ComposedSkill = {
      manifest: composedManifest,
      sourceCid: cid,
      compose: [skillA.sourceCid, skillB.sourceCid],
    };

    this.#skills.set(composedManifest.name.toLowerCase(), composed);
    return composed;
  }
}

export function mergeVows(vowsA: readonly Vow[], vowsB: readonly Vow[]): readonly Vow[] {
  const allVows = new Set([...vowsA, ...vowsB]);
  return [...allVows].sort();
}

export function strictestVow(vows: readonly Vow[]): Vow {
  const order: Record<Vow, number> = { read: 1, write: 2, execute: 3, network: 4 };
  let strictest: Vow = "read";
  for (const vow of vows) {
    if ((order[vow] ?? 0) > (order[strictest] ?? 0)) {
      strictest = vow;
    }
  }
  return strictest;
}
