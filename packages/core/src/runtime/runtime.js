import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { AgentLoop } from "../agent/agent.js";
import { JsonChronicle } from "../core/chronicle.js";
import { FlowBus } from "../core/events.js";
import { auditMiddleware, isolationMiddleware, permissionMiddleware } from "../core/middleware.js";
import { ApprovalPermissionPolicy, StaticPermissionPolicy } from "../core/permissions.js";
import { RuneRegistry, workspaceRune } from "../core/runes.js";
import { Sovereign } from "../core/sovereign.js";
import { JsonTraceStore } from "../core/trace.js";
import { createSemanticMemory, semanticMemoryRunes } from "../memory/semantic.js";
import { registerPlugins } from "../plugins/manifest.js";
import { createShard } from "../providers/factory.js";
import { sendMessageRune } from "../runes/circle.js";
import { gitRunes } from "../runes/git.js";
import { workspaceRunes } from "../runes/workspace.js";
import { discoverSandboxedRunes, loadSoul } from "./discovery.js";
export { discoverSandboxedRunes };
import { vesselsRunes } from "../runes/vessels-rune.js";
import { webRunes } from "../runes/web.js";
const runtimeCache = new Map();
const MAX_CACHE_SIZE = 50;
export async function createRuntime(options) {
    const configHash = createHash("sha256")
        .update(`${options.workspace}:${options.approvals ?? false}:${options.systemPrompt ?? ""}:${JSON.stringify(options.config)}`)
        .digest("hex");
    const cached = runtimeCache.get(configHash);
    if (cached)
        return cached;
    const paths = runtimePaths(options.config, options.workspace);
    const flowBus = options.flowBus ?? new FlowBus();
    const chronicle = new JsonChronicle(paths.memoryDir);
    const runes = await createRuntimeRuneRegistry({
        workspace: options.workspace,
        allowedRisks: options.config.allowedRisks.filter(isRisk),
        flowBus,
        approvals: options.approvals ?? false,
        ...(options.approvalPrompt ? { approvalPrompt: options.approvalPrompt } : {}),
    });
    const soul = options.systemPrompt ?? (await loadSoul(options.workspace));
    const runtime = {
        paths,
        flowBus,
        chronicle,
        traceStore: new JsonTraceStore(paths.traceDir),
        runes,
        sovereign: new Sovereign({
            shard: createShard(options.config),
            chronicle,
            flowBus,
            ...(soul ? { systemPrompt: soul } : {}),
        }),
    };
    if (runtimeCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = runtimeCache.keys().next().value;
        if (oldestKey !== undefined) {
            runtimeCache.delete(oldestKey);
        }
    }
    runtimeCache.set(configHash, runtime);
    return runtime;
}
export async function createRuntimeRuneRegistry(options) {
    const staticPolicy = new StaticPermissionPolicy({ allow: options.allowedRisks });
    const policy = options.approvals && options.approvalPrompt
        ? new ApprovalPermissionPolicy({ fallback: staticPolicy, prompt: options.approvalPrompt })
        : staticPolicy;
    const emit = (event) => options.flowBus?.emit(event);
    const clock = () => new Date();
    const middlewares = [
        auditMiddleware({ emit, clock }),
        permissionMiddleware({ policy, emit, clock }),
        isolationMiddleware(),
    ];
    const registry = new RuneRegistry({ middlewares });
    registry.register(workspaceRune);
    registry.register(sendMessageRune);
    for (const workspaceRuneItem of workspaceRunes)
        registry.register(workspaceRuneItem);
    for (const gitRune of gitRunes)
        registry.register(gitRune);
    for (const vesselsRune of vesselsRunes)
        registry.register(vesselsRune);
    for (const webRune of webRunes)
        registry.register(webRune);
    for (const memoryRune of semanticMemoryRunes(createSemanticMemory(resolve(options.workspace, ".rimuru"))))
        registry.register(memoryRune);
    for (const sandboxedRune of await discoverSandboxedRunes(options.workspace))
        registry.register(sandboxedRune);
    await registerPlugins(registry, resolve(options.workspace, ".rimuru", "plugins"));
    return registry;
}
export async function runAgentTurn(options) {
    const sessionId = options.sessionId ?? options.config.sessionId;
    const runtime = await createRuntime({
        config: options.config,
        workspace: options.workspace,
        systemPrompt: options.systemPrompt,
        ...(options.flowBus ? { flowBus: options.flowBus } : {}),
        ...(options.approvals === undefined ? {} : { approvals: options.approvals }),
        ...(options.approvalPrompt ? { approvalPrompt: options.approvalPrompt } : {}),
    });
    const loop = new AgentLoop({
        sovereign: runtime.sovereign,
        runes: runtime.runes,
        workspace: options.workspace,
        sessionId,
        audit: true,
        flowBus: options.flowBus,
        chronicle: runtime.chronicle,
    });
    const result = await loop.run(options.objective, options.onText);
    await createSemanticMemory(runtime.paths.rimuruDir).indexChronicle(sessionId, runtime.chronicle);
    if (options.trace)
        await runtime.traceStore.save({
            sessionId,
            createdAt: new Date(),
            messages: result.final.transcript,
            events: result.final.events,
        });
    return result;
}
export async function runChatTurn(options) {
    const sessionId = options.sessionId ?? options.config.sessionId;
    let lastError;
    for (const config of runtimeConfigAttempts(options.config)) {
        try {
            const runtime = await createRuntime({
                config,
                workspace: options.workspace,
                ...(options.flowBus ? { flowBus: options.flowBus } : {}),
            });
            const result = await runtime.sovereign.run({
                prompt: options.prompt,
                workspace: options.workspace,
                sessionId,
                ...(options.onText ? { onText: options.onText } : {}),
            });
            await createSemanticMemory(runtime.paths.rimuruDir).indexChronicle(sessionId, runtime.chronicle);
            if (options.trace)
                await runtime.traceStore.save({
                    sessionId,
                    createdAt: new Date(),
                    messages: result.transcript,
                    events: result.events,
                });
            return result;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
export function runtimePaths(config, workspace) {
    const rimuruDir = resolve(workspace, ".rimuru");
    return {
        workspace,
        memoryDir: isAbsolute(config.memoryDir) ? resolve(config.memoryDir) : resolve(workspace, config.memoryDir),
        rimuruDir,
        traceDir: resolve(rimuruDir, "traces"),
        pluginDir: resolve(rimuruDir, "plugins"),
    };
}
export function isRisk(value) {
    return value === "read" || value === "write" || value === "execute" || value === "network";
}
function runtimeConfigAttempts(config) {
    if (config.fallbackShards.length === 0)
        return [config];
    return [
        config,
        ...config.fallbackShards.map((fallback) => ({
            ...config,
            provider: fallback.provider,
            model: fallback.model ?? config.model,
            ...(fallback.baseUrl ? { baseUrl: fallback.baseUrl } : "baseUrl" in config ? { baseUrl: config.baseUrl } : {}),
            ...(fallback.apiKey ? { apiKey: fallback.apiKey } : "apiKey" in config ? { apiKey: config.apiKey } : {}),
        })),
    ];
}
//# sourceMappingURL=runtime.js.map