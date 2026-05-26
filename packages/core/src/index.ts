export { FlowBus } from "./core/events.js";
export { appendAuditEvent, auditLogPath, listAuditEvents } from "./core/audit.js";
export { createCanvasArtifact, listCanvasArtifacts, readCanvasArtifact } from "./canvas/canvas.js";
export { circleByName, getCircleAdapter, listCircles, normalizeLocalCircleMessage, registerCircleAdapter, verifySlackSignature, verifyDiscordSignature, TELEGRAM_ADAPTER, SLACK_ADAPTER, DISCORD_ADAPTER } from "./circles/circles.js";
export { WHATSAPP_ADAPTER } from "./circles/whatsapp.js";

export { JsonChronicle, MemoryChronicle } from "./core/chronicle.js";
export { ApprovalPermissionPolicy, ConsensusPermissionPolicy, readOnlyPolicy, StaticPermissionPolicy, trustedLocalPolicy } from "./core/permissions.js";
export { JsonTraceStore } from "./core/trace.js";
export { AgentLoop } from "./agent/agent.js";
export { RuneRegistry, workspaceRune } from "./core/runes.js";
export { Sovereign } from "./core/sovereign.js";
export { loadRuntimeConfig } from "./config/runtime-config.js";
export { validateRuntimeConfig } from "./config/validate.js";
export { createRuntime, createRuntimeRuneRegistry, isRisk, runAgentTurn, runChatTurn, runtimePaths, discoverSandboxedRunes } from "./runtime/runtime.js";
export { createShard } from "./providers/factory.js";
// Gate logic moved to @rimuru/gate

// Providers

export { OpenAICompatibleShard } from "./providers/openai-compatible.js";
export { AnthropicShard } from "./providers/anthropic.js";
export { GeminiShard } from "./providers/gemini.js";
export { MockShard } from "./providers/mock.js";
export { gitDiffRune, gitRunes, gitStatusRune, gitSummaryRune } from "./runes/git.js";
export { applyPatchRune, editFileRune, readFileRune, searchRune, shellRune, workspaceRunes } from "./runes/workspace.js";
export { sendMessageRune } from "./runes/circle.js";
export { applyPatchToText, applyUnifiedPatch, parseUnifiedPatch } from "./edit/patch.js";
export { planObjective } from "./planner/planner.js";
export { applyRollback, inspectRollback, listRollbacks } from "./rewind/rollback.js";
export { listPairings, approvePairing, isSenderAllowed, requestPairing, requireSenderAllowed } from "./security/pairing.js";
export { createRitual, deleteRitual, listRituals, runDueRituals, setRitualEnabled } from "./rituals/rituals.js";
export { renderRoomHtml } from "./room/room.js";
export { renderSystemdUserService, writeSystemdUserService } from "./service/service.js";
export { deleteVaultSecret, getVaultSecret, listVaultSecrets, setVaultSecret } from "@rimuru/vault";

export { activeVessel, listVessels } from "./vessels/vessels.js";
export { spawnVesselRune, delegateVesselRune, vesselsRunes } from "./runes/vessels-rune.js";
export { discoverPluginManifests, loadPlugin, loadPluginManifest, loadPluginManifests, loadPlugins, manifestRunes, registerPlugins, validatePluginManifest } from "./plugins/manifest.js";
export { buildLexicalIndex } from "./indexer/lexical-index.js";
export { createSemanticMemory, HashEmbeddingProvider, JsonSemanticMemoryStore, SemanticMemory, semanticMemoryRunes } from "./memory/semantic.js";
export { handleMcpCall } from "./mcp/bridge.js";
export { serveMcpStdio } from "./mcp/server.js";
// TUI logic moved to @rimuru/cli

export { redactSecrets } from "./security/redact.js";
export { assertCommandName, resolveWorkspacePath } from "./security/workspace.js";
export { runSandboxedCommand, sandboxModeFromEnv } from "./security/sandbox.js";
export { executeDynamicRune } from "./security/sandbox-vm.js";
// Dashboard logic moved to @rimuru/cli

export type { CircleConfig, ProviderAttempt, ProviderKind, RuntimeConfig, VesselConfig } from "./config/runtime-config.js";
export type { ConfigDiagnostic } from "./config/validate.js";
export type { CanvasArtifact, CanvasArtifactSummary } from "./canvas/canvas.js";
export type { CircleMessage, CircleSummary } from "./circles/circles.js";
export type { AgentTurnOptions, ChatTurnOptions, CreateRuntimeOptions, RuntimePaths, RuntimeServices } from "./runtime/runtime.js";
// Gate types moved to @rimuru/gate

export type { Plan, PlanStep } from "./planner/planner.js";
export type { RollbackRecord, RollbackSummary } from "./rewind/rollback.js";
export type { AllowedSender, PairingEntry } from "./security/pairing.js";
export type { Ritual } from "./rituals/rituals.js";
export type { ServiceFileOptions } from "./service/service.js";
export type { VaultEntrySummary } from "@rimuru/vault";

export type { VesselSummary } from "./vessels/vessels.js";
export type { PluginManifest } from "./plugins/manifest.js";
export type { LoadedPlugin, PluginContext, PluginModule } from "./plugins/manifest.js";
export type { TraceRecord } from "./core/trace.js";
export type { AuditEvent, AuditEventType, NewAuditEvent } from "./core/audit.js";
export type { AgentRunResult } from "./agent/agent.js";
export type { WorkspaceIndex, IndexedFile } from "./indexer/lexical-index.js";
export type { EmbeddingProvider, SemanticMemoryRecord, SemanticMemorySearchResult } from "./memory/semantic.js";
export type { McpToolCall } from "./mcp/bridge.js";
export type { McpServerOptions } from "./mcp/server.js";
export type { ApplyPatchOptions, PatchApplyResult, PatchFile, PatchHunk, PatchLine } from "./edit/patch.js";
export type { SandboxCommandInput, SandboxMode } from "./security/sandbox.js";
export type * from "./core/types.js";
