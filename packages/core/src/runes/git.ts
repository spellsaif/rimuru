import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Rune } from "../core/types.js";

const execFileAsync = promisify(execFile);

export const gitStatusRune: Rune<Record<string, never>, { readonly status: string }> = {
  name: "git.status",
  description: "Reads porcelain git status for the workspace.",
  risk: "read",
  async invoke(_input, context) {
    return { status: await git(context.workspace, ["status", "--short", "--branch"]) };
  },
};

export const gitDiffRune: Rune<{ readonly staged?: boolean }, { readonly diff: string }> = {
  name: "git.diff",
  description: "Reads current git diff without modifying the repository.",
  risk: "read",
  inputSchema: { type: "object", properties: { staged: { type: "boolean" } } },
  async invoke(input, context) {
    return { diff: await git(context.workspace, input.staged ? ["diff", "--staged"] : ["diff"]) };
  },
};

export const gitSummaryRune: Rune<Record<string, never>, { readonly summary: string }> = {
  name: "git.summary",
  description: "Summarizes branch, status, and changed files.",
  risk: "read",
  async invoke(_input, context) {
    const status = await git(context.workspace, ["status", "--short", "--branch"]);
    const lines = status.split("\n").filter(Boolean);
    return { summary: lines.length === 0 ? "Clean working tree" : lines.join("\n") };
  },
};

export const gitLogRune: Rune<{ readonly limit?: number }, { readonly log: string }> = {
  name: "git.log",
  description: "Reads the last N commits from the history.",
  risk: "read",
  inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  async invoke(input, context) {
    return { log: await git(context.workspace, ["log", "-n", String(input.limit ?? 10), "--oneline"]) };
  },
};

export const gitAddRune: Rune<{ readonly files: readonly string[] }, { readonly status: string }> = {
  name: "git.add",
  description: "Stages files for commit.",
  risk: "write",
  inputSchema: { type: "object", required: ["files"], properties: { files: { type: "array" } } },
  async invoke(input, context) {
    await git(context.workspace, ["add", ...input.files]);
    return { status: "Files staged" };
  },
};

export const gitCommitRune: Rune<{ readonly message: string }, { readonly result: string }> = {
  name: "git.commit",
  description: "Creates a new commit with the staged changes.",
  risk: "write",
  inputSchema: { type: "object", required: ["message"], properties: { message: { type: "string" } } },
  async invoke(input, context) {
    return { result: await git(context.workspace, ["commit", "-m", input.message]) };
  },
};

export const gitPushRune: Rune<{ readonly remote?: string; readonly branch?: string }, { readonly result: string }> = {
  name: "git.push",
  description: "Pushes local commits to a remote repository.",
  risk: "network",
  inputSchema: { type: "object", properties: { remote: { type: "string" }, branch: { type: "string" } } },
  async invoke(input, context) {
    return { result: await git(context.workspace, ["push", input.remote ?? "origin", input.branch ?? "HEAD"]) };
  },
};

export const gitPullRune: Rune<{ readonly remote?: string; readonly branch?: string }, { readonly result: string }> = {
  name: "git.pull",
  description: "Pulls changes from a remote repository.",
  risk: "network",
  inputSchema: { type: "object", properties: { remote: { type: "string" }, branch: { type: "string" } } },
  async invoke(input, context) {
    return { result: await git(context.workspace, ["pull", input.remote ?? "origin", input.branch ?? "HEAD"]) };
  },
};

export const gitRunes = [
  gitStatusRune,
  gitDiffRune,
  gitSummaryRune,
  gitLogRune,
  gitAddRune,
  gitCommitRune,
  gitPushRune,
  gitPullRune,
] as const;

async function git(workspace: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...args], { cwd: workspace, maxBuffer: 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      String(error.stderr).includes("not a git repository")
    ) {
      return "Not a git repository\n";
    }
    throw error;
  }
}
