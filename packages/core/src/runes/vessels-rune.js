import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { isRisk, runAgentTurn } from "../runtime/runtime.js";
import { AgentLoop } from "../agent/agent.js";
export const spawnVesselRune = {
    name: "vessels.spawn",
    description: "Spawns a local child Vessel agent with restricted vows to perform a sub-task autonomously.",
    risk: "execute",
    inputSchema: {
        type: "object",
        required: ["soul", "vows", "objective"],
        properties: {
            soul: { type: "string" },
            vows: { type: "array" },
            objective: { type: "string" },
        },
    },
    outputSchema: {
        type: "object",
        required: ["sessionId", "response"],
        properties: {
            sessionId: { type: "string" },
            response: { type: "string" },
        },
    },
    async invoke(input, context) {
        const parentConfig = await loadRuntimeConfig({ workspace: context.workspace });
        // Validate that the child's vows (allowed risks) do not exceed parent's vows
        const parentVows = new Set(parentConfig.allowedRisks);
        for (const vow of input.vows) {
            if (!isRisk(vow)) {
                throw new Error(`Invalid risk/vow requested: ${vow}`);
            }
            if (!parentVows.has(vow)) {
                throw new Error(`Permission escalation denied: Child requested vow '${vow}' which is not allowed by parent`);
            }
        }
        // Construct a unique child session ID prefixed with parent session ID
        const childSessionId = `${context.sessionId}:child-${Math.random().toString(36).substring(2, 10)}`;
        // Save metadata about this child session (soul and vows) so we can resume/delegate later
        const childMetaPath = join(parentConfig.memoryDir, `${childSessionId.replace(/[^a-zA-Z0-9._-]/g, "_")}.meta.json`);
        await mkdir(dirname(childMetaPath), { recursive: true });
        await writeFile(childMetaPath, JSON.stringify({ soul: input.soul, vows: input.vows }, null, 2), "utf8");
        const childVesselId = `child-${Math.random().toString(36).substring(2, 10)}`;
        const childConfig = {
            ...parentConfig,
            vesselId: childVesselId,
            allowedRisks: input.vows,
            sessionId: childSessionId,
        };
        const result = await runAgentTurn({
            config: childConfig,
            workspace: context.workspace,
            objective: input.objective,
            sessionId: childSessionId,
            systemPrompt: input.soul,
            flowBus: context.registry?.flowBus, // If flowBus is passed
        });
        return {
            sessionId: childSessionId,
            response: result.final.response.content,
        };
    },
};
export const delegateVesselRune = {
    name: "vessels.delegate",
    description: "Delegates a follow-up objective to an already active child Vessel session.",
    risk: "execute",
    inputSchema: {
        type: "object",
        required: ["sessionId", "objective"],
        properties: {
            sessionId: { type: "string" },
            objective: { type: "string" },
        },
    },
    outputSchema: {
        type: "object",
        required: ["response"],
        properties: {
            response: { type: "string" },
        },
    },
    async invoke(input, context) {
        const parentConfig = await loadRuntimeConfig({ workspace: context.workspace });
        // Read the saved metadata of the child session
        const childMetaPath = join(parentConfig.memoryDir, `${input.sessionId.replace(/[^a-zA-Z0-9._-]/g, "_")}.meta.json`);
        let meta;
        try {
            const rawMeta = await readFile(childMetaPath, "utf8");
            meta = JSON.parse(rawMeta);
        }
        catch {
            throw new Error(`Child Vessel session not found or metadata missing for session: ${input.sessionId}`);
        }
        // Validate child vows again against parent vows
        const parentVows = new Set(parentConfig.allowedRisks);
        for (const vow of meta.vows) {
            if (!parentVows.has(vow)) {
                throw new Error(`Permission escalation denied: Child session has vow '${vow}' which is not allowed by parent`);
            }
        }
        const childVesselId = `child-${Math.random().toString(36).substring(2, 10)}`;
        const childConfig = {
            ...parentConfig,
            vesselId: childVesselId,
            allowedRisks: meta.vows,
            sessionId: input.sessionId,
        };
        const result = await runAgentTurn({
            config: childConfig,
            workspace: context.workspace,
            objective: input.objective,
            sessionId: input.sessionId,
            systemPrompt: meta.soul,
            flowBus: context.registry?.flowBus,
        });
        return {
            response: result.final.response.content,
        };
    },
};
export const speculateRune = {
    name: "vessels.speculate",
    description: "Spawns a speculative execution in an isolated workspace branch and returns the hypothetical result without merging any changes back.",
    risk: "execute",
    inputSchema: {
        type: "object",
        required: ["objective"],
        properties: {
            objective: { type: "string" },
        },
    },
    async invoke(input, context) {
        const sovereign = context.sovereign;
        const chronicle = context.chronicle;
        if (!sovereign)
            throw new Error("vessels.speculate requires a sovereign shard in context");
        if (!chronicle)
            throw new Error("vessels.speculate requires a chronicle in context");
        const childSessionId = `${context.sessionId}:spec-${Math.random().toString(36).substring(2, 8)}`;
        const result = await new AgentLoop({
            sovereign,
            runes: context.registry,
            workspace: context.workspace,
            sessionId: context.sessionId,
            chronicle,
        }).speculate(input.objective, childSessionId);
        return {
            plan: result.plan,
            observations: result.observations.map((obs) => ({
                step: obs.step,
                thought: obs.thought,
                rune: obs.rune,
                error: obs.error,
            })),
        };
    },
};
export const vesselsRunes = [spawnVesselRune, delegateVesselRune, speculateRune];
//# sourceMappingURL=vessels-rune.js.map