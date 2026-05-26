import { resolve } from "node:path";
import { AgentLoop, type AgentRunResult } from "../agent/agent.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { JsonChronicle } from "../core/chronicle.js";
import { FlowBus } from "../core/events.js";
import { ApprovalPermissionPolicy, StaticPermissionPolicy } from "../core/permissions.js";
import { RuneRegistry, workspaceRune } from "../core/runes.js";
import { JsonTraceStore } from "../core/trace.js";
import type { PermissionDecision, PermissionRequest, RuneRisk, RunResult } from "../core/types.js";
import { createSemanticMemory, semanticMemoryRunes } from "../memory/semantic.js";
import { registerPlugins } from "../plugins/manifest.js";
import { createShard } from "../providers/factory.js";
import { gitRunes } from "../runes/git.js";
import { workspaceRunes } from "../runes/workspace.js";
import { sendMessageRune } from "../runes/circle.js";
import { Sovereign } from "../core/sovereign.js";
import { loadSoul, discoverWorkspaceRunes } from "./discovery.js";


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
}

const runtimeCache = new Map<string, RuntimeServices>();

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeServices> {
  const cacheKey = `${options.workspace}:${options.config.vesselId}:${options.approvals ?? false}`;
  const cached = runtimeCache.get(cacheKey);
  if (cached) return cached;

  const paths = runtimePaths(options.config, options.workspace);
  const flowBus = options.flowBus ?? new FlowBus();
  const chronicle = new JsonChronicle(paths.memoryDir);
  const runes = await createRuntimeRuneRegistry({
    workspace: options.workspace,
    allowedRisks: options.config.allowedRisks.filter(isRisk),
    flowBus,
    approvals: options.approvals ?? false,
    ...(options.approvalPrompt ? { approvalPrompt: options.approvalPrompt } : {})
  });
  const soul = await loadSoul(options.workspace);
  const runtime = {
    paths,
    flowBus,
    chronicle,
    traceStore: new JsonTraceStore(paths.traceDir),
    runes,
    sovereign: new Sovereign({ shard: createShard(options.config), chronicle, flowBus, ...(soul ? { systemPrompt: soul } : {}) })
  };

  runtimeCache.set(cacheKey, runtime);
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
  const registry = new RuneRegistry({
    policy:
      options.approvals && options.approvalPrompt
        ? new ApprovalPermissionPolicy({ fallback: staticPolicy, prompt: options.approvalPrompt })
        : staticPolicy,
    emit: (event) => options.flowBus?.emit(event)
  });
  registry.register(workspaceRune);
  registry.register(sendMessageRune);
  for (const workspaceRuneItem of workspaceRunes) registry.register(workspaceRuneItem);
  for (const gitRune of gitRunes) registry.register(gitRune);
  for (const memoryRune of semanticMemoryRunes(createSemanticMemory(resolve(options.workspace, ".rimuru")))) registry.register(memoryRune);
  for (const workspaceSkill of await discoverWorkspaceRunes(options.workspace)) registry.register(workspaceSkill);
  await registerPlugins(registry, resolve(options.workspace, ".rimuru", "plugins"));

  return registry;
}

export async function runChatTurn(options: ChatTurnOptions): Promise<RunResult> {
  const sessionId = options.sessionId ?? options.config.sessionId;
  let lastError: unknown;
  for (const config of runtimeConfigAttempts(options.config)) {
    try {
      const runtime = await createRuntime({ config, workspace: options.workspace, ...(options.flowBus ? { flowBus: options.flowBus } : {}) });
      const result = await runtime.sovereign.run({ prompt: options.prompt, workspace: options.workspace, sessionId, ...(options.onText ? { onText: options.onText } : {}) });
      await createSemanticMemory(runtime.paths.rimuruDir).indexChronicle(sessionId, runtime.chronicle);
      if (options.trace) await runtime.traceStore.save({ sessionId, createdAt: new Date(), messages: result.transcript, events: result.events });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function runAgentTurn(options: AgentTurnOptions): Promise<AgentRunResult> {
  const sessionId = options.sessionId ?? options.config.sessionId;
  const runtime = await createRuntime({
    config: options.config,
    workspace: options.workspace,
    ...(options.flowBus ? { flowBus: options.flowBus } : {}),
    ...(options.approvals === undefined ? {} : { approvals: options.approvals }),
    ...(options.approvalPrompt ? { approvalPrompt: options.approvalPrompt } : {})
  });
  const loop = new AgentLoop({ 
    sovereign: runtime.sovereign, 
    runes: runtime.runes, 
    workspace: options.workspace, 
    sessionId, 
    audit: true,
    flowBus: options.flowBus 
  });

  const result = await loop.run(options.objective, options.onText);
  await createSemanticMemory(runtime.paths.rimuruDir).indexChronicle(sessionId, runtime.chronicle);
  if (options.trace) await runtime.traceStore.save({ sessionId, createdAt: new Date(), messages: result.final.transcript, events: result.final.events });
  return result;
}

export function runtimePaths(config: RuntimeConfig, workspace: string): RuntimePaths {
  const rimuruDir = resolve(workspace, ".rimuru");
  return {
    workspace,
    memoryDir: resolve(config.memoryDir),
    rimuruDir,
    traceDir: resolve(rimuruDir, "traces"),
    pluginDir: resolve(rimuruDir, "plugins")
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
      ...(fallback.apiKey ? { apiKey: fallback.apiKey } : "apiKey" in config ? { apiKey: config.apiKey } : {})
    }))
  ];
}
