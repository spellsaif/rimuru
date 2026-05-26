import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, afterEach } from "vitest";
import { setupWorkspace } from "../apps/cli/src/setup.js";
import { writeSystemdUserService } from "../src/index.js";

describe("CLI Wizard & Diagnostics Onboarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setupWorkspace writes circles configuration and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-wizard-test-"));
    try {
      const result = await setupWorkspace({
        workspace: root,
        provider: "mock",
        model: "mock-model",
        vows: ["read", "write"],
        barrier: "none",
        circles: [
          { name: "local", kind: "local", enabled: true },
          { name: "my-slack", kind: "slack", enabled: true, token: "xoxb-test", signingSecret: "secret-test" }
        ],
        force: true
      });

      expect(existsSync(result.configPath)).toBe(true);

      const rawConfig = await readFile(result.configPath, "utf8");
      const config = JSON.parse(rawConfig);

      expect(config.vessels.main.shard).toBe("mock");
      expect(config.vessels.main.model).toBe("mock-model");
      expect(config.vessels.main.vows).toEqual(["read", "write"]);
      expect(config.circles).toHaveLength(2);
      expect(config.circles[1]).toEqual({
        name: "my-slack",
        kind: "slack",
        enabled: true,
        token: "xoxb-test",
        signingSecret: "secret-test"
      });

      // Verify that missing folders are created
      expect(existsSync(join(root, ".rimuru", "sessions"))).toBe(true);
      expect(existsSync(join(root, ".rimuru", "traces"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writeSystemdUserService creates service configurations in the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "rimuru-systemd-test-"));
    try {
      await mkdir(join(root, ".rimuru"), { recursive: true });

      await writeSystemdUserService({ workspace: root, path: join(root, ".rimuru", "service", "rimuru.service") });

      const serviceFile = join(root, ".rimuru", "service", "rimuru.service");
      expect(existsSync(serviceFile)).toBe(true);

      const content = await readFile(serviceFile, "utf8");
      expect(content).toContain("[Unit]");
      expect(content).toContain("Description=Rimuru Gate");
      expect(content).toContain("ExecStart=");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
