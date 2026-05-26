import type { PermissionDecision, PermissionPolicy, PermissionRequest, RuneRisk } from "./types.js";

export interface StaticPermissionOptions {
  readonly allow?: readonly RuneRisk[];
  readonly deny?: readonly RuneRisk[];
}

export class StaticPermissionPolicy implements PermissionPolicy {
  readonly #allow: ReadonlySet<RuneRisk>;
  readonly #deny: ReadonlySet<RuneRisk>;

  constructor(options: StaticPermissionOptions = {}) {
    this.#allow = new Set(options.allow ?? ["read"]);
    this.#deny = new Set(options.deny ?? []);
  }

  async decide(request: PermissionRequest): Promise<PermissionDecision> {
    if (this.#deny.has(request.risk)) {
      return { allowed: false, reason: `risk '${request.risk}' is explicitly denied` };
    }
    if (!this.#allow.has(request.risk)) {
      return { allowed: false, reason: `risk '${request.risk}' is not allowed` };
    }
    return { allowed: true, reason: "allowed by static policy" };
  }
}

export const readOnlyPolicy = new StaticPermissionPolicy({ allow: ["read"] });
export const trustedLocalPolicy = new StaticPermissionPolicy({ allow: ["read", "execute"] });

export type ApprovalPrompt = (request: PermissionRequest) => Promise<PermissionDecision>;

export class ApprovalPermissionPolicy implements PermissionPolicy {
  readonly #fallback: PermissionPolicy;
  readonly #prompt: ApprovalPrompt;
  readonly #sessionAllowed = new Set<string>();

  constructor(options: { readonly fallback?: PermissionPolicy; readonly prompt: ApprovalPrompt }) {
    this.#fallback = options.fallback ?? readOnlyPolicy;
    this.#prompt = options.prompt;
  }

  async decide(request: PermissionRequest): Promise<PermissionDecision> {
    const key = `${request.sessionId}:${request.rune}:${request.risk}`;
    if (this.#sessionAllowed.has(key)) return { allowed: true, reason: "approved for session" };

    const fallback = await this.#fallback.decide(request);
    if (fallback.allowed) return fallback;

    const prompted = await this.#prompt(request);
    if (prompted.allowed && prompted.reason === "approved for session") this.#sessionAllowed.add(key);
    return prompted;
  }
}

export class ConsensusPermissionPolicy implements PermissionPolicy {
  readonly #voters: readonly PermissionPolicy[];
  readonly #requiredApprovals: number;

  constructor(options: { readonly voters: readonly PermissionPolicy[]; readonly requiredApprovals?: number }) {
    this.#voters = options.voters;
    this.#requiredApprovals = options.requiredApprovals ?? options.voters.length;
  }

  async decide(request: PermissionRequest): Promise<PermissionDecision> {
    let approvals = 0;
    const reasons: string[] = [];
    
    for (const voter of this.#voters) {
      try {
        const decision = await voter.decide(request);
        if (decision.allowed) {
          approvals++;
          reasons.push(decision.reason);
        } else {
          reasons.push(`denied: ${decision.reason}`);
        }
      } catch (e: any) {
        reasons.push(`error: ${e.message}`);
      }
    }
    
    if (approvals >= this.#requiredApprovals) {
      return { allowed: true, reason: `Consensus reached (${approvals}/${this.#voters.length}): ${reasons.join("; ")}` };
    }
    return { allowed: false, reason: `Consensus failed (${approvals}/${this.#requiredApprovals} approvals): ${reasons.join("; ")}` };
  }
}
