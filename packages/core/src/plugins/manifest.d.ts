import type { RuneRegistry } from "../core/runes.js";
import type { Rune, RuneRisk } from "../core/types.js";
export interface PluginManifest {
    readonly name: string;
    readonly version: string;
    readonly entry?: string;
    readonly runes: readonly {
        readonly name: string;
        readonly risk: RuneRisk;
        readonly description: string;
    }[];
}
export interface LoadedPlugin {
    readonly manifest: PluginManifest;
    readonly root: string;
    readonly entry?: string;
    readonly runes: readonly Rune[];
}
export interface PluginContext {
    readonly manifest: PluginManifest;
    readonly root: string;
}
export type PluginModule = {
    readonly createRunes?: (context: PluginContext) => readonly Rune[] | Promise<readonly Rune[]>;
};
export declare function loadPluginManifest(path: string): Promise<PluginManifest>;
export declare function validatePluginManifest(value: unknown): PluginManifest;
export declare function loadPluginManifests(paths: readonly string[]): Promise<readonly PluginManifest[]>;
export declare function discoverPluginManifests(root: string): Promise<readonly PluginManifest[]>;
export declare function loadPlugin(root: string): Promise<LoadedPlugin>;
export declare function loadPlugins(root: string): Promise<readonly LoadedPlugin[]>;
export declare function registerPlugins(registry: RuneRegistry, root: string): Promise<readonly LoadedPlugin[]>;
export declare function manifestRunes(manifest: PluginManifest): readonly Rune[];
