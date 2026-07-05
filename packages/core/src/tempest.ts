import type { RuntimeConfig, VesselConfig } from "./config/runtime-config.js";

export interface TempestConfig {
  readonly enablePredicates: boolean;
  readonly enableReflectiveChronicle: boolean;
  readonly enableVerifiableSpeculation: boolean;
  readonly enableGreatSageSwarm: boolean;
  readonly enableSkillLattice: boolean;
  readonly swarmTopology?: "star" | "mesh" | "ring";
  readonly latticeRegistryDir?: string;
}

export function defaultTempestConfig(): TempestConfig {
  return {
    enablePredicates: true,
    enableReflectiveChronicle: true,
    enableVerifiableSpeculation: true,
    enableGreatSageSwarm: false,
    enableSkillLattice: true,
    latticeRegistryDir: ".rimuru/registry",
  };
}

export function applyTempestConfig(
  base: Record<string, unknown>,
  tempest: Partial<TempestConfig>,
): Record<string, unknown> {
  const cfg = { ...base };

  if (tempest.enablePredicates !== false) {
    cfg.enablePredicates = true;
  }

  if (tempest.enableReflectiveChronicle !== false) {
    cfg.memoryDir = cfg.memoryDir ?? ".rimuru/memory";
    cfg.enableReflectiveChronicle = true;
  }

  if (tempest.enableVerifiableSpeculation !== false) {
    cfg.enableVerifiableSpeculation = true;
  }

  if (tempest.enableGreatSageSwarm) {
    cfg.swarmTopology = tempest.swarmTopology ?? "star";
    if (!cfg.vessels || typeof cfg.vessels !== "object") {
      cfg.vessels = {};
    }
  }

  if (tempest.enableSkillLattice !== false) {
    cfg.latticeRegistryDir = tempest.latticeRegistryDir ?? ".rimuru/registry";
    cfg.enableSkillLattice = true;
  }

  return cfg;
}

export function describeTempestFeature(feature: string): string {
  const descriptions: Record<string, string> = {
    predicates: "Predicate Protocol — type-safe tool interface with native FC support",
    reflectiveChronicle: "Reflective Chronicle — 4-tier memory with hot/warm/cold/crystal stores",
    verifiableSpeculation: "Verifiable Speculation — Merkle tree integrity + signed merge envelopes",
    greatSageSwarm: "Great Sage Multi-Vessel Swarm — CRDT gossip bus with thread-isolated workers",
    skillLattice: "Skill Lattice — composable content-addressed skill registry with SBOM",
  };
  return descriptions[feature] ?? feature;
}
