import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  AgentLoop,
  MemoryChronicle,
  MockShard,
  RuneRegistry,
  Sovereign,
  workspaceRune,
  createWorkspaceBranch,
  mergeWorkspaceBranch,
  deleteWorkspaceBranch,
  computeMerkleTree,
  checkMerkleIntegrity,
  MerkleMismatchError,
  createMergeEnvelope,
  verifyAndMergeWorkspaceBranch,
} from "../src/index.js";

describe("AgentLoop speculative branching", () => {
  it("spawns a speculative execution branch, copies history, runs loop on branched workspace, and allows merging back", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-speculate-"));
    try {
      // 1. Set up parent workspace files
      const aPath = join(root, "a.txt");
      await writeFile(aPath, "initial content", "utf8");

      // 2. Set up runes registry and sovereign loop
      const registry = new RuneRegistry();
      registry.register(workspaceRune);

      const chronicle = new MemoryChronicle();
      // Pre-populate parent session history
      await chronicle.append("parent-session", [
        { role: "user", content: "hello world", createdAt: new Date() },
        { role: "assistant", content: "hello parent", createdAt: new Date() },
      ]);

      const loop = new AgentLoop({
        sovereign: new Sovereign({ shard: new MockShard(), chronicle }),
        runes: registry,
        workspace: root,
        sessionId: "parent-session",
        chronicle,
      });

      // 3. Run speculation
      const childSessionId = "speculative-session-1";
      const result = await loop.speculate("write a test file inside speculative branch", childSessionId);

      // Verify chronicle was copied to the child session
      const childHistory = await chronicle.load(childSessionId);
      expect(childHistory.length).toBeGreaterThanOrEqual(2);
      expect(childHistory[0]?.content).toBe("hello world");
      expect(childHistory[1]?.content).toBe("hello parent");

      // Verify workspace branching directory exists
      const branchDir = join(root, ".rimuru", "branches", childSessionId);
      expect(existsSync(branchDir)).toBe(true);

      // Verify the parent workspace file exists in the branch
      const branchedFile = join(branchDir, "a.txt");
      expect(existsSync(branchedFile)).toBe(true);
      expect(await readFile(branchedFile, "utf8")).toBe("initial content");

      // Let's create a change in the speculative branch to simulate work done by speculation
      const bPathInBranch = join(branchDir, "speculate_out.txt");
      await writeFile(bPathInBranch, "speculative changes", "utf8");

      // Verify that before merging, the parent workspace doesn't have the speculative file
      expect(existsSync(join(root, "speculate_out.txt"))).toBe(false);

      // 4. Merge changes back to master workspace
      await mergeWorkspaceBranch(root, childSessionId);

      // Verify merged file exists in the master workspace
      const mergedFile = join(root, "speculate_out.txt");
      expect(existsSync(mergedFile)).toBe(true);
      expect(await readFile(mergedFile, "utf8")).toBe("speculative changes");

      // 5. Clean up speculative branch
      await deleteWorkspaceBranch(root, childSessionId);
      expect(existsSync(branchDir)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects tampering via Merkle mismatch when a byte is flipped in a branch before merge", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-merkle-"));
    try {
      await writeFile(join(root, "important.txt"), "original content", "utf8");

      const branchId = "merkle-branch-1";

      // Create branch and compute Merkle root
      const dir = await createWorkspaceBranch(root, branchId);
      const tree1 = await computeMerkleTree(dir);
      expect(tree1.rootHash).toBeTruthy();
      expect(tree1.nodes.length).toBeGreaterThan(0);

      // Modify a file in the branch (simulating work)
      await writeFile(join(dir, "important.txt"), "modified by speculation", "utf8");

      // Compute new Merkle root after modification
      const tree2 = await computeMerkleTree(dir);
      expect(tree2.rootHash).not.toBe(tree1.rootHash);

      // Simulate tampering: flip a byte
      const content = await readFile(join(dir, "important.txt"), "utf8");
      const tampered = content.replace("modified", "MODIFIED");
      await writeFile(join(dir, "important.txt"), tampered, "utf8");

      // Verification should detect the tamper
      await expect(checkMerkleIntegrity(root, branchId, tree2.rootHash)).rejects.toThrow(MerkleMismatchError);

      // Clean up
      await deleteWorkspaceBranch(root, branchId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates and verifies a merge envelope", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-envelope-"));
    try {
      await writeFile(join(root, "data.txt"), "test data", "utf8");

      const branchId = "envelope-branch";
      const dir = await createWorkspaceBranch(root, branchId);
      const tree = await computeMerkleTree(dir);

      const envelope = await createMergeEnvelope({
        branchId,
        rootHash: tree.rootHash,
        tests: ["test-1", "test-2"],
        signedBy: "test-vessel",
        signingKey: "test-signing-key",
      });

      expect(envelope.branchId).toBe(branchId);
      expect(envelope.rootHash).toBe(tree.rootHash);
      expect(envelope.tests).toEqual(["test-1", "test-2"]);
      expect(envelope.signedBy).toBe("test-vessel");
      expect(envelope.signature).toBeTruthy();

      // Merge with envelope verification should succeed (unsigned policy)
      await verifyAndMergeWorkspaceBranch(root, branchId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
