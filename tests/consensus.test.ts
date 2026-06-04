import { describe, expect, it } from "vitest";
import {
  ConsensusPermissionPolicy,
  StaticPermissionPolicy,
  ModelVoterPermissionPolicy,
  MockShard,
} from "../src/index.js";
import type { Message, AssistantResponse, Shard } from "../src/core/types.js";

describe("ConsensusPermissionPolicy", () => {
  it("allows requests when consensus thresholds are reached", async () => {
    const voter1 = new StaticPermissionPolicy({ allow: ["read", "write"] });
    const voter2 = new StaticPermissionPolicy({ allow: ["read"] });

    const policy = new ConsensusPermissionPolicy({
      voters: [voter1, voter2],
      requiredApprovals: 2,
    });

    const request = { rune: "workspace.readFile", risk: "read" as const, input: {}, workspace: "/tmp", sessionId: "s" };
    const decision = await policy.decide(request);

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain("Consensus reached");
  });

  it("denies requests when consensus thresholds are missed", async () => {
    const voter1 = new StaticPermissionPolicy({ allow: ["read", "write"] });
    const voter2 = new StaticPermissionPolicy({ allow: ["read"] }); // denies write

    const policy = new ConsensusPermissionPolicy({
      voters: [voter1, voter2],
      requiredApprovals: 2,
    });

    const request = {
      rune: "workspace.writeFile",
      risk: "write" as const,
      input: {},
      workspace: "/tmp",
      sessionId: "s",
    };
    const decision = await policy.decide(request);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Consensus failed");
    expect(decision.reason).toContain("write' is not allowed");
  });

  it("integrates ModelVoterPermissionPolicy to permit safe executions", async () => {
    class SafeVoterShard implements Shard {
      readonly name = "safe-model";
      async complete(messages: readonly Message[]): Promise<AssistantResponse> {
        return { content: JSON.stringify({ allowed: true, reason: "Command looks safe to execute" }) };
      }
    }

    const voter = new ModelVoterPermissionPolicy({ shard: new SafeVoterShard(), name: "Llama-Security" });
    const request = {
      rune: "workspace.shell",
      risk: "execute" as const,
      input: { command: "ls" },
      workspace: "/tmp",
      sessionId: "s",
    };
    const decision = await voter.decide(request);

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain("Model [Llama-Security]: Command looks safe to execute");
  });

  it("integrates ModelVoterPermissionPolicy to deny unsafe executions", async () => {
    class UnsafeVoterShard implements Shard {
      readonly name = "unsafe-model";
      async complete(messages: readonly Message[]): Promise<AssistantResponse> {
        return {
          content: '```json\n{\n  "allowed": false,\n  "reason": "Potential command injection detected"\n}\n```',
        };
      }
    }

    const voter = new ModelVoterPermissionPolicy({ shard: new UnsafeVoterShard() });
    const request = {
      rune: "workspace.shell",
      risk: "execute" as const,
      input: { command: "rm -rf /" },
      workspace: "/tmp",
      sessionId: "s",
    };
    const decision = await voter.decide(request);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Model [unsafe-model]: Potential command injection detected");
  });
});
