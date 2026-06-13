import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { RuntimeConfig } from "@rimuru/core";
import {
  createCanvasArtifact,
  listCanvasArtifacts,
  readCanvasArtifact,
  circleByName,
  listCircles,
  normalizeLocalCircleMessage,
  getCircleAdapter,
  registerCircleAdapter,
  verifySlackSignature,
  verifyDiscordSignature,
  WHATSAPP_ADAPTER,
  type CircleMessage,
  listAuditEvents,
  JsonChronicle,
  FlowBus,
  type AssistantResponse,
  type Flow,
  type PermissionDecision,
  type PermissionRequest,
  createSemanticMemory,
  listPairings,
  approvePairing,
  requireSenderAllowed,
  createRitual,
  deleteRitual,
  listRituals,
  runDueRituals,
  setRitualEnabled,
  renderRoomHtml,
  runAgentTurn,
  runChatTurn,
  createRuntime,
  runtimePaths,
  listVessels,
  isSafeExternalHttpUrl,
  type GateStatus,
} from "@rimuru/core";

import { deleteVaultSecret, getVaultSecret, listVaultSecrets, setVaultSecret } from "@rimuru/vault";
import { clearGateState, getGateStatus, writeGateState } from "./gate.js";

export interface GateServerOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly host?: string;
  readonly port?: number;
  readonly approvals?: boolean;
  readonly approvalPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
  readonly trace?: boolean;
  readonly corsOrigins?: readonly string[];
}

export interface GateServerHandle {
  readonly server: Server;
  readonly url: string;
  readonly status: GateStatus;
  close(): Promise<void>;
}

type RouteHandler = (context: RouteContext) => Promise<void>;
interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  parts: string[];
  options: GateServerOptions;
  runtime: any;
  chronicle: JsonChronicle;
  semanticMemory: any;
  flowBus: FlowBus;
  status: GateStatus;
}

export async function createGateHttpServer(options: GateServerOptions): Promise<Server> {
  const flowBus = new FlowBus();
  const approvalBroker = createApprovalBroker();
  const approvalPrompt = options.approvals ? (options.approvalPrompt ?? approvalBroker.prompt) : options.approvalPrompt;
  const runtime = await createRuntime({
    config: options.config,
    workspace: options.workspace,
    flowBus,
    ...(options.approvals === undefined ? {} : { approvals: options.approvals }),
    ...(approvalPrompt ? { approvalPrompt } : {}),
  });
  const paths = runtimePaths(options.config, options.workspace);
  const chronicle = new JsonChronicle(paths.memoryDir);
  const semanticMemory = createSemanticMemory(paths.rimuruDir);
  const status = getGateStatus(options.config, options.workspace);

  let gatewayToken = process.env.RIMURU_GATEWAY_TOKEN || "";
  if (!gatewayToken) {
    try {
      gatewayToken = await getVaultSecret(options.workspace, "RIMURU_GATEWAY_TOKEN");
    } catch {}
  }

  const server = createServer(async (request, response) => {
    try {
      (request as any).approvalBroker = approvalBroker;
      if (request.method === "OPTIONS") {
        sendEmpty(response, request, 204, options.corsOrigins);
        return;
      }

      const url = new URL(request.url ?? "/", "http://rimuru.local");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      // Verify authorization if a gateway token is configured and the route is not public/webhooks
      const isPublicRoute =
        request.method === "OPTIONS" ||
        (request.method === "GET" &&
          (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/room")) ||
        (request.method === "POST" && isPublicCircleRoute(options.config, parts));

      if (gatewayToken && !isPublicRoute) {
        const authHeader = request.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7).trim() !== gatewayToken.trim()) {
          sendJson(
            response,
            request,
            401,
            { error: "Unauthorized", message: "Missing or invalid gateway authorization token" },
            options.corsOrigins,
          );
          return;
        }
      }

      const context: RouteContext = {
        request,
        response,
        url,
        parts,
        options,
        runtime,
        chronicle,
        semanticMemory,
        flowBus,
        status,
      };

      // Dispatch to specific handlers
      if (await dispatch(context)) return;

      sendJson(
        response,
        request,
        404,
        { error: `Unknown Gate route: ${request.method ?? "GET"} ${url.pathname}` },
        options.corsOrigins,
      );
    } catch (error) {
      console.error(`[gate] Request error: ${error instanceof Error ? error.stack : error}`);
      sendJson(
        response,
        request,
        500,
        { error: "Internal Server Error", message: error instanceof Error ? error.message : String(error) },
        options.corsOrigins,
      );
    }
  });

  setupRituals(options, flowBus);
  setupCircles(options, flowBus);
  return server;
}

/**
 * Simplified dispatcher that replaces the giant if/else block.
 */
async function dispatch(ctx: RouteContext): Promise<boolean> {
  const { request, url, parts } = ctx;
  const method = request.method;

  // Health & Overview
  if (method === "GET") {
    if (url.pathname === "/" || url.pathname === "/health") return handleHealth(ctx);
    if (url.pathname === "/room") return handleRoom(ctx);
    if (url.pathname === "/gate/status") return handleStatus(ctx);
    if (url.pathname === "/gate/overview") return handleOverview(ctx);
    if (["/policy", "/vows"].includes(url.pathname)) return handlePolicy(ctx);
    if (["/providers", "/shards"].includes(url.pathname)) return handleProviders(ctx);
    if (["/runes", "/tools"].includes(url.pathname)) return handleRunes(ctx);
    if (url.pathname === "/sessions") return handleListSessions(ctx);
    if (url.pathname === "/vessels") return handleListVessels(ctx);
    if (url.pathname === "/traces") return handleListTraces(ctx);
    if (url.pathname === "/audit") return handleAudit(ctx);
    if (url.pathname === "/memory/search") return handleMemorySearch(ctx);
    if (url.pathname === "/events") return handleEvents(ctx);
    if (url.pathname === "/events/stream") return handleEventsStream(ctx);
    if (["/approvals", "/pacts"].includes(url.pathname)) return handleApprovals(ctx);
    if (url.pathname === "/pairings") return handlePairings(ctx);
    if (url.pathname === "/vault") return handleListVault(ctx);
    if (url.pathname === "/rituals") return handleListRituals(ctx);
    if (url.pathname === "/canvas") return handleListCanvas(ctx);
    if (["/circles", "/channels"].includes(url.pathname)) return handleListCircles(ctx);
  }

  // Dynamic Session Routes
  if (parts[0] === "sessions" && parts[1]) {
    if (method === "GET") {
      if (parts.length === 2 || parts[2] === "history") return handleSessionHistory(ctx);
      if (parts[2] === "summary") return handleSessionSummary(ctx);
      if (parts[2] === "traces") return handleSessionTraces(ctx);
    }
    if (method === "POST") {
      if (parts[2] === "message") return handleSessionMessage(ctx);
      if (parts[2] === "stream") return handleSessionStream(ctx);
    }
  }

  // Dynamic Trace/Vault/Ritual Routes
  if (method === "GET" && parts[0] === "traces" && parts[1]) return handleTraceInspect(ctx);
  if (parts[0] === "vault" && parts[1]) {
    if (method === "GET") return handleVaultGet(ctx);
    if (method === "DELETE") return handleVaultDelete(ctx);
  }
  if (parts[0] === "rituals" && parts[1]) {
    if (method === "POST" && parts[2] === "enable") return handleRitualSetEnabled(ctx, true);
    if (method === "POST" && parts[2] === "disable") return handleRitualSetEnabled(ctx, false);
    if (method === "DELETE") return handleRitualDelete(ctx);
  }
  if (method === "GET" && parts[0] === "canvas" && parts[1]) return handleCanvasGet(ctx);

  // POST Actions
  if (method === "POST") {
    if (["/runes/call/stream", "/tools/call/stream"].includes(url.pathname)) return handleRuneCallStream(ctx);
    if (["/runes/call", "/tools/call"].includes(url.pathname)) return handleRuneCall(ctx);
    if (url.pathname === "/runes/register") return handleRuneRegister(ctx);
    if (url.pathname === "/runes/deregister") return handleRuneDeregister(ctx);
    if (url.pathname === "/chat") return handleChat(ctx);
    if (url.pathname === "/chat/stream") return handleChatStream(ctx);
    if (url.pathname === "/agent") return handleAgent(ctx);
    if (url.pathname === "/sessions") return handleCreateSession(ctx);
    if (url.pathname === "/memory/remember") return handleMemoryRemember(ctx);
    if (url.pathname === "/memory/index") return handleMemoryIndex(ctx);
    if (url.pathname === "/pairings/approve") return handlePairingApprove(ctx);
    if (url.pathname === "/vault") return handleVaultSet(ctx);
    if (url.pathname === "/rituals") return handleRitualCreate(ctx);
    if (url.pathname === "/canvas") return handleCanvasCreate(ctx);
  }

  // Circles / Messaging (Simplified via Adapters)
  if (method === "POST" && parts[0] === "circles" && parts[1]) {
    if (parts[2] === "message") return handleCircleWebhook(ctx);
    if (["telegram", "slack", "discord"].includes(parts[2])) return handleCircleAdapter(ctx);
  }

  // Approval Decisions
  if (method === "POST" && ["approvals", "pacts"].includes(parts[0]) && parts[1]) {
    if (parts[2] === "approve") return handleApprovalDecision(ctx, true);
    if (parts[2] === "deny") return handleApprovalDecision(ctx, false);
  }

  return false;
}

// --- Handler Implementations (Highly Simplified) ---

async function handleHealth({ response, request, status, options }: RouteContext) {
  sendJson(response, request, 200, { ok: true, name: status.name, state: status.state }, options.corsOrigins);
  return true;
}

async function handleRoom({ response, request, status, options }: RouteContext) {
  sendHtml(response, request, 200, renderRoomHtml(status), options.corsOrigins);
  return true;
}

async function handleStatus({ response, request, status, options }: RouteContext) {
  sendJson(response, request, 200, status, options.corsOrigins);
  return true;
}

async function handleOverview(ctx: RouteContext) {
  const { response, request, options, status, chronicle, runtime, semanticMemory } = ctx;
  sendJson(
    response,
    request,
    200,
    {
      status,
      policy: gatePolicy(options),
      providers: gateProviders(options.config),
      sessions: await chronicle.listSessions(),
      runes: runtime.runes.describe(),
      vessels: listVessels(options.config),
      circles: listCircles(options.config),
      pairings: await listPairings(options.workspace),
      traces: await runtime.traceStore.list(),
      approvals: (request as any).approvalBroker?.list() ?? [],
      audit: await listAuditEvents(options.workspace, { limit: 20 }),
      vault: { secrets: await listVaultSecrets(options.workspace) },
      rituals: await listRituals(options.workspace),
      canvas: await listCanvasArtifacts(options.workspace),
    },
    options.corsOrigins,
  );
  return true;
}

async function handlePolicy({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, gatePolicy(options), options.corsOrigins);
  return true;
}

async function handleProviders({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, gateProviders(options.config), options.corsOrigins);
  return true;
}

async function handleRunes({ response, request, runtime, options }: RouteContext) {
  sendJson(response, request, 200, { runes: runtime.runes.describe() }, options.corsOrigins);
  return true;
}

async function handleRuneCall(ctx: RouteContext) {
  const { request, response, runtime, options } = ctx;
  const body = await readJson(request);
  const name = readString(body, "name");
  const output = await runtime.runes.invoke(name, readOptional(body, "input") ?? {}, {
    workspace: options.workspace,
    sessionId: readOptionalString(body, "sessionId") ?? options.config.sessionId,
    audit: true,
  });
  sendJson(response, request, 200, { output }, options.corsOrigins);
  return true;
}

async function handleRuneCallStream(ctx: RouteContext) {
  const { request, response, runtime, options } = ctx;
  const body = await readJson(request);
  const name = readString(body, "name");
  const input = readOptional(body, "input") ?? {};
  const sessionId = readOptionalString(body, "sessionId") ?? options.config.sessionId;

  response.writeHead(200, {
    ...corsHeaders(request, options.corsOrigins),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const context = {
      workspace: options.workspace,
      sessionId,
      audit: true,
    };
    for await (const chunk of runtime.runes.invokeStream(name, input, context)) {
      response.write(`data: ${JSON.stringify({ type: "chunk", chunk })}\n\n`);
    }
    response.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    response.end();
  } catch (error: any) {
    response.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    response.end();
  }
  return true;
}

async function handleRuneRegister(ctx: RouteContext) {
  const { request, response, runtime, options } = ctx;
  const body = await readJson(request);
  const name = readString(body, "name");
  const description = readString(body, "description");
  const risk = readString(body, "risk") as any;
  const code = readString(body, "code");
  const inputSchema = readOptional(body, "inputSchema") as any;
  const outputSchema = readOptional(body, "outputSchema") as any;

  const dynamicRune = {
    name,
    description,
    risk,
    inputSchema,
    outputSchema,
    async invoke(input: any, context: any) {
      const { executeDynamicRune } = await import("@rimuru/core");
      return executeDynamicRune(code, input);
    },
  };

  runtime.runes.register(dynamicRune);
  sendJson(response, request, 200, { registered: name }, options.corsOrigins);
  return true;
}

async function handleRuneDeregister(ctx: RouteContext) {
  const { request, response, runtime, options } = ctx;
  const body = await readJson(request);
  const name = readString(body, "name");

  runtime.runes.deregister(name);
  sendJson(response, request, 200, { deregistered: name }, options.corsOrigins);
  return true;
}

async function handleChat(ctx: RouteContext) {
  const { request, response, options, flowBus } = ctx;
  const body = await readJson(request);
  const result = await runChatTurn({
    config: options.config,
    workspace: options.workspace,
    prompt: readPrompt(body),
    sessionId: readOptionalString(body, "sessionId"),
    flowBus,
    trace: options.trace,
  });
  sendJson(response, request, 200, { response: result.response, events: result.events }, options.corsOrigins);
  return true;
}

async function handleChatStream(ctx: RouteContext) {
  const { request, response, options, flowBus } = ctx;
  const body = await readJson(request);
  streamChat(request, response, options, flowBus, readPrompt(body), readOptionalString(body, "sessionId"));
  return true;
}

async function handleAgent(ctx: RouteContext) {
  const { request, response, options, flowBus } = ctx;
  const body = await readJson(request);
  const result = await runAgentTurn({
    config: options.config,
    workspace: options.workspace,
    objective: readString(body, "objective"),
    sessionId: readOptionalString(body, "sessionId"),
    flowBus,
    approvals: options.approvals,
    trace: options.trace,
  });
  sendJson(
    response,
    request,
    200,
    { plan: (result as any).plan, observations: (result as any).observations, answer: result.final.response.content },
    options.corsOrigins,
  );
  return true;
}

async function handleCreateSession(ctx: RouteContext) {
  const { request, response, options, chronicle } = ctx;
  const body = await readJson(request);
  const sessionId = readOptionalString(body, "sessionId") ?? readOptionalString(body, "soul") ?? createSessionId();
  await chronicle.append(sessionId, []);
  sendJson(response, request, 201, { sessionId, created: true }, options.corsOrigins);
  return true;
}

async function handleListSessions({ response, request, chronicle, options }: RouteContext) {
  sendJson(response, request, 200, { sessions: await chronicle.listSessions() }, options.corsOrigins);
  return true;
}

async function handleSessionHistory(ctx: RouteContext) {
  const { response, request, parts, chronicle, options } = ctx;
  sendJson(
    response,
    request,
    200,
    { sessionId: parts[1], messages: await chronicle.load(parts[1]) },
    options.corsOrigins,
  );
  return true;
}

async function handleSessionSummary(ctx: RouteContext) {
  const { response, request, parts, chronicle, options } = ctx;
  sendJson(
    response,
    request,
    200,
    { sessionId: parts[1], summary: await chronicle.summarize(parts[1]) },
    options.corsOrigins,
  );
  return true;
}

async function handleSessionTraces(ctx: RouteContext) {
  const { response, request, parts, runtime, options } = ctx;
  const prefix = safeName(parts[1]);
  const traces = (await runtime.traceStore.list()).filter((t: string) => t.startsWith(prefix));
  sendJson(response, request, 200, { sessionId: parts[1], traces }, options.corsOrigins);
  return true;
}

async function handleSessionMessage(ctx: RouteContext) {
  const { request, response, parts, options, flowBus } = ctx;
  const body = await readJson(request);
  const result = await runChatTurn({
    config: options.config,
    workspace: options.workspace,
    prompt: readPrompt(body),
    sessionId: parts[1],
    flowBus,
    trace: options.trace,
  });
  sendJson(
    response,
    request,
    200,
    { sessionId: parts[1], response: result.response, events: result.events },
    options.corsOrigins,
  );
  return true;
}

async function handleSessionStream(ctx: RouteContext) {
  const { request, response, parts, options, flowBus } = ctx;
  const body = await readJson(request);
  streamChat(request, response, options, flowBus, readPrompt(body), parts[1]);
  return true;
}

async function handleListTraces({ response, request, runtime, options }: RouteContext) {
  sendJson(response, request, 200, { traces: await runtime.traceStore.list() }, options.corsOrigins);
  return true;
}

async function handleTraceInspect({ response, request, parts, runtime, options }: RouteContext) {
  sendJson(response, request, 200, await runtime.traceStore.inspect(parts[1]), options.corsOrigins);
  return true;
}

async function handleAudit({ response, request, url, options }: RouteContext) {
  const limit = parseLimit(url.searchParams.get("limit"), 100);
  sendJson(
    response,
    request,
    200,
    { events: await listAuditEvents(options.workspace, { limit }) },
    options.corsOrigins,
  );
  return true;
}

async function handleMemorySearch({ response, request, url, semanticMemory, options }: RouteContext) {
  const query = url.searchParams.get("query") ?? url.searchParams.get("q");
  if (!query) throw new Error("Missing memory search query");
  const results = await semanticMemory.search(query, {
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    limit: parseLimit(url.searchParams.get("limit"), 8),
  });
  sendJson(response, request, 200, { results }, options.corsOrigins);
  return true;
}

async function handleMemoryRemember(ctx: RouteContext) {
  const { request, response, semanticMemory, options } = ctx;
  const body = await readJson(request);
  const result = await semanticMemory.remember({
    sessionId: readOptionalString(body, "sessionId") ?? options.config.sessionId,
    scope: readMemoryScope(body),
    text: readString(body, "text"),
  });
  sendJson(response, request, 201, result, options.corsOrigins);
  return true;
}

async function handleMemoryIndex(ctx: RouteContext) {
  const { request, response, semanticMemory, chronicle, options } = ctx;
  const body = await readJson(request);
  const sessionId = readOptionalString(body, "sessionId") ?? options.config.sessionId;
  const count = (await semanticMemory.indexChronicle(sessionId, chronicle)).length;
  sendJson(response, request, 200, { sessionId, indexed: count }, options.corsOrigins);
  return true;
}

async function handleEvents({ response, request, flowBus, options }: RouteContext) {
  sendJson(response, request, 200, { events: flowBus.snapshot() }, options.corsOrigins);
  return true;
}

async function handleEventsStream({ request, response, flowBus, options }: RouteContext) {
  streamEvents(request, response, flowBus, options.corsOrigins);
  return true;
}

async function handleApprovals({ response, request, options }: RouteContext) {
  // In a real refactor, approvalBroker would be in context
  const pending = (request as any).approvalBroker?.list() ?? [];
  sendJson(response, request, 200, { pending, enabled: options.approvals ?? false }, options.corsOrigins);
  return true;
}

async function handleApprovalDecision(ctx: RouteContext, allowed: boolean) {
  const { request, response, parts, options } = ctx;
  const body = await readJson(request);
  const broker = (request as any).approvalBroker;
  if (!broker) throw new Error("Approval broker not available");
  const reason = allowed
    ? readOptionalString(body, "scope") === "session"
      ? "approved for session"
      : "approved once"
    : (readOptionalString(body, "reason") ?? "denied by gate");
  const summary = broker.decide(parts[1], { allowed, reason });
  const key = allowed ? "approved" : "denied";
  sendJson(response, request, 200, { [key]: summary }, options.corsOrigins);
  return true;
}

async function handlePairings({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, await listPairings(options.workspace), options.corsOrigins);
  return true;
}

async function handlePairingApprove(ctx: RouteContext) {
  const { request, response, options } = ctx;
  const body = await readJson(request);
  sendJson(
    response,
    request,
    200,
    await approvePairing(options.workspace, readString(body, "code")),
    options.corsOrigins,
  );
  return true;
}

async function handleListVault({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, { secrets: await listVaultSecrets(options.workspace) }, options.corsOrigins);
  return true;
}

async function handleVaultSet(ctx: RouteContext) {
  const { request, response, options } = ctx;
  const body = await readJson(request);
  sendJson(
    response,
    request,
    200,
    await setVaultSecret(options.workspace, readString(body, "name"), readString(body, "value")),
    options.corsOrigins,
  );
  return true;
}

async function handleVaultGet({ response, request, parts, options }: RouteContext) {
  sendJson(
    response,
    request,
    200,
    { name: parts[1], value: await getVaultSecret(options.workspace, parts[1]) },
    options.corsOrigins,
  );
  return true;
}

async function handleVaultDelete({ response, request, parts, options }: RouteContext) {
  sendJson(response, request, 200, await deleteVaultSecret(options.workspace, parts[1]), options.corsOrigins);
  return true;
}

async function handleListRituals({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, { rituals: await listRituals(options.workspace) }, options.corsOrigins);
  return true;
}

async function handleRitualCreate(ctx: RouteContext) {
  const { request, response, options } = ctx;
  const body = await readJson(request);
  sendJson(
    response,
    request,
    200,
    await createRitual(options.workspace, {
      id: readString(body, "id"),
      prompt: readPrompt(body),
      sessionId: readOptionalString(body, "sessionId") ?? options.config.sessionId,
      everyMinutes: readNumber(body, "everyMinutes"),
    }),
    options.corsOrigins,
  );
  return true;
}

async function handleRitualSetEnabled({ response, request, parts, options }: RouteContext, enabled: boolean) {
  sendJson(response, request, 200, await setRitualEnabled(options.workspace, parts[1], enabled), options.corsOrigins);
  return true;
}

async function handleRitualDelete({ response, request, parts, options }: RouteContext) {
  sendJson(response, request, 200, await deleteRitual(options.workspace, parts[1]), options.corsOrigins);
  return true;
}

async function handleListCanvas({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, { artifacts: await listCanvasArtifacts(options.workspace) }, options.corsOrigins);
  return true;
}

async function handleCanvasCreate(ctx: RouteContext) {
  const { request, response, options } = ctx;
  const body = await readJson(request);
  sendJson(
    response,
    request,
    200,
    await createCanvasArtifact(options.workspace, {
      title: readString(body, "title"),
      kind: readArtifactKind(body),
      content: readString(body, "content"),
    }),
    options.corsOrigins,
  );
  return true;
}

async function handleCanvasGet({ response, request, parts, options }: RouteContext) {
  sendJson(response, request, 200, await readCanvasArtifact(options.workspace, parts[1]), options.corsOrigins);
  return true;
}

async function handleListCircles({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, { circles: listCircles(options.config) }, options.corsOrigins);
  return true;
}

async function handleListVessels({ response, request, options }: RouteContext) {
  sendJson(response, request, 200, { vessels: listVessels(options.config) }, options.corsOrigins);
  return true;
}

async function handleCircleWebhook(ctx: RouteContext) {
  const { request, response, options, parts, flowBus } = ctx;

  if (parts[1] !== "local") {
    const circle = circleByName(options.config, parts[1]);
    if (!circle) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: `Circle '${parts[1]}' is not configured or is disabled.` },
        options.corsOrigins,
      );
      return true;
    }
    if (circle.kind !== "webhook") {
      sendJson(
        response,
        request,
        400,
        { error: "Bad Request", message: `Circle '${parts[1]}' is not a custom webhook kind.` },
        options.corsOrigins,
      );
      return true;
    }

    const expectedSecret = circle.secret ?? (circle.tokenEnv ? process.env[circle.tokenEnv] : circle.token);
    if (!expectedSecret) {
      sendJson(
        response,
        request,
        401,
        {
          error: "Unauthorized",
          message: `Webhook verification secret is not configured for circle '${circle.name}'.`,
        },
        options.corsOrigins,
      );
      return true;
    }

    const authHeader = String(request.headers["authorization"] ?? "");
    const tokenHeader = String(request.headers["x-rimuru-token"] ?? request.headers["x-webhook-secret"] ?? "");
    let providedToken = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      providedToken = authHeader.slice(7).trim();
    } else {
      providedToken = tokenHeader.trim();
    }

    if (!providedToken || !timingSafeCompare(providedToken, expectedSecret)) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: "Invalid webhook credentials or signature." },
        options.corsOrigins,
      );
      return true;
    }
  }

  const body = await readJson(request);
  const circle = circleByName(options.config, parts[1]) ?? { name: parts[1], kind: "webhook" as const, enabled: true };
  const from = readOptionalString(body, "from") ?? "webhook";
  const text = readPrompt(body);
  const sessionId =
    readOptionalString(body, "sessionId") ?? (circle as any).sessionId ?? `webhook-${circle.name}-${from}`;
  const callbackUrl = readOptionalString(body, "callbackUrl") ?? (circle as any).callbackUrl;
  if (callbackUrl) {
    try {
      isSafeExternalHttpUrl(callbackUrl);
    } catch (error) {
      sendJson(
        response,
        request,
        400,
        { error: "Bad Request", message: error instanceof Error ? error.message : String(error) },
        options.corsOrigins,
      );
      return true;
    }
  }

  const message =
    circle.name === "local"
      ? normalizeLocalCircleMessage(body, options.config.sessionId)
      : {
          circle: circle.name,
          from,
          text,
          sessionId,
          raw: body,
        };

  if (circle.name === "local") {
    const result = await handleCircleMessage(options, flowBus, message, ["*"]);
    sendJson(response, request, 200, result, options.corsOrigins);
    return true;
  }

  sendJson(response, request, 202, { deferred: true, circle: circle.name, sessionId }, options.corsOrigins);

  Promise.resolve().then(async () => {
    try {
      const result = await handleCircleMessage(options, flowBus, message, (circle as any).allowFrom ?? []);
      if (callbackUrl && "response" in result) {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "circle.completed",
            circle: circle.name,
            from: message.from,
            sessionId,
            response: result.response,
          }),
        }).catch((err) => console.error(`[gate] Failed to post webhook callback to ${callbackUrl}:`, err));
      }
    } catch (err) {
      console.error(`[gate] Error during deferred custom webhook message processing for ${circle.name}:`, err);
    }
  });

  return true;
}

function timingSafeCompare(a: string, b: string): boolean {
  const aHash = createHmac("sha256", "rimuru-safe-compare-salt").update(a).digest();
  const bHash = createHmac("sha256", "rimuru-safe-compare-salt").update(b).digest();
  try {
    return timingSafeEqual(aHash, bHash);
  } catch {
    return false;
  }
}

async function handleCircleAdapter(ctx: RouteContext) {
  const { request, response, parts, options, flowBus } = ctx;
  const circle = circleByName(options.config, parts[1]);
  if (!circle) throw new Error(`Unknown circle: ${parts[1]}`);
  const adapter = getCircleAdapter(circle.kind);
  if (!adapter) throw new Error(`No adapter for kind: ${circle.kind}`);

  const body = await readJson(request);

  // Webhook Cryptographic Verification
  if (circle.kind === "slack") {
    const signingSecret = (circle as any).signingSecret ?? (circle as any).secret ?? process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: "Slack signing secret is not configured" },
        options.corsOrigins,
      );
      return true;
    }
    const timestamp = String(request.headers["x-slack-request-timestamp"] ?? "");
    const signature = String(request.headers["x-slack-signature"] ?? "");
    const rawBody = (request as any).rawBody ?? "";
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: "Invalid Slack signature" },
        options.corsOrigins,
      );
      return true;
    }
  } else if (circle.kind === "discord") {
    const publicKey = (circle as any).publicKey ?? (circle as any).secret ?? process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: "Discord public key is not configured" },
        options.corsOrigins,
      );
      return true;
    }
    const timestamp = String(request.headers["x-signature-timestamp"] ?? "");
    const signature = String(request.headers["x-signature-ed25519"] ?? "");
    const rawBody = (request as any).rawBody ?? "";
    if (!verifyDiscordSignature(publicKey, timestamp, rawBody, signature)) {
      sendJson(
        response,
        request,
        401,
        { error: "Unauthorized", message: "Invalid Discord signature" },
        options.corsOrigins,
      );
      return true;
    }
  }

  const message = adapter.normalize(circle, body);
  if (!message) {
    sendJson(response, request, 200, { ignored: true }, options.corsOrigins);
    return true;
  }
  if ("challenge" in message && message.challenge) {
    sendJson(response, request, 200, { challenge: message.challenge }, options.corsOrigins);
    return true;
  }
  if ("pong" in message && message.pong) {
    sendJson(response, request, 200, { type: 1 }, options.corsOrigins);
    return true;
  }

  const circleMessage = message as CircleMessage;

  // Acknowledge immediately and process asynchronously
  sendJson(
    response,
    request,
    202,
    { deferred: true, circle: circle.name, sessionId: circleMessage.sessionId },
    options.corsOrigins,
  );

  Promise.resolve().then(async () => {
    try {
      const result = await handleCircleMessage(options, flowBus, circleMessage, (circle as any).allowFrom ?? []);
      if (result.paired && "response" in result && adapter.send) {
        let chatId: string | undefined;
        if (circle.kind === "telegram") {
          chatId = readTelegramChatId(body);
        } else if (circle.kind === "slack") {
          chatId = (body as any).event?.channel;
        } else if (circle.kind === "discord") {
          chatId = (body as any).channel_id ?? (body as any).message?.channel_id;
        }
        if (chatId) {
          await adapter.send(circle, chatId, result.response.content);
        } else {
          console.warn(`[gate] Could not resolve chatId to send response for circle ${circle.name}`);
        }
      } else if (!result.paired && adapter.send) {
        let chatId: string | undefined;
        if (circle.kind === "telegram") chatId = readTelegramChatId(body);
        else if (circle.kind === "slack") chatId = (body as any).event?.channel;
        else if (circle.kind === "discord") chatId = (body as any).channel_id ?? (body as any).message?.channel_id;
        if (chatId) {
          await adapter.send(circle, chatId, result.message);
        }
      }
    } catch (err) {
      console.error(`[gate] Error during deferred circle message processing for ${circle.name}:`, err);
    }
  });

  return true;
}

// --- Internal Helpers ---

export async function listenGateServer(options: GateServerOptions): Promise<GateServerHandle> {
  const server = await createGateHttpServer(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? options.config.gatewayPort;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const normalizedHost = address.address === "::" ? "127.0.0.1" : address.address;
  const url = `http://${normalizedHost}:${address.port}`;
  await writeGateState(options.workspace, {
    pid: process.pid,
    url,
    host: normalizedHost,
    port: address.port,
    workspace: options.workspace,
    startedAt: new Date().toISOString(),
  });
  server.once("close", () => {
    void clearGateState(options.workspace).catch(() => undefined);
  });
  return {
    server,
    url,
    status: getGateStatus(options.config, options.workspace),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function createApprovalBroker(): {
  readonly prompt: (request: PermissionRequest) => Promise<PermissionDecision>;
  readonly list: () => readonly any[];
  readonly decide: (id: string, decision: PermissionDecision) => any;
} {
  const pending = new Map<string, any>();
  return {
    prompt(request) {
      return new Promise<PermissionDecision>((resolve) => {
        const id = randomUUID();
        const timeout = setTimeout(() => {
          pending.delete(id);
          resolve({ allowed: false, reason: "approval timed out" });
        }, 300_000);
        timeout.unref();
        pending.set(id, {
          summary: {
            id,
            rune: request.rune,
            risk: request.risk,
            sessionId: request.sessionId,
            workspace: request.workspace,
            input: request.input,
            createdAt: new Date().toISOString(),
          },
          resolve,
          timeout,
        });
      });
    },
    list() {
      return [...pending.values()].map((item) => item.summary);
    },
    decide(id, decision) {
      const item = pending.get(id);
      if (!item) throw new Error(`Unknown approval: ${id}`);
      clearTimeout(item.timeout);
      pending.delete(id);
      item.resolve(decision);
      return item.summary;
    },
  };
}

function gatePolicy(options: GateServerOptions): unknown {
  return {
    vows: options.config.allowedRisks,
    barrier: options.config.sandboxMode,
    approvals: options.approvals ?? false,
  };
}

function gateProviders(config: RuntimeConfig): unknown {
  return {
    current: {
      shard: config.provider,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl ?? null,
    },
    fallbackShards: config.fallbackShards,
  };
}

function isPublicCircleRoute(config: RuntimeConfig, parts: readonly string[]): boolean {
  if (parts[0] !== "circles" || !parts[1]) return false;
  const circle = circleByName(config, parts[1]);
  if (!circle) return false;
  if (circle.kind === "webhook" && parts[2] === "message") return true;
  return (circle.kind === "slack" || circle.kind === "discord") && parts[2] === circle.kind;
}

function createSessionId(): string {
  return `soul-${new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function parseLimit(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return fallback;
  return parsed;
}

function readMemoryScope(body: Record<string, unknown>): "chronicle" | "workspace" | "note" {
  const value = readOptionalString(body, "scope") ?? "note";
  if (value === "chronicle" || value === "workspace" || value === "note") return value;
  throw new Error("Memory scope must be chronicle, workspace, or note");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  flowBus: FlowBus,
  corsOrigins?: readonly string[],
): void {
  response.writeHead(200, {
    ...corsHeaders(request, corsOrigins),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const serialize = (event: Flow) => ({ ...event, at: event.at.toISOString() });
  for (const event of flowBus.snapshot()) response.write(`data: ${JSON.stringify(serialize(event))}\n\n`);
  const stop = flowBus.listen((event) => response.write(`data: ${JSON.stringify(serialize(event))}\n\n`));
  request.on("close", stop);
}

function streamChat(
  request: IncomingMessage,
  response: ServerResponse,
  options: GateServerOptions,
  flowBus: FlowBus,
  prompt: string,
  sessionId?: string,
): void {
  response.writeHead(200, {
    ...corsHeaders(request, options.corsOrigins),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  void runChatTurn({
    config: options.config,
    workspace: options.workspace,
    prompt,
    sessionId: sessionId ?? options.config.sessionId,
    flowBus,
    trace: options.trace,
    onText: (text) => response.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`),
  })
    .then((result) => {
      response.write(`data: ${JSON.stringify({ type: "done", response: result.response })}\n\n`);
      response.end();
    })
    .catch((error) => {
      response.write(
        `data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error) })}\n\n`,
      );
      response.end();
    });
}

async function handleCircleMessage(
  options: GateServerOptions,
  flowBus: FlowBus,
  message: CircleMessage,
  allowFrom: readonly string[],
): Promise<any> {
  const gate = await requireSenderAllowed(options.workspace, message.circle, message.from, allowFrom);
  if (!gate.allowed)
    return {
      circle: message.circle,
      from: message.from,
      paired: false,
      pairingCode: (gate as any).pairing.code,
      message: `Approve with: rimuru pairing approve ${(gate as any).pairing.code}`,
    };
  const sessionId = message.sessionId ?? options.config.sessionId;
  const result = await runChatTurn({
    config: options.config,
    workspace: options.workspace,
    prompt: `Circle ${message.circle} message from ${message.from}: ${message.text}`,
    sessionId,
    flowBus,
    trace: options.trace,
  });
  return { circle: message.circle, from: message.from, sessionId, paired: true, response: result.response };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("Body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    (request as any).rawBody = "";
    return {};
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  (request as any).rawBody = rawBody;
  return JSON.parse(rawBody);
}

function readPrompt(body: Record<string, unknown>): string {
  return readOptionalString(body, "prompt") ?? readOptionalString(body, "message") ?? readString(body, "text");
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing string field: ${key}`);
  return value;
}

function readNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Missing number field: ${key}`);
  return value;
}

function readArtifactKind(body: Record<string, unknown>): any {
  const value = body.kind;
  if (["markdown", "html", "text", "json"].includes(value as string)) return value;
  throw new Error("Invalid artifact kind");
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptional(body: Record<string, unknown>, key: string): unknown {
  return body[key];
}

function sendEmpty(
  response: ServerResponse,
  request: IncomingMessage,
  status: number,
  corsOrigins?: readonly string[],
): void {
  response.writeHead(status, corsHeaders(request, corsOrigins));
  response.end();
}

function sendHtml(
  response: ServerResponse,
  request: IncomingMessage,
  status: number,
  body: string,
  corsOrigins?: readonly string[],
): void {
  response.writeHead(status, { ...corsHeaders(request, corsOrigins), "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

function sendJson(
  response: ServerResponse,
  request: IncomingMessage,
  status: number,
  body: unknown,
  corsOrigins?: readonly string[],
): void {
  response.writeHead(status, {
    ...corsHeaders(request, corsOrigins),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function corsHeaders(request?: IncomingMessage, allowedOrigins?: readonly string[]): Record<string, string> {
  const origin = request?.headers.origin;
  const isAllowed =
    !origin ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin === "http://localhost" ||
    origin === "http://127.0.0.1" ||
    (allowedOrigins?.includes(origin) ?? false);
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Rimuru-Token, X-Webhook-Secret, X-Slack-Request-Timestamp, X-Slack-Signature, X-Signature-Timestamp, X-Signature-Ed25519",
    Vary: "Origin",
  };
}

function readTelegramChatId(body: Record<string, unknown>): string | undefined {
  const message = (body.message ?? body.edited_message) as any;
  const id = message?.chat?.id;
  return id ? String(id) : undefined;
}

function setupRituals(options: GateServerOptions, flowBus: FlowBus) {
  let ritualRunning = false;
  const ritualTimer = setInterval(() => {
    if (ritualRunning) return;
    ritualRunning = true;
    void runDueRituals(options.workspace, new Date(), async (ritual) => {
      await runChatTurn({
        config: options.config,
        workspace: options.workspace,
        prompt: ritual.prompt,
        sessionId: ritual.sessionId,
        flowBus,
        trace: options.trace,
      });
    }).finally(() => {
      ritualRunning = false;
    });
  }, 60_000);
  ritualTimer.unref();
}

function setupCircles(options: GateServerOptions, flowBus: FlowBus) {
  // Register WhatsApp adapter
  registerCircleAdapter(WHATSAPP_ADAPTER);

  // Initialize active circles
  const circles = listCircles(options.config);
  for (const c of circles) {
    const config = circleByName(options.config, c.name);
    if (!config || !config.enabled) continue;

    const adapter = getCircleAdapter(config.kind);
    if (adapter?.start) {
      void adapter.start(config, { workspace: options.workspace, flowBus }).catch((err) => {
        console.error(`[gate] Failed to start active circle ${config.name}:`, err);
      });
    }
  }
}
