import { parentPort, workerData } from "node:worker_threads";

export interface VesselWorkerData {
  readonly vesselId: string;
  readonly name: string;
  readonly shard: string;
  readonly model: string;
  readonly soul?: string;
  readonly vows: readonly string[];
  readonly barrier: string;
  readonly workspace: string;
  readonly sessionId: string;
  readonly memoryDir: string;
}

export interface VesselWorkerMessage {
  readonly type: "ping" | "pong" | "objective" | "sync" | "shutdown" | "result" | "error";
  readonly payload?: unknown;
}

if (parentPort) {
  const data = workerData as VesselWorkerData;
  let running = true;

  parentPort.on("message", async (message: VesselWorkerMessage) => {
    if (!running) return;

    switch (message.type) {
      case "ping":
        parentPort!.postMessage({ type: "pong", payload: { vesselId: data.vesselId } });
        break;

      case "objective": {
        try {
          const { runAgentTurn } = await import("../runtime/runtime.js");
          const { loadRuntimeConfig } = await import("../config/runtime-config.js");

          const config = await loadRuntimeConfig({ workspace: data.workspace });
          const vesselConfig = {
            ...config,
            vesselId: data.vesselId,
            allowedRisks: data.vows,
            sessionId: data.sessionId,
            provider: data.shard as any,
            model: data.model,
            sandboxMode: data.barrier as any,
          };

          const result = await runAgentTurn({
            config: vesselConfig,
            workspace: data.workspace,
            objective: message.payload as string,
            sessionId: data.sessionId,
          });

          parentPort!.postMessage({
            type: "result",
            payload: {
              vesselId: data.vesselId,
              response: result.final.response.content,
              observations: result.observations,
            },
          });
        } catch (error) {
          parentPort!.postMessage({
            type: "error",
            payload: {
              vesselId: data.vesselId,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
        break;
      }

      case "sync":
        parentPort!.postMessage({
          type: "result",
          payload: { vesselId: data.vesselId, synced: true },
        });
        break;

      case "shutdown":
        running = false;
        parentPort!.postMessage({ type: "result", payload: { vesselId: data.vesselId, shutdown: true } });
        process.exit(0);
        break;
    }
  });

  parentPort.postMessage({ type: "pong", payload: { vesselId: data.vesselId, ready: true } });
}
