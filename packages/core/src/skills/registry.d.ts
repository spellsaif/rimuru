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
export declare class SkillRegistry {
    #private;
    constructor(embedder: EmbeddingProvider);
    list(): readonly Skill[];
    register(skill: Skill): void;
    deregister(name: string): void;
    get(name: string): Skill | undefined;
    embedAll(): Promise<void>;
    retrieveRelevant(query: string, topK?: number): Promise<(Skill & {
        score: number;
    })[]>;
    formatForPrompt(skills: readonly (Skill & {
        score?: number;
    })[]): string;
    loadFromDirectory(dir: string): Promise<number>;
}
export declare function loadSkill(dir: string): Promise<Skill | null>;
export declare function createSkill(dir: string, name: string, description: string, content: string, category?: string): Promise<Skill>;
export declare function deleteSkill(dir: string, name: string): Promise<void>;
