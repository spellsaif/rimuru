import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface BranchOptions {
  readonly ignoreDirs?: readonly string[];
  readonly symlinkDirs?: readonly string[];
}

const defaultOptions: BranchOptions = {
  ignoreDirs: [".git", ".rimuru", "dist", "build", "node_modules"],
  symlinkDirs: ["node_modules"],
};

/**
 * Creates a lightweight branch of the workspace by copying source files and symlinking large dependencies.
 */
export async function createWorkspaceBranch(
  workspace: string,
  branchId: string,
  options: BranchOptions = defaultOptions,
): Promise<string> {
  const root = resolve(workspace);
  const branchDir = resolve(root, ".rimuru", "branches", branchId);

  // Clean up if it already exists
  await rm(branchDir, { recursive: true, force: true });
  await mkdir(branchDir, { recursive: true });

  await copyDirRecursive(root, branchDir, root, branchDir, options);

  return branchDir;
}

/**
 * Deletes a workspace branch safely.
 */
export async function deleteWorkspaceBranch(workspace: string, branchId: string): Promise<void> {
  const branchDir = resolve(workspace, ".rimuru", "branches", branchId);
  await rm(branchDir, { recursive: true, force: true });
}

/**
 * Merges changes from the branch back to the master workspace.
 */
export async function mergeWorkspaceBranch(
  workspace: string,
  branchId: string,
  options: BranchOptions = defaultOptions,
): Promise<readonly string[]> {
  const root = resolve(workspace);
  const branchDir = resolve(root, ".rimuru", "branches", branchId);
  if (!existsSync(branchDir)) throw new Error(`Branch directory does not exist: ${branchDir}`);

  const mergedFiles: string[] = [];
  await mergeDirRecursive(branchDir, root, branchDir, root, options, mergedFiles);
  return mergedFiles;
}

async function copyDirRecursive(
  src: string,
  dest: string,
  srcRoot: string,
  destRoot: string,
  options: BranchOptions,
): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });

  const tasks = entries.map(async (entry) => {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (options.ignoreDirs?.includes(entry.name)) {
        if (options.symlinkDirs?.includes(entry.name)) {
          // Symlink heavy dependency directories to keep compilation operational
          try {
            await symlink(srcPath, destPath, "dir");
          } catch (err) {
            // Fallback to copying if symlinking fails
            await cp(srcPath, destPath, { recursive: true });
          }
        }
        return;
      }

      await mkdir(destPath, { recursive: true });
      await copyDirRecursive(srcPath, destPath, srcRoot, destRoot, options);
    } else if (entry.isFile()) {
      await cp(srcPath, destPath);
    }
  });

  await Promise.all(tasks);
}

async function mergeDirRecursive(
  src: string,
  dest: string,
  srcRoot: string,
  destRoot: string,
  options: BranchOptions,
  mergedFiles: string[],
): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });

  const tasks = entries.map(async (entry) => {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (options.ignoreDirs?.includes(entry.name)) {
        return;
      }
      await mkdir(destPath, { recursive: true });
      await mergeDirRecursive(srcPath, destPath, srcRoot, destRoot, options, mergedFiles);
    } else if (entry.isFile()) {
      // Check if file is new or modified
      let shouldCopy = false;
      if (!existsSync(destPath)) {
        shouldCopy = true;
      } else {
        const srcStat = await stat(srcPath);
        const destStat = await stat(destPath);
        if (srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size) {
          shouldCopy = true;
        }
      }

      if (shouldCopy) {
        await cp(srcPath, destPath);
        mergedFiles.push(resolve(destPath));
      }
    }
  });

  await Promise.all(tasks);
}
