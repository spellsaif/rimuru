export function listVessels(config) {
    const entries = Object.entries(config.vessels);
    if (entries.length === 0)
        return [runtimeVessel(config, config.vesselId || "main", true)];
    const summaries = entries.map(([name, vessel]) => summarizeVessel(config, name, vessel));
    return summaries.some((vessel) => vessel.active)
        ? summaries
        : [runtimeVessel(config, config.vesselId || "main", true), ...summaries];
}
export function activeVessel(config) {
    return listVessels(config).find((vessel) => vessel.active) ?? runtimeVessel(config, config.vesselId || "main", true);
}
function summarizeVessel(config, name, vessel) {
    return {
        name,
        active: name === config.vesselId,
        shard: vessel.shard ?? vessel.provider ?? (name === config.vesselId ? config.provider : "mock"),
        model: vessel.model ?? (name === config.vesselId ? config.model : "mock"),
        soul: vessel.soul ?? vessel.sessionId ?? (name === config.vesselId ? config.sessionId : "default"),
        vows: vessel.vows ?? vessel.allowedRisks ?? (name === config.vesselId ? config.allowedRisks : ["read"]),
        barrier: vessel.barrier ?? vessel.sandboxMode ?? (name === config.vesselId ? config.sandboxMode : "none"),
        ...(vessel.workspace ? { workspace: vessel.workspace } : {}),
    };
}
function runtimeVessel(config, name, active) {
    return {
        name,
        active,
        shard: config.provider,
        model: config.model,
        soul: config.sessionId,
        vows: config.allowedRisks,
        barrier: config.sandboxMode,
    };
}
//# sourceMappingURL=vessels.js.map