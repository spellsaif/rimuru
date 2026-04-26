import { relative, resolve, sep } from "node:path";

export function resolveWorkspacePath(workspace: string, path: string): string {
  const root = resolve(workspace);
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }

  // Sovereign Blindspot: Forbid AI from reading its own internal secrets
  const sensitivePaths = [".rimuru/circles", ".rimuru/vault.json", "rimuru.config.json"];
  if (sensitivePaths.some(p => rel === p || rel.startsWith(`${p}${sep}`))) {
    throw new Error(`Access to sensitive Sovereign internal path denied: ${rel}`);
  }

  return resolved;
}


export function assertCommandName(command: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
    throw new Error("Command must be a simple executable name");
  }
}
