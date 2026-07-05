# Rimuru **Tempest** — Product Requirements Document

> *"A slime that ate a storm."*
> — The codename **Tempest** marks Rimuru's evolution from a sovereign local kernel into the **federated, self-improving, multi-vessel storm** that subsumes Hermes and OpenClaw in one quiet swallow.

| | |
|---|---|
| **Document** | PRD — Rimuru **Tempest** Release (v2.0) |
| **Predecessor** | Rimuru v1.x — Local-First Sovereign Orchestration Kernel |
| **Status** | Draft · Engineering-Locked |
| **Authors** | The Sovereign Engineering Council |
| **Audience** | Core maintainers, Plugin authors, Enterprise design partners |

---

## 0. TL;DR

Today's Rimuru is the **best private agent kernel** anyone has shipped — speculative CoW workspaces, QuickJS + WASI + Docker sandboxing, dynamic Rune compilation, Vault-bound credentials, and a `Sovereign → Vessel → Rune` mental model that is genuinely original.

But it is a **single-host slime**.

**Tempest** turns it into a **federation of slimes** without losing a gram of locality. Five upgrades — and only five — separate Rimuru from being merely *the best local agent runtime* to being *the agent runtime of record*:

1. **Multi-Vessel Swarm (Great Sage)** — concurrent vessels gossiping over a local CRDT bus.
2. **Predicate**: a typed, schema-first tool protocol that retires the ReAct-regex tax.
3. **Reflective Memory** — Chronicle becomes a self-summarizing, vector + lexical hybrid graph.
4. **Verifiable Speculation** — CoW branches gain Merkle proofs and signed merges.
5. **Skill Lattice** — Runes graduate into composable, capability-typed *Skills* with a public registry.

Everything else is polish. These five make **Hermes' enterprise isolation story redundant** and **OpenClaw's "fast local loop" story obsolete**.

---

## 1. Why Tempest, Why Now

### 1.1 The State of the Slime (Today)

The current Rimuru codebase already ships:

- A **`Sovereign`** reasoning core with a typed `FlowBus` event stream (`packages/core/src/core/sovereign.ts`).
- An **`AgentLoop`** capable of **speculative execution** against CoW workspace branches (`packages/core/src/agent/agent.ts` + `security/branch.ts`).
- A **dynamic Rune compiler** for TypeScript → QuickJS WASM VM and Rust → `wasm32-wasip1` (`security/sandbox-vm.ts`, `runes/workspace.ts`).
- A **fail-closed Gate** with HMAC-SHA256 (Slack) and Ed25519 (Discord) verification (`packages/gate`).
- A **Vault** with AES-256-GCM + OS keychain binding (`packages/vault`).
- Five LLM Shards: Anthropic, Gemini, OpenAI-compatible, OpenRouter, Mock (`providers/`).
- Circles for Slack/Discord/Telegram/WhatsApp; **MCP** server bridge; **Rituals** scheduler; **Chronicle** with JSON + memory variants; **Rewind**; **Pairing**; **Permissions** with consensus + model-voter policies.
- **30+ vitest suites** including `consensus`, `speculate`, `multi-agent-swarm`, `wasm-compile`, `hardening`.

This is already more architecturally honest than any agent runtime in the open-source market.

### 1.2 What's Missing (The Honest Audit)

The five sharpest weaknesses — the ones a senior engineer notices in twenty minutes:

| # | Weakness | Where it lives today | Why it matters |
|---|---|---|---|
| **W1** | **Planner is heuristic-only.** `planObjective()` is 26 lines of `lowered.includes(...)` branches. | `planner/planner.ts` | Hermes' edge over us is its model-native planner. |
| **W2** | **Single-vessel reasoning.** `Sovereign.run()` is sequential; vessels exist as configs, not as live peers. | `core/sovereign.ts`, `vessels/vessels.ts` | OpenClaw's "fast loop" wins because we don't parallelize. |
| **W3** | **Tool-calling is text-first.** ReAct regex parsing (`ReActStreamParser`) coexists with structured calls instead of being subsumed by them. | `agent/agent.ts` | We pay a 30–60% token tax vs. native function calling. |
| **W4** | **Chronicle is append-only JSONL.** No reflective summarization, no vector recall, no decay. | `core/chronicle.ts`, `memory/semantic.ts` (stub) | Long sessions degrade linearly with context size. |
| **W5** | **Runes don't compose.** Each Rune is its own island; no typed pipes, no public registry, no reproducible builds. | `core/runes.ts` | The community can't ship Rimuru-native libraries; we can't either. |

Tempest exists to delete this table.

---

## 2. Product Vision

> **Rimuru Tempest is the first agent runtime that is local by default, federated by design, and self-improving by construction.**

Three first principles, in priority order:

1. **Sovereignty is non-negotiable.** Nothing ships that requires a cloud account. The user owns the model, the memory, the keys, and the trace.
2. **The kernel must be smaller than the thing it runs.** Tempest adds capability without adding cognitive surface. If a feature can't be explained in one paragraph using existing vocabulary (Sovereign / Vessel / Rune / Vow / Chronicle / Vault / Circle / Barrier), it doesn't ship.
3. **Lazy elegance.** Every line of new code must replace ≥2 lines elsewhere, or remove ≥1 class of bug, or unlock a capability that was previously impossible. No exceptions, no "while we're here."

---

## 3. Competitive Positioning

| Capability | **Rimuru Tempest** | Hermes Agent | OpenClaw |
|---|---|---|---|
| Primary philosophy | **Federated local-first sovereignty** | Hardened enterprise isolation | Fast local automation |
| Tool calling | **Predicate**: typed, schema-first, regex-free | Native function calling | Native function calling |
| Sandboxing | QuickJS + WASI + Docker + **rootless Firecracker (new)** | Micro-VM only | Micro-VM only |
| Dynamic tool synthesis | TS → QuickJS · Rust → WASI · **Python → Pyodide (new)** | ✗ static only | ✗ static only |
| Speculative execution | CoW branches + **Merkle-signed merges (new)** | ✗ | partial |
| Concurrency model | **N-vessel swarm with CRDT gossip (new)** | single-tenant per VM | single loop |
| Memory | **Hybrid lexical + vector + reflective Chronicle (new)** | LLM-cache only | stateless |
| Plugin ecosystem | **Skill Lattice** with signed registry (new) | closed | closed |
| Transport bridges | Slack · Discord · Telegram · WhatsApp · MCP · **Matrix · IRC · email (new)** | Slack only | webhooks only |
| Voice | `packages/voice` exists — **promoted to first-class duplex (new)** | ✗ | ✗ |
| Licensing | MIT, sovereign | proprietary | source-available |

**The thesis**: Hermes wins on isolation rigor, OpenClaw wins on minimalism. Tempest is the **only** runtime that wins on *both axes simultaneously*, because federation lets us scale isolation horizontally instead of vertically.

---

## 4. Functional Requirements — The Five Pillars

### 4.1 Pillar I — **Great Sage**: Multi-Vessel Swarm

**Problem**: One `Sovereign` instance, one reasoning loop, one bottleneck.

**Solution**: Promote `Vessel` from a configuration record to a **live peer**. Vessels run in worker threads, share a **CRDT-backed Chronicle view**, and gossip via a typed bus over local UDS (Unix Domain Socket) or named pipes on Windows.

**Behavior**:
- A `Swarm` is declared in `rimuru.config.json` as `{ vessels: [{ name, shard, vows, role }], topology: "star" | "mesh" | "ring" }`.
- Each Vessel exposes a typed inbox: `vessel.ask(target, message): Promise<reply>`.
- Conflict-free merges of Chronicle writes use a Y.js-style CRDT keyed by `(sessionId, vesselId, logicalClock)`.
- The Sovereign retains the **executive role**: it ratifies plans, but delegation is free.

**Acceptance**:
- `tests/multi-agent-swarm.test.ts` (already present) is upgraded from coordination-of-configs to coordination-of-processes.
- A 4-vessel swarm completes the demo objective ("refactor `index.ts` into 3 modules with passing tests") in **≤ 60% of the wall-clock time** of the single-vessel baseline on identical hardware.
- No vessel sees another vessel's Vault entries — verified by a new `tests/swarm-isolation.test.ts`.

**Out of scope**: cross-machine swarms. Tempest is *local* federation. Cross-machine is a v3 conversation.

---

### 4.2 Pillar II — **Predicate**: A Typed Tool Protocol

**Problem**: The current loop straddles two worlds — `ReActStreamParser` (regex on `Thought:`/`Action:` text) and native function calling. The straddle costs tokens, latency, and correctness.

**Solution**: **Predicate**, a single tool-invocation protocol:

```ts
interface Predicate<I, O> {
  readonly id: string;                 // e.g. "workspace.editFile"
  readonly vow: Vow;                   // read | write | execute | network
  readonly input: ZodSchema<I>;        // already half-built in core/schema.ts
  readonly output: ZodSchema<O>;
  readonly cost: { tokens?: number; ms?: number; barrier: Barrier };
  readonly invoke(input: I, ctx: RuneContext): Promise<O>;
}
```

- **Providers that support function calling** (OpenAI, Anthropic, Gemini) receive Predicates as native JSON-schema tools.
- **Providers that don't** (Ollama on older models, OpenRouter free tier) get a **Predicate-shim**: a deterministic JSON-only grammar enforced by constrained decoding where available, or a minimal structured prompt otherwise.
- The ReAct regex parser is retained **only** as a fallback for unknown providers and is silently deprecated.

**Acceptance**:
- 100% of the existing Runes (`workspace.*`, `git.*`, `circle.*`, `web.*`, `vessels.*`) re-expressed as Predicates with no behavioral diff (golden traces in `tests/fixtures/`).
- Median tokens-per-step on the standard refactor benchmark drops **≥ 35%**.
- A `rimuru predicate doctor` command verifies every registered Predicate's schemas round-trip.

---

### 4.3 Pillar III — **Reflective Chronicle**

**Problem**: `JsonChronicle` writes JSONL forever. Sessions over ~50 turns get expensive, lossy, or both.

**Solution**: The Chronicle becomes a **tiered, self-summarizing memory**:

| Tier | Storage | Lifetime | Access |
|---|---|---|---|
| **Hot** | in-memory ring buffer | last N turns | O(1) |
| **Warm** | JSONL on disk (existing) | session lifetime | O(log n) lexical index (already in `indexer/`) |
| **Cold** | SQLite + sqlite-vec embeddings | persistent | hybrid BM25 + vector recall |
| **Crystal** | LLM-generated reflective summaries, signed and immutable | persistent | retrieved by topic key |

- **Reflection** runs as a *Ritual* (we already have the scheduler — `rituals/rituals.ts`). Every N turns or T minutes, a low-cost Shard distills the recent hot/warm window into a Crystal entry.
- **Recall** is unified behind `chronicle.recall(query, budget): Message[]` — the Sovereign never has to think about tiers.

**Acceptance**:
- A 500-turn synthetic session uses **≤ 12k tokens of context** at any point (vs. linear today).
- Recall precision@5 on the `tests/semantic-memory.test.ts` benchmark ≥ 0.85.
- All four tiers are pluggable: replacing the cold tier with Chroma or LanceDB is a one-file change.

---

### 4.4 Pillar IV — **Verifiable Speculation**

**Problem**: CoW branches today are honest but unverifiable — there's no cryptographic proof that the branch you merged is the branch the speculative runner actually tested.

**Solution**: Every CoW branch gains:
- A **Merkle tree** over its file contents, computed lazily on first access.
- A **signed merge envelope**: when speculation succeeds, the Sovereign emits `{ branchId, rootHash, tests: [...], signedBy: vesselId }`, signed with an Ed25519 key derived from the Vault.
- A **two-key merge** option (`policy.merge = "consensus"`) requiring N-of-M vessel signatures before the branch lands on master.

**Acceptance**:
- `tests/speculate.test.ts` extended with tamper-detection cases — flipping a byte in a branch before merge produces a hard failure with a `MerkleMismatch` error.
- `rimuru trace replay <branchId>` reconstructs the exact pre-merge tree from disk + signatures.

**Why this kills Hermes' pitch**: Hermes' selling point is "you can trust the VM boundary." Ours becomes "you can *prove* what crossed the boundary." Proof beats trust.

---

### 4.5 Pillar V — **Skill Lattice** — Runes That Compose

**Problem**: Runes today are leaves. There is no `skill.compose(a, b)`, no public registry, no semver, no reproducible build artifact.

**Solution**: Promote the existing `skills/registry.ts` into a **lattice**:

- A **Skill** is a *bundle* of Predicates + an optional Soul fragment + a manifest (`skill.json`) declaring `vows`, `inputs`, `outputs`, `peerSkills`, and `version`.
- A Skill can declare **typed pipes**: `git.diff → workspace.editFile` is expressible as a single composed Skill called `git.applyPatch`.
- The Lattice ships with a **content-addressed registry** (`rimuru skill publish` → CID), default-pointed at a community federation; private registries are first-class.
- Every published Skill carries an **SBOM** and a signature derivable from its source tree — reproducible builds are not optional.

**Acceptance**:
- The existing `examples/plugin-tempest` is rewritten as the **reference Skill** and published to the local registry as part of `pnpm build`.
- `rimuru skill install <cid>` works fully offline against a mirrored registry.
- A new test `tests/skill-lattice.test.ts` proves that composed Skills inherit the strictest Vow of their constituents (fail-closed by default).

---

## 5. Non-Functional Requirements

| Concern | Target | Method |
|---|---|---|
| **Cold-start time** | `rimuru chat` to first token ≤ **500 ms** on M-series Mac, ≤ 1.2 s on commodity Linux | lazy-load all Shards; defer indexer; precompile QuickJS instance pool |
| **Memory footprint** | Idle Sovereign ≤ **120 MB RSS** | swap the JSON Chronicle's in-RAM cache for a bounded LRU; share QuickJS runtime across Vessels |
| **Sandboxed Rune startup** | QuickJS Rune cold-call ≤ **50 ms**; WASI Rust Rune ≤ **150 ms** after first compile | maintain a warm QuickJS pool; cache `.wasm` artifacts in `.rimuru/cache/runes/` keyed by source SHA-256 |
| **LLM concurrency** | 8 in-flight Predicate calls per Shard without head-of-line blocking | per-Shard async queue + backpressure surfaced on the FlowBus |
| **Security posture** | Zero plain-text secret ever touches process memory of any Vessel | enforce Vault-resolved environment injection only inside Predicate boundaries |
| **Determinism** | Identical input + identical seed → identical Chronicle entry | record `(modelHash, temperature, seed, predicateBundleHash)` in every assistant message |
| **Observability** | 100% of kernel events visible on `rimuru flow` | already true via `FlowBus`; extend to swarm events |
| **Test discipline** | Tempest ships with **≥ 80% line coverage** on `packages/core` | Vitest + `c8`; gate in `.github/workflows` |
| **Supply chain** | Every published Skill verifiable from source | SLSA Level 2 attestations baked into `pnpm publish:skill` |

---

## 6. User Experience

### 6.1 The Three Surfaces

Tempest commits to **three** surfaces and *only* three. Anything else is a Skill or a Circle.

1. **CLI (`rimuru`)** — the canonical surface. Every capability is reachable here first.
2. **TUI (`rimuru chat` / `rimuru tui`)** — Ink-based split-pane: chat · thought · diff · flow.
3. **Web Canvas (`apps/web`)** — a quiet, read-mostly dashboard for diffs, traces, and skill management. Never the primary input surface.

Voice (`packages/voice`) is promoted to a **transport**, not a surface — it speaks *through* the CLI/TUI/Canvas.

### 6.2 Onboarding

The 60-second path from `git clone` to first thought:

```bash
pnpm install && pnpm build
rimuru awaken              # interactive wizard — pick shard, barrier, vows
rimuru vault set OPENROUTER_API_KEY sk-...
rimuru chat "Summarize this repo in 3 bullets."
```

Tempest adds **`rimuru awaken --tempest`** which additionally provisions:
- a 2-vessel swarm (`scholar` + `artisan`),
- the reflective Chronicle (all four tiers),
- the local Skill registry mirror.

### 6.3 The Mental Model — Unchanged

The vocabulary that worked in v1 stays. We add **only two** new words, both already implicit:

- **Swarm** — a set of cooperating Vessels under one Sovereign.
- **Predicate** — a typed Rune contract. (Runes still exist; a Predicate is "a Rune that filed its taxes.")

If we ever introduce a third new word, this PRD has failed.

---

## 7. Architecture Delta

```ascii
┌──────────────────────────────────────────────────────────────────┐
│                      COMMUNICATION LAYER (CIRCLES)               │
│   Slack · Discord · Telegram · WhatsApp · Matrix · IRC · Email   │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                THE GATE (SOVEREIGN GATEWAY · unchanged)          │
│       Pairing · Encryption · SSE · Webhook signature gate        │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  THE SOVEREIGN (executive role)                  │
│      Plan · Ratify · Delegate · Merge · Sign                     │
└──────┬─────────────────┬───────────────────────┬─────────────────┘
       │                 │                       │
  ┌────▼────┐       ┌────▼────┐             ┌────▼────┐    ◄── NEW: SWARM
  │ Vessel  │ ◄───► │ Vessel  │ ◄─CRDT────► │ Vessel  │        worker-thread peers
  │ Scholar │       │ Artisan │             │ Sentinel│        on a typed gossip bus
  └────┬────┘       └────┬────┘             └────┬────┘
       │                 │                       │
       ▼                 ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                PREDICATES  (Typed Rune Protocol)                 │
│   workspace.* · git.* · circle.* · web.* · skill.*               │
└──────┬────────────────────────────┬──────────────────────────────┘
       │                            │
       ▼                            ▼
┌────────────────────┐     ┌────────────────────────────────────────┐
│   SANDBOXES        │     │   REFLECTIVE CHRONICLE   ◄── NEW       │
│  QuickJS · WASI    │     │   Hot · Warm · Cold (vec) · Crystal    │
│  Docker · Firecrkr │     └────────────────────────────────────────┘
│  Pyodide (new)     │
└────────┬───────────┘     ┌────────────────────────────────────────┐
         │                 │   VAULT  (unchanged)                   │
         ▼                 │   AES-256-GCM · OS Keychain            │
┌────────────────────┐     └────────────────────────────────────────┘
│  COW WORKSPACE     │
│  + MERKLE PROOFS   │     ┌────────────────────────────────────────┐
│  + SIGNED MERGES   │     │   SKILL LATTICE  ◄── NEW               │
│  ◄── HARDENED      │     │   Compose · Publish · Verify (SLSA)    │
└────────────────────┘     └────────────────────────────────────────┘
```

The four boxes marked `NEW` or `HARDENED` are the entire delta. Everything else is preserved verbatim.

---

## 8. Migration & Compatibility

- **`rimuru.config.json` is backward-compatible.** A v1 config boots Tempest into single-vessel mode with the reflective Chronicle disabled.
- **All v1 CLI commands keep their names and flags.** New behavior is opt-in via `--swarm`, `--reflect`, `--predicate`.
- **Runes from v1 keep working.** A Rune without a Predicate manifest is wrapped in a generated one at load time, with `vow` defaulted to its `risk` field and inputs inferred from existing `inputSchema`.
- **Chronicles from v1 are auto-migrated** on first read into Warm tier; Crystal summaries are generated lazily.

A v1 user who never edits a config sees **strictly better performance** and no breakage.

---

## 9. Rollout Plan

| Phase | Weeks | Deliverable | Gate |
|---|---|---|---|
| **T-0 · Foundations** | 1–2 | Predicate protocol + Rune→Predicate adapter; all tests green | 100% existing tests pass; ≥35% token reduction on bench |
| **T-1 · Memory** | 3–4 | Reflective Chronicle with all four tiers; `chronicle.recall()` | precision@5 ≥ 0.85; 500-turn bench ≤ 12k ctx |
| **T-2 · Speculation+** | 5 | Merkle + signed merges; tamper tests | new `MerkleMismatch` path covered |
| **T-3 · Swarm** | 6–8 | Multi-vessel worker threads + CRDT gossip; isolation tests | swarm refactor bench ≤ 60% of solo wall-clock |
| **T-4 · Lattice** | 9–10 | Skill manifest, content-addressed registry, `tempest` example as canonical Skill | `skill install` works offline |
| **T-5 · Polish** | 11 | Docs, `awaken --tempest`, migration runbook, perf passes | cold-start ≤ 500 ms (Mac) |
| **T-6 · GA** | 12 | Tag `v2.0.0-tempest`; release blog post | green dashboard for 7 consecutive days on `main` |

Each phase is shippable. If any phase is dropped, the previous one is still a clean release.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| QuickJS pool memory creep under swarm load | M | M | hard per-VM RSS cap; recycle VMs every N invocations |
| CRDT chronicle introduces merge ambiguity surprising to users | M | H | every merge is *also* a Crystal-tier entry, human-readable; `rimuru chronicle inspect <hash>` |
| Reflective summarization hallucinates and pollutes memory | M | H | summaries are *additive* — originals are never deleted; recall always considers both |
| Skill registry becomes a supply-chain target | L | H | mandatory signatures; SLSA L2; capability declarations enforced at install, not at runtime |
| "Two more new words" syndrome — vocabulary creep | H | M | this PRD is the gate; any future doc adding a noun must justify it here first |
| Predicate adoption is incomplete in community Runes | M | L | v1 Runes auto-wrapped; Predicate is *preferred*, not *required* |

---

## 11. Success Metrics

Measured 90 days post-GA:

1. **Performance**: median refactor benchmark wall-clock ≤ 60% of v1.7.
2. **Cost**: median tokens/objective ≤ 65% of v1.7.
3. **Adoption**: ≥ 100 community-published Skills on the federated registry.
4. **Reliability**: ≥ 99.5% of CoW merges land without a Merkle mismatch.
5. **Sovereignty**: zero issues filed alleging unintended outbound network calls from Vessels.
6. **Comparative**: in a blind side-by-side benchmark against Hermes and OpenClaw on the standard agent-eval suite (SWE-bench Lite + Terminal-Bench Local), Tempest places **first overall and first on cost-adjusted score**.

The last metric is the only one that matters externally. The first five are the only ones that matter internally.

---

## 12. Out of Scope (Intentional)

- Cross-machine swarms (v3).
- A hosted SaaS control plane (never — it would invert the philosophy).
- A proprietary model. Shards stay BYO.
- A new GUI framework. Web Canvas stays Next.js + Tailwind. Period.
- Mobile clients. We have Circles; the phone is a Circle, not a surface.

---

## 13. Appendix — The One-Paragraph Pitch

> Rimuru Tempest is a local-first AI orchestration kernel that runs a federation of cooperating reasoning Vessels on your laptop. Each Vessel is sandboxed, vowed, and Vault-bound. They share a self-summarizing Chronicle, compile and compose typed Skills on the fly, and write to your workspace only through speculative copy-on-write branches whose merges carry cryptographic proof of what was tested. It speaks Slack, Discord, Telegram, WhatsApp, MCP, and your microphone. It costs zero dollars to run, leaks zero bytes to the cloud, and ships under MIT. Hermes is more isolated. OpenClaw is faster to start. Tempest is both, plus everything else.

---

*Document ends. The code begins.*
