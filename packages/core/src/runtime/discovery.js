import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { executeDynamicRune } from "../security/sandbox-vm.js";
export async function loadSoul(workspace) {
    try {
        const content = await readFile(resolve(workspace, "SOUL.md"), "utf8");
        return content.trim();
    }
    catch {
        return undefined;
    }
}
/**
 * Discovers sandboxed runes in .rimuru/runes/ workspace directory.
 */
export async function discoverSandboxedRunes(workspace) {
    const runes = [];
    const runesDir = resolve(workspace, ".rimuru", "runes");
    try {
        const entries = await readdir(runesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".js")) {
                const jsPath = join(runesDir, entry.name);
                const nameWithoutExt = entry.name.slice(0, -3);
                const jsonPath = join(runesDir, `${nameWithoutExt}.json`);
                try {
                    const code = await readFile(jsPath, "utf8");
                    const jsonContent = await readFile(jsonPath, "utf8");
                    const config = JSON.parse(jsonContent);
                    const rune = {
                        name: config.name || `custom.${nameWithoutExt}`,
                        description: config.description || `Custom sandboxed tool: ${nameWithoutExt}`,
                        risk: config.risk || "execute",
                        inputSchema: config.inputSchema,
                        outputSchema: config.outputSchema,
                        async invoke(input) {
                            return await executeDynamicRune(code, input);
                        },
                    };
                    runes.push(rune);
                }
                catch (error) {
                    console.warn(`[discovery] Failed to load sandboxed JS Rune from ${entry.name}:`, error);
                }
            }
            else if (entry.isFile() && entry.name.endsWith(".wasm")) {
                const nameWithoutExt = entry.name.slice(0, -5);
                const jsonPath = join(runesDir, `${nameWithoutExt}.json`);
                try {
                    const jsonContent = await readFile(jsonPath, "utf8");
                    const config = JSON.parse(jsonContent);
                    const rune = {
                        name: config.name || `custom.${nameWithoutExt}`,
                        description: config.description || `Custom WASI sandboxed tool: ${nameWithoutExt}`,
                        risk: config.risk || "execute",
                        inputSchema: config.inputSchema,
                        outputSchema: config.outputSchema,
                        async invoke(input, context) {
                            const { runSandboxedCommand } = await import("../security/sandbox.js");
                            const jsonInput = JSON.stringify(input);
                            const result = await runSandboxedCommand({
                                command: join(runesDir, nameWithoutExt),
                                workspace: context.workspace,
                                stdin: jsonInput,
                            }, "wasi");
                            const stdoutTrimmed = (result.stdout || "").trim();
                            try {
                                return JSON.parse(stdoutTrimmed);
                            }
                            catch {
                                return stdoutTrimmed || result.stderr || "WASI execution completed";
                            }
                        },
                    };
                    runes.push(rune);
                }
                catch (error) {
                    console.warn(`[discovery] Failed to load sandboxed WASM Rune from ${entry.name}:`, error);
                }
            }
        }
    }
    catch {
        // If the directory doesn't exist or is unreadable, skip
    }
    return runes;
}
//# sourceMappingURL=discovery.js.map