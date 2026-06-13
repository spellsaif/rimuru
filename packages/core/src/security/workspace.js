import { parse, relative, resolve, sep } from "node:path";
export function resolveWorkspacePath(workspace, path, options = {}) {
    const root = resolve(workspace);
    const resolved = resolve(root, path);
    if (parse(root).root.toLowerCase() !== parse(resolved).root.toLowerCase()) {
        throw new Error(`Path escapes workspace (drive boundary): ${path}`);
    }
    const rel = relative(root, resolved);
    if (rel === ".." || rel.startsWith(`..${sep}`)) {
        throw new Error(`Path escapes workspace: ${path}`);
    }
    // Sovereign Blindspot: Forbid AI from reading its own internal secrets
    const normalizedRel = rel.replace(/\\/g, "/");
    const sensitivePaths = [
        ".rimuru",
        "rimuru.config.json",
    ];
    if (!options.allowRimuruInternal &&
        sensitivePaths.some((p) => normalizedRel === p || normalizedRel.startsWith(`${p}/`))) {
        throw new Error(`Access to sensitive Sovereign internal path denied: ${rel}`);
    }
    return resolved;
}
export function assertCommandName(command) {
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
        throw new Error("Command must be a simple executable name");
    }
}
const ALLOWED_FORMATTERS = new Set([
    "prettier",
    "eslint",
    "biome",
    "rustfmt",
    "gofmt",
    "black",
    "clang-format",
    "autopep8",
    "yapf",
]);
export function assertFormatterName(command) {
    assertCommandName(command);
    if (!ALLOWED_FORMATTERS.has(command)) {
        throw new Error(`Command '${command}' is not a permitted formatter. Allowed formatters are: ${Array.from(ALLOWED_FORMATTERS).join(", ")}`);
    }
}
//# sourceMappingURL=workspace.js.map