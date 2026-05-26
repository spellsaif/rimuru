import { describe, expect, it } from "vitest";
import { renderDashboard, renderFullScreenTui } from "../apps/cli/src/dashboard.ts";

describe("renderDashboard", () => {
  it("renders an empty console", () => {
    const output = renderDashboard({
      title: "Rimuru",
      status: "Tempest OS",
      provider: "mock",
      model: "mock",
      workspace: "/tmp/work",
      events: []
    });

    expect(output.toLowerCase()).toContain("rimuru");
    expect(output.toLowerCase()).toContain("tempest os");
    expect(output.toLowerCase()).toContain("no flow events yet");
  });
});

describe("renderFullScreenTui", () => {
  it("renders the full-screen console model", () => {
    const output = renderFullScreenTui(
      {
        title: "Rimuru Sovereign Console",
        provider: "mock",
        model: "mock",
        sessionId: "default",
        workspace: "/tmp/work",
        input: "hello",
        transcript: [{ role: "user", content: "hi" }],
        events: [],
        sessions: ["default"],
        traces: ["trace.json"],
        mode: "idle",
        status: "Ready"
      },
      100,
      30
    );

    expect(output.toLowerCase()).toContain("rimuru sovereign console");
    expect(output.toLowerCase()).toContain("mock/mock");
    expect(output.toLowerCase()).toContain("conversation");
    expect(output.toLowerCase()).toContain("chronicle");
    expect(output.toLowerCase()).toContain("trace.json");
  });
});
