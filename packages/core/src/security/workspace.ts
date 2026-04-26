import { relative, resolve, sep } from "node:path";

export function resolveWorkspacePath(workspace: string, path: string): string {
  const root = resolve(workspace);
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }
  return resolved;
}

export function assertCommandName(command: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
    throw new Error("Command must be a simple executable name");
  }
}
