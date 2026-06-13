import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listenGateServer } from "../packages/gate/src/index.ts";
import type { RuntimeConfig } from "../src/index.js";

describe("Gate HTTP server", () => {
  it("requires gateway authorization for local circle messages when a token is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-auth-"));
    const previousToken = process.env.RIMURU_GATEWAY_TOKEN;
    process.env.RIMURU_GATEWAY_TOKEN = "gate-token";
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "default",
      memoryDir: join(root, ".rimuru", "sessions"),
      allowedRisks: ["read"],
      sandboxMode: "none",
      vessels: {},
      fallbackShards: [],
      circles: [{ name: "local", kind: "local", enabled: true, allowFrom: ["*"] }],
      gatewayPort: 19710,
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0 });
    try {
      const denied = await fetch(`${gate.url}/circles/local/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(denied.status).toBe(401);

      const allowed = await fetch(`${gate.url}/circles/local/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer gate-token" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(allowed.status).toBe(200);
    } finally {
      if (previousToken === undefined) delete process.env.RIMURU_GATEWAY_TOKEN;
      else process.env.RIMURU_GATEWAY_TOKEN = previousToken;
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows browser preflights to send gateway authorization headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-cors-"));
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "default",
      memoryDir: join(root, ".rimuru", "sessions"),
      allowedRisks: ["read"],
      sandboxMode: "none",
      vessels: {},
      fallbackShards: [],
      circles: [{ name: "local", kind: "local", enabled: true, allowFrom: ["*"] }],
      gatewayPort: 19710,
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0 });
    try {
      const response = await fetch(`${gate.url}/chat`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
    } finally {
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serves status, runes, sessions, and chat", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-"));
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "default",
      memoryDir: join(root, ".rimuru", "sessions"),
      allowedRisks: ["read"],
      sandboxMode: "none",
      vessels: {},
      fallbackShards: [],
      circles: [{ name: "local", kind: "local", enabled: true, allowFrom: ["*"] }],
      gatewayPort: 19710,
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0 });
    try {
      await expect(fetchJson(`${gate.url}/gate/status`)).resolves.toMatchObject({
        name: "rimuru-gate",
        soul: "default",
        shard: "mock",
      });
      await expect(fetchJson(`${gate.url}/runes`)).resolves.toMatchObject({
        runes: expect.arrayContaining([expect.objectContaining({ name: "workspace.search" })]),
      });

      const chat = await fetchJson(`${gate.url}/chat`, { method: "POST", body: JSON.stringify({ prompt: "hello" }) });
      expect(chat).toMatchObject({ response: { content: expect.stringContaining("Rimuru heard") } });

      await expect(
        fetchJson(`${gate.url}/sessions`, { method: "POST", body: JSON.stringify({ sessionId: "work" }) }),
      ).resolves.toMatchObject({ sessionId: "work", created: true });
      await expect(fetchJson(`${gate.url}/sessions/work/summary`)).resolves.toMatchObject({ sessionId: "work" });
      await expect(fetchJson(`${gate.url}/gate/overview`)).resolves.toMatchObject({
        policy: { vows: ["read"] },
        providers: { current: { shard: "mock" } },
      });
      await expect(fetchJson(`${gate.url}/sessions`)).resolves.toMatchObject({
        sessions: expect.arrayContaining(["default", "work"]),
      });
      await expect(fetchJson(`${gate.url}/circles`)).resolves.toMatchObject({
        circles: [expect.objectContaining({ name: "local", kind: "local", endpoint: "/circles/local/message" })],
      });
      await expect(fetchJson(`${gate.url}/room`)).resolves.toEqual(expect.any(String));
    } finally {
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("queues Gate approvals and records Rune audit events", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-approvals-"));
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "default",
      memoryDir: join(root, ".rimuru", "sessions"),
      allowedRisks: ["read"],
      sandboxMode: "none",
      vessels: {},
      fallbackShards: [],
      circles: [{ name: "local", kind: "local", enabled: true, allowFrom: ["*"] }],
      gatewayPort: 19710,
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0, approvals: true });
    try {
      const call = fetchJson(`${gate.url}/runes/call`, {
        method: "POST",
        body: JSON.stringify({ name: "workspace.shell", input: { command: "node", args: ["--version"] } }),
      });
      const approval = await waitForApproval(gate.url);
      expect(approval).toMatchObject({ rune: "workspace.shell", risk: "execute" });

      await expect(
        fetchJson(`${gate.url}/approvals/${approval.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ scope: "once" }),
        }),
      ).resolves.toMatchObject({ approved: { id: approval.id } });
      await expect(call).resolves.toMatchObject({ output: { stdout: expect.stringContaining("v") } });
      await expect(fetchJson(`${gate.url}/audit?limit=10`)).resolves.toMatchObject({
        events: expect.arrayContaining([expect.objectContaining({ type: "rune.completed", rune: "workspace.shell" })]),
      });
    } finally {
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("secures custom webhooks with cryptographic verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-webhooks-"));
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "default",
      memoryDir: join(root, ".rimuru", "sessions"),
      allowedRisks: ["read"],
      sandboxMode: "none",
      vessels: {},
      fallbackShards: [],
      circles: [
        { name: "my-webhook", kind: "webhook", enabled: true, secret: "super-secret-token", allowFrom: ["*"] },
        { name: "no-secret-webhook", kind: "webhook", enabled: true, allowFrom: ["*"] },
      ],
      gatewayPort: 19711,
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0 });
    try {
      const res1 = await fetch(`${gate.url}/circles/unknown-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(res1.status).toBe(401);
      expect(await res1.json()).toMatchObject({ error: "Unauthorized" });

      const res2 = await fetch(`${gate.url}/circles/no-secret-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(res2.status).toBe(401);
      expect(await res2.json()).toMatchObject({ error: "Unauthorized" });

      const res3 = await fetch(`${gate.url}/circles/my-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer bad-token" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(res3.status).toBe(401);

      const res4 = await fetch(`${gate.url}/circles/my-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer super-secret-token" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(res4.status).toBe(202);
      expect(await res4.json()).toMatchObject({ deferred: true, circle: "my-webhook" });

      const res5 = await fetch(`${gate.url}/circles/my-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Rimuru-Token": "super-secret-token" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      expect(res5.status).toBe(202);

      const res6 = await fetch(`${gate.url}/circles/my-webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer super-secret-token" },
        body: JSON.stringify({ prompt: "hello", callbackUrl: "http://127.0.0.1:9/callback" }),
      });
      expect(res6.status).toBe(400);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  expect(response.ok).toBe(true);
  if (response.headers.get("content-type")?.includes("text/html")) return response.text();
  return response.json() as Promise<unknown>;
}

async function waitForApproval(
  url: string,
): Promise<{ readonly id: string; readonly rune: string; readonly risk: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const approvals = (await fetchJson(`${url}/approvals`)) as {
      readonly pending?: readonly { readonly id: string; readonly rune: string; readonly risk: string }[];
    };
    const [approval] = approvals.pending ?? [];
    if (approval) return approval;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for Gate approval");
}
