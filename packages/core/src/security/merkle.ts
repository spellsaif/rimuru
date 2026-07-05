import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export interface MerkleNode {
  readonly path: string;
  readonly hash: string;
}

export interface MerkleTree {
  readonly rootHash: string;
  readonly nodes: readonly MerkleNode[];
}

export class MerkleMismatchError extends Error {
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly branchId: string;

  constructor(branchId: string, expectedHash: string, actualHash: string) {
    super(`MerkleMismatch: branch ${branchId} has been tampered with`);
    this.name = "MerkleMismatchError";
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
    this.branchId = branchId;
  }
}

export async function computeMerkleTree(
  dir: string,
  ignoreDirs: readonly string[] = [".git", ".rimuru", "dist", "build", "node_modules"],
): Promise<MerkleTree> {
  const nodes: MerkleNode[] = [];
  await collectFiles(dir, dir, ignoreDirs, nodes);

  nodes.sort((a, b) => a.path.localeCompare(b.path));

  const combinedHash = createHash("sha256");
  for (const node of nodes) {
    combinedHash.update(node.path);
    combinedHash.update(node.hash);
  }

  return {
    rootHash: combinedHash.digest("hex"),
    nodes,
  };
}

async function collectFiles(
  root: string,
  current: string,
  ignoreDirs: readonly string[],
  nodes: MerkleNode[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(current, { withFileTypes: false });
  } catch {
    return;
  }

  for (const name of entries) {
    const fullPath = join(current, name);
    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }

    if (entryStat.isDirectory()) {
      if (ignoreDirs.includes(name)) continue;
      await collectFiles(root, fullPath, ignoreDirs, nodes);
    } else if (entryStat.isFile()) {
      const relPath = relative(root, fullPath);
      const content = await readFile(fullPath);
      const fileHash = createHash("sha256").update(content).digest("hex");
      nodes.push({ path: relPath, hash: fileHash });
    }
  }
}

export function verifyMerkleTree(tree: MerkleTree): boolean {
  const hash = createHash("sha256");
  for (const node of [...tree.nodes].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(node.path);
    hash.update(node.hash);
  }
  return hash.digest("hex") === tree.rootHash;
}

export function computeFileHash(filePath: string): Promise<string> {
  return readFile(filePath).then((content) => createHash("sha256").update(content).digest("hex"));
}
