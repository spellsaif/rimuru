import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { AgentLoop, type AgentRunResult } from "../agent/agent.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { JsonChronicle } from "../core/chronicle.js";
import { FlowBus } from "../core/events.js";
import { auditMiddleware, isolationMiddleware, permissionMiddleware } from "../core/middleware.js";
import { ApprovalPermissionPolicy, StaticPermissionPolicy } from "../core/permissions.js";
import { RuneRegistry, workspaceRune } from "../core/runes.js";
import { Sovereign } from "../core/sovereign.js";
import { JsonTraceStore } from "../core/trace.js";
import type { PermissionDecision, PermissionRequest, RunResult, RuneMiddleware, RuneRisk } from "../core/types.js";
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
import { runDueRituals } from "../rituals/rituals.js";
import { runeToPredicate } from "../core/predicate.js";

export interface RuntimePaths {
  readonly workspace: string;
  readonly memoryDir: string;
  readonly rimuruDir: string;
  readonly traceDir: string;
  readonly pluginDir: string;
}

export interface RuntimeServices {
  readonly paths: RuntimePaths;
  readonly flowBus: FlowBus;
  readonly chronicle: JsonChronicle;
  readonly traceStore: JsonTraceStore;
  readonly runes: RuneRegistry;
  readonly sovereign: Sovereign;
}

export interface CreateRuntimeOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly flowBus?: FlowBus;
  readonly approvals?: boolean;
  readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
  readonly systemPrompt?: string;
}

export interface ChatTurnOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly prompt: string;
  readonly sessionId?: string;
  readonly flowBus?: FlowBus;
  readonly trace?: boolean;
  readonly onText?: (text: string) => void;
}

export interface AgentTurnOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly objective: string;
  readonly sessionId?: string;
  readonly flowBus?: FlowBus;
  readonly approvals?: boolean;
  readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
  readonly trace?: boolean;
  readonly onText?: (text: string) => void;
  readonly systemPrompt?: string;
}

const runtimeCache = new Map<string, RuntimeServices>();
const MAX_CACHE_SIZE = 50;

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeServices> {
  const configHash = createHash("sha256")
    .update(
      `${options.workspace}:${options.approvals ?? false}:${options.systemPrompt ?? ""}:${JSON.stringify(options.config)}`,
    )
    .digest("hex");
  const cached = runtimeCache.get(configHash);
  if (cached) return cached;

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

export async function createRuntimeRuneRegistry(options: {
  readonly workspace: string;
  readonly allowedRisks: readonly RuneRisk[];
  readonly flowBus?: FlowBus;
  readonly approvals?: boolean;
  readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
}): Promise<RuneRegistry> {
  const staticPolicy = new StaticPermissionPolicy({ allow: options.allowedRisks });
  const policy = options.approvals && options.approvalPrompt
    ? new ApprovalPermissionPolicy({ fallback: staticPolicy, prompt: options.approvalPrompt })
    : staticPolicy;
  const emit = (event: any) => options.flowBus?.emit(event);
  const clock = () => new Date();

  const middlewares: RuneMiddleware[] = [
    auditMiddleware({ emit, clock }),
    permissionMiddleware({ policy, emit, clock }),
    isolationMiddleware(),
  ];

  const registry = new RuneRegistry({ middlewares });

  registry.register(workspaceRune);
  registry.register(sendMessageRune);
  for (const workspaceRuneItem of workspaceRunes) registry.register(workspaceRuneItem);
  for (const gitRune of gitRunes) registry.register(gitRune);
  for (const vesselsRune of vesselsRunes) registry.register(vesselsRune);
  for (const webRune of webRunes) registry.register(webRune);
  for (const memoryRune of semanticMemoryRunes(createSemanticMemory(resolve(options.workspace, ".rimuru"))))
    registry.register(memoryRune);
  for (const sandboxedRune of await discoverSandboxedRunes(options.workspace)) registry.register(sandboxedRune);
  await registerPlugins(registry, resolve(options.workspace, ".rimuru", "plugins"));

  for (const rune of registry.list()) {
    const existing = registry.predicate(rune.name);
    if (!existing) {
      registry.registerPredicate(runeToPredicate(rune));
    }
  }

  return registry;
}

export async function runAgentTurn(options: AgentTurnOptions): Promise<AgentRunResult> {
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
    providerKind: options.config.provider,
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

export async function runChatTurn(options: ChatTurnOptions): Promise<RunResult> {
  const sessionId = options.sessionId ?? options.config.sessionId;
  let lastError: unknown;
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
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function runtimePaths(config: RuntimeConfig, workspace: string): RuntimePaths {
  const rimuruDir = resolve(workspace, ".rimuru");
  return {
    workspace,
    memoryDir: isAbsolute(config.memoryDir) ? resolve(config.memoryDir) : resolve(workspace, config.memoryDir),
    rimuruDir,
    traceDir: resolve(rimuruDir, "traces"),
    pluginDir: resolve(rimuruDir, "plugins"),
  };
}

export function isRisk(value: string): value is RuneRisk {
  return value === "read" || value === "write" || value === "execute" || value === "network";
}

function runtimeConfigAttempts(config: RuntimeConfig): readonly RuntimeConfig[] {
  if (config.fallbackShards.length === 0) return [config];
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
