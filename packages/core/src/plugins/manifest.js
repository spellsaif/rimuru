import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export async function loadPluginManifest(path) {
    return validatePluginManifest(JSON.parse(await readFile(path, "utf8")));
}
export function validatePluginManifest(value) {
    if (typeof value !== "object" || value === null)
        throw new Error("Plugin manifest must be an object");
    const manifest = value;
    if (!manifest.name || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.name))
        throw new Error("Plugin manifest has invalid name");
    if (!manifest.version)
        throw new Error("Plugin manifest requires version");
    if (manifest.entry !== undefined &&
        (typeof manifest.entry !== "string" || manifest.entry.startsWith("/") || manifest.entry.includes(".."))) {
        throw new Error("Plugin manifest has invalid entry");
    }
    if (!Array.isArray(manifest.runes) || manifest.runes.length === 0)
        throw new Error("Plugin manifest requires runes array");
    const seen = new Set();
    for (const rune of manifest.runes) {
        if (!rune.name ||
            !/^[a-z0-9][a-z0-9._-]*$/i.test(rune.name) ||
            !rune.name.startsWith(`${manifest.name}.`) ||
            seen.has(rune.name) ||
            !rune.description ||
            !["read", "write", "execute", "network"].includes(rune.risk)) {
            throw new Error(`Invalid plugin rune in ${manifest.name}`);
        }
        seen.add(rune.name);
    }
    return manifest;
}
export async function loadPluginManifests(paths) {
    return Promise.all(paths.map((path) => loadPluginManifest(path)));
}
export async function discoverPluginManifests(root) {
    try {
        const entries = await readdir(root, { withFileTypes: true });
        const paths = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(root, entry.name, "rimuru.plugin.json"));
        return loadPluginManifests(paths);
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return [];
        throw error;
    }
}
export async function loadPlugin(root) {
    const manifestPath = join(root, "rimuru.plugin.json");
    const manifest = await loadPluginManifest(manifestPath);
    if (!manifest.entry)
        return { manifest, root, runes: manifestRunes(manifest) };
    const entry = resolve(dirname(manifestPath), manifest.entry);
    const module = (await import(pathToFileURL(entry).href));
    if (typeof module.createRunes !== "function")
        throw new Error(`Plugin ${manifest.name} entry must export createRunes`);
    const runes = await module.createRunes({ manifest, root });
    validatePluginRunes(manifest, runes);
    return { manifest, root, entry, runes };
}
export async function loadPlugins(root) {
    try {
        const entries = await readdir(root, { withFileTypes: true });
        return Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => loadPlugin(join(root, entry.name))));
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return [];
        throw error;
    }
}
export async function registerPlugins(registry, root) {
    const plugins = await loadPlugins(root);
    for (const plugin of plugins) {
        for (const rune of plugin.runes)
            registry.register(rune);
    }
    return plugins;
}
export function manifestRunes(manifest) {
    return manifest.runes.map((pluginRune) => ({
        name: pluginRune.name,
        description: `${pluginRune.description} (declared by plugin ${manifest.name}@${manifest.version})`,
        risk: pluginRune.risk,
        async invoke() {
            throw new Error(`Plugin rune '${pluginRune.name}' is declared but no runtime loader is installed`);
        },
    }));
}
function validatePluginRunes(manifest, runes) {
    const declared = new Map(manifest.runes.map((rune) => [rune.name, rune]));
    for (const rune of runes) {
        const expected = declared.get(rune.name);
        if (!expected)
            throw new Error(`Plugin ${manifest.name} exported undeclared rune: ${rune.name}`);
        if (expected.risk !== rune.risk)
            throw new Error(`Plugin ${manifest.name} rune ${rune.name} risk mismatch`);
        if (typeof rune.invoke !== "function")
            throw new Error(`Plugin ${manifest.name} rune ${rune.name} requires invoke`);
    }
    for (const declaredRune of declared.keys()) {
        if (!runes.some((rune) => rune.name === declaredRune))
            throw new Error(`Plugin ${manifest.name} did not export declared rune: ${declaredRune}`);
    }
}
//# sourceMappingURL=manifest.js.map