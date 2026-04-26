import { describe, expect, it } from "vitest";
import { renderDashboard, renderFullScreenTui } from "../src/index.js";

describe("renderDashboard", () => {
  it("renders an empty console", () => {
    const output = renderDashboard({ title: "Rimuru", subtitle: "Tempest OS", events: [] });

    expect(output).toContain("Rimuru");
    expect(output).toContain("Tempest OS");
    expect(output).toContain("No flow events yet");
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

    expect(output).toContain("Rimuru Sovereign Console");
    expect(output).toContain("mock/mock");
    expect(output).toContain("Conversation");
    expect(output).toContain("Chronicle");
    expect(output).toContain("trace.json");
  });
});
