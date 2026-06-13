import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EmbeddingProvider } from "../memory/semantic.js";

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly category?: string;
  readonly content: string;
  readonly embedding?: readonly number[];
  readonly version?: string;
  readonly author?: string;
  readonly tags?: readonly string[];
  readonly platforms?: readonly string[];
  readonly requiresToolsets?: readonly string[];
  readonly fallbackForToolsets?: readonly string[];
}

export class SkillRegistry {
  readonly #skills = new Map<string, Skill>();
  readonly #embedder: EmbeddingProvider;

  constructor(embedder: EmbeddingProvider) {
    this.#embedder = embedder;
  }

  list(): readonly Skill[] {
    return [...this.#skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  register(skill: Skill): void {
    this.#skills.set(skill.name.toLowerCase(), skill);
  }

  deregister(name: string): void {
    this.#skills.delete(name.toLowerCase());
  }

  get(name: string): Skill | undefined {
    return this.#skills.get(name.toLowerCase());
  }

  async embedAll(): Promise<void> {
    for (const skill of this.#skills.values()) {
      if (!skill.embedding) {
        (skill as any).embedding = await this.#embedder.embed(`${skill.name} ${skill.description}`);
      }
    }
  }

  async retrieveRelevant(query: string, topK = 3): Promise<(Skill & { score: number })[]> {
    const queryEmbedding = await this.#embedder.embed(query);
    const results: { skill: Skill; score: number }[] = [];

    for (const skill of this.#skills.values()) {
      const emb = skill.embedding;
      if (!emb) continue;
      const score = cosineSimilarity(queryEmbedding, emb);
      results.push({ skill, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => ({ ...r.skill, score: r.score }));
  }

  formatForPrompt(skills: readonly (Skill & { score?: number })[]): string {
    if (skills.length === 0) return "";
    return (
      `\n## Available Skills\n` +
      skills
        .map(
          (s) =>
            `### ${s.name}${s.score !== undefined ? ` (relevance: ${(s.score * 100).toFixed(0)}%)` : ""}\n${s.description}\n\n${s.content}`,
        )
        .join("\n---\n")
    );
  }

  async loadFromDirectory(dir: string): Promise<number> {
    let count = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = join(dir, entry.name);
        try {
          const skill = await loadSkill(skillPath);
          if (skill) {
            this.register(skill);
            count++;
          }
        } catch {
          // skip broken skills
        }
      }
    } catch {
      // dir doesn't exist
    }
    await this.embedAll();
    return count;
  }
}

export async function loadSkill(dir: string): Promise<Skill | null> {
  const yaml = await import("yaml");
  try {
    const rawMd = await readFile(join(dir, "SKILL.md"), "utf8");
    const { frontmatter, content } = parseFrontmatter(rawMd, yaml);
    const fm = frontmatter ?? {};
    return {
      name: fm.name || dir.split("/").pop() || "unnamed",
      description: fm.description || "",
      category: fm.metadata?.hermes?.category,
      content,
      version: fm.version,
      author: fm.author,
      tags: fm.metadata?.hermes?.tags,
      platforms: fm.platforms,
      requiresToolsets: fm.metadata?.hermes?.requires_toolsets,
      fallbackForToolsets: fm.metadata?.hermes?.fallback_for_toolsets,
    };
  } catch {
    return null;
  }
}

function parseFrontmatter(
  raw: string,
  yaml: any,
): { frontmatter: Record<string, any> | null; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, content: raw };
  try {
    return { frontmatter: yaml.parse(match[1]), content: match[2] ?? "" };
  } catch {
    return { frontmatter: null, content: raw };
  }
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function createSkill(
  dir: string,
  name: string,
  description: string,
  content: string,
  category?: string,
): Promise<Skill> {
  const skillDir = resolve(dir, name);
  await mkdir(skillDir, { recursive: true });

  let frontmatter = `---\nname: ${name}\ndescription: ${description}\n`;
  if (category) frontmatter += `metadata:\n  hermes:\n    category: ${category}\n`;
  frontmatter += `---\n`;

  await writeFile(join(skillDir, "SKILL.md"), frontmatter + content, "utf8");

  return {
    name,
    description,
    category,
    content,
  };
}

export async function deleteSkill(dir: string, name: string): Promise<void> {
  const skillDir = resolve(dir, name);
  await rm(skillDir, { recursive: true, force: true });
}
