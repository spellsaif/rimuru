import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listenGateServer, type RuntimeConfig } from "../src/index.js";

describe("Gate HTTP server", () => {
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
      gatewayPort: 19710
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0 });
    try {
      await expect(fetchJson(`${gate.url}/gate/status`)).resolves.toMatchObject({ name: "rimuru-gate", soul: "default", shard: "mock" });
      await expect(fetchJson(`${gate.url}/runes`)).resolves.toMatchObject({ runes: expect.arrayContaining([expect.objectContaining({ name: "workspace.search" })]) });

      const chat = await fetchJson(`${gate.url}/chat`, { method: "POST", body: JSON.stringify({ prompt: "hello" }) });
      expect(chat).toMatchObject({ response: { content: expect.stringContaining("Rimuru heard") } });

      await expect(fetchJson(`${gate.url}/sessions`, { method: "POST", body: JSON.stringify({ sessionId: "work" }) })).resolves.toMatchObject({ sessionId: "work", created: true });
      await expect(fetchJson(`${gate.url}/sessions/work/summary`)).resolves.toMatchObject({ sessionId: "work" });
      await expect(fetchJson(`${gate.url}/gate/overview`)).resolves.toMatchObject({ policy: { vows: ["read"] }, providers: { current: { shard: "mock" } } });
      await expect(fetchJson(`${gate.url}/sessions`)).resolves.toMatchObject({ sessions: expect.arrayContaining(["default", "work"]) });
      await expect(fetchJson(`${gate.url}/circles`)).resolves.toMatchObject({ circles: [expect.objectContaining({ name: "local", kind: "local", endpoint: "/circles/local/message" })] });
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
      gatewayPort: 19710
    };
    const gate = await listenGateServer({ config, workspace: root, port: 0, approvals: true });
    try {
      const call = fetchJson(`${gate.url}/runes/call`, {
        method: "POST",
        body: JSON.stringify({ name: "workspace.shell", input: { command: "node", args: ["--version"] } })
      });
      const approval = await waitForApproval(gate.url);
      expect(approval).toMatchObject({ rune: "workspace.shell", risk: "execute" });

      await expect(fetchJson(`${gate.url}/approvals/${approval.id}/approve`, { method: "POST", body: JSON.stringify({ scope: "once" }) })).resolves.toMatchObject({ approved: { id: approval.id } });
      await expect(call).resolves.toMatchObject({ output: { stdout: expect.stringContaining("v") } });
      await expect(fetchJson(`${gate.url}/audit?limit=10`)).resolves.toMatchObject({ events: expect.arrayContaining([expect.objectContaining({ type: "rune.completed", rune: "workspace.shell" })]) });
    } finally {
      await gate.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  expect(response.ok).toBe(true);
  if (response.headers.get("content-type")?.includes("text/html")) return response.text();
  return response.json() as Promise<unknown>;
}

async function waitForApproval(url: string): Promise<{ readonly id: string; readonly rune: string; readonly risk: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const approvals = (await fetchJson(`${url}/approvals`)) as { readonly pending?: readonly { readonly id: string; readonly rune: string; readonly risk: string }[] };
    const [approval] = approvals.pending ?? [];
    if (approval) return approval;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for Gate approval");
}
