import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getGateRuntimeStatus, getGateStatus, readGateState, writeGateState } from "../packages/gate/src/index.ts";
import type { RuntimeConfig } from "../src/index.js";

describe("getGateStatus", () => {
  it("maps runtime config to Rimuru Gate vocabulary", () => {
    const config: RuntimeConfig = {
      vesselId: "main",
      provider: "mock",
      model: "mock",
      sessionId: "main",
      memoryDir: ".rimuru/sessions",
      allowedRisks: ["read", "write"],
      sandboxMode: "readonly",
      vessels: {},
      fallbackShards: [],
      circles: [{ name: "local", kind: "local", enabled: true }],
      gatewayPort: 19710
    };

    expect(getGateStatus(config, "/workspace")).toEqual({
      name: "rimuru-gate",
      state: "ready",
      workspace: "/workspace",
      soul: "main",
      shard: "mock",
      model: "mock",
      vows: ["read", "write"],
      barrier: "readonly"
    });
  });

  it("tracks Gate runtime state", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-gate-state-"));
    const config = runtimeConfig();
    try {
      await expect(getGateRuntimeStatus(config, root)).resolves.toMatchObject({ runtime: "stopped" });
      await writeGateState(root, { pid: process.pid, url: "http://127.0.0.1:19710", host: "127.0.0.1", port: 19710, workspace: root, startedAt: new Date(0).toISOString() });
      await expect(readGateState(root)).resolves.toMatchObject({ pid: process.pid, url: "http://127.0.0.1:19710" });
      await expect(getGateRuntimeStatus(config, root)).resolves.toMatchObject({ runtime: "running", pid: process.pid });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function runtimeConfig(): RuntimeConfig {
  return {
    vesselId: "main",
    provider: "mock",
    model: "mock",
    sessionId: "main",
    memoryDir: ".rimuru/sessions",
    allowedRisks: ["read", "write"],
    sandboxMode: "readonly",
    vessels: {},
    fallbackShards: [],
    circles: [{ name: "local", kind: "local", enabled: true }],
    gatewayPort: 19710
  };
}
