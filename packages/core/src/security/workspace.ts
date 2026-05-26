import { relative, resolve, sep, parse } from "node:path";

export function resolveWorkspacePath(workspace: string, path: string): string {
  const root = resolve(workspace);
  const resolved = resolve(root, path);

  if (parse(root).root.toLowerCase() !== parse(resolved).root.toLowerCase()) {
    throw new Error(`Path escapes workspace (drive boundary): ${path}`);
  }

  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }

  // Sovereign Blindspot: Forbid AI from reading its own internal secrets
  const normalizedRel = rel.replace(/\\/g, "/");
  const sensitivePaths = [".rimuru/circles", ".rimuru/vault.json", "rimuru.config.json"];
  if (sensitivePaths.some(p => normalizedRel === p || normalizedRel.startsWith(`${p}/`))) {
    throw new Error(`Access to sensitive Sovereign internal path denied: ${rel}`);
  }

  return resolved;
}


export function assertCommandName(command: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
    throw new Error("Command must be a simple executable name");
  }
}
