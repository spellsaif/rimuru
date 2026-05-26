import { describe, expect, it } from "vitest";
import { ConsensusPermissionPolicy, StaticPermissionPolicy } from "../src/index.js";

describe("ConsensusPermissionPolicy", () => {
  it("allows requests when consensus thresholds are reached", async () => {
    const voter1 = new StaticPermissionPolicy({ allow: ["read", "write"] });
    const voter2 = new StaticPermissionPolicy({ allow: ["read"] });
    
    const policy = new ConsensusPermissionPolicy({
      voters: [voter1, voter2],
      requiredApprovals: 2
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
      requiredApprovals: 2
    });

    const request = { rune: "workspace.writeFile", risk: "write" as const, input: {}, workspace: "/tmp", sessionId: "s" };
    const decision = await policy.decide(request);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Consensus failed");
    expect(decision.reason).toContain("write' is not allowed");
  });
});
