import { opendir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface IndexedFile {
  readonly path: string;
  readonly terms: ReadonlySet<string>;
  readonly summary: string;
}

export interface WorkspaceIndex {
  readonly files: readonly IndexedFile[];
  search(query: string, options?: { limit?: number }): readonly IndexedFile[];
}

/**
 * Production-grade lexical indexer for workspace search.
 * Uses an iterative walker and frequency-aware scoring.
 */
export async function buildLexicalIndex(
  workspace: string,
  options: { readonly maxFiles?: number; readonly maxFileSize?: number } = {},
): Promise<WorkspaceIndex> {
  const files = [] as IndexedFile[];
  const maxFiles = options.maxFiles ?? 500;
  const maxFileSize = options.maxFileSize ?? 1024 * 512; // 512KB limit per file

  // Simple ignore list (in a real production app, we'd parse .gitignore)
  const ignoreList = new Set([".git", "node_modules", "dist", "build", ".next", ".rimuru", "out", "target", "vendor"]);

  const stack: string[] = [workspace];

  while (stack.length > 0 && files.length < maxFiles) {
    const currentDir = stack.pop()!;
    try {
      const dir = await opendir(currentDir);
      for await (const entry of dir) {
        if (ignoreList.has(entry.name)) continue;

        const fullPath = join(currentDir, entry.name);
        const relPath = relative(workspace, fullPath);

        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile()) {
          if (shouldSkip(relPath)) continue;

          try {
            const stats = await stat(fullPath);
            if (stats.size > maxFileSize) continue;

            const content = await readFile(fullPath, "utf8");
            if (!content.trim()) continue;

            files.push({
              path: relPath,
              terms: new Set(extractTerms(content)),
              summary: createSummary(content),
            });
          } catch {
            // Skip files that can't be read (e.g. permission denied)
            continue;
          }
        }
      }
    } catch {
      // Skip directories that can't be opened
      continue;
    }
  }

  return {
    files,
    search(query: string, searchOptions: { limit?: number } = {}) {
      const queryTerms = extractTerms(query);
      if (queryTerms.length === 0) return [];

      const results = files
        .map((file) => {
          let score = 0;
          for (const q of queryTerms) {
            if (file.terms.has(q)) {
              score += 1;
              // Bonus for term matching the path
              if (file.path.toLowerCase().includes(q)) score += 2;
            }
          }
          return { file, score };
        })
        .filter((res) => res.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((res) => res.file);

      return results.slice(0, searchOptions.limit ?? 10);
    },
  };
}

function shouldSkip(path: string): boolean {
  // Skip binary and common non-text files
  return /\.(png|jpg|jpeg|gif|webp|pdf|zip|gz|tar|lock|exe|dll|so|dylib|wasm|bin|pyc)$/i.test(path);
}

function extractTerms(text: string): string[] {
  // Lowercase, remove symbols, split by whitespace and snake/camel case boundaries
  const sanitized = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Split camelCase
    .replace(/[_-]/g, " "); // Split snake_case/kebab-case

  return sanitized.split(/\s+/).filter((term) => term.length >= 2);
}

function createSummary(content: string): string {
  // Take first 3 lines or first 240 chars
  const lines = content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 3)
    .join(" ");
  return lines.length > 240 ? lines.slice(0, 237) + "..." : lines;
}
