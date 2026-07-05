import { Worker } from "node:worker_threads";
import { resolve, join } from "node:path";
import { CrdtBus } from "./crdt-bus.js";
export { CrdtBus };
export type { CrdtEntry, CrdtMergeEvent, CrdtSyncEvent } from "./crdt-bus.js";
import type { VesselWorkerData, VesselWorkerMessage } from "./vessel-worker.js";
import type { Message } from "../core/types.js";

export type SwarmTopology = "star" | "mesh" | "ring";

export interface VesselPeerConfig {
  readonly name: string;
  readonly shard: string;
  readonly model?: string;
  readonly vows: readonly string[];
  readonly role?: string;
  readonly soul?: string;
  readonly barrier?: string;
}

export interface SwarmConfig {
  readonly vessels: readonly VesselPeerConfig[];
  readonly topology: SwarmTopology;
}

export interface SwarmVesselHandle {
  readonly name: string;
  readonly vesselId: string;
  readonly worker: Worker;
  ready(): Promise<boolean>;
  run(objective: string): Promise<string>;
  shutdown(): Promise<void>;
}

export interface SwarmResult {
  readonly vesselId: string;
  readonly name: string;
  readonly response: string;
  readonly durationMs: number;
}

export class Swarm {
  readonly #crdtBus: CrdtBus;
  readonly #vessels: SwarmVesselHandle[] = [];
  readonly #config: SwarmConfig;
  readonly #workspace: string;

  constructor(config: SwarmConfig, workspace: string, sovereignId: string) {
    this.#config = config;
    this.#workspace = workspace;
    this.#crdtBus = new CrdtBus(sovereignId);
  }

  get crdtBus(): CrdtBus {
    return this.#crdtBus;
  }

  get vessels(): readonly SwarmVesselHandle[] {
    return [...this.#vessels];
  }

  async start(): Promise<void> {
    for (const vesselConfig of this.#config.vessels) {
      const handle = await this.#spawnVessel(vesselConfig);
      this.#vessels.push(handle);
    }

    if (this.#config.topology === "mesh") {
      this.#setupMeshGossip();
    } else if (this.#config.topology === "ring") {
      this.#setupRingGossip();
    } else {
      this.#setupStarGossip();
    }
  }

  async dispatchToAll(objective: string): Promise<readonly SwarmResult[]> {
    const startTime = Date.now();
    const results: SwarmResult[] = [];

    for (const vessel of this.#vessels) {
      try {
        const response = await vessel.run(objective);
        results.push({
          vesselId: vessel.vesselId,
          name: vessel.name,
          response,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          vesselId: vessel.vesselId,
          name: vessel.name,
          response: `Error: ${error instanceof Error ? error.message : String(error)}`,
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  async dispatchToOne(name: string, objective: string): Promise<SwarmResult> {
    const vessel = this.#vessels.find((v) => v.name === name);
    if (!vessel) throw new Error(`Unknown vessel: ${name}`);

    const startTime = Date.now();
    const response = await vessel.run(objective);
    return {
      vesselId: vessel.vesselId,
      name: vessel.name,
      response,
      durationMs: Date.now() - startTime,
    };
  }

  async shutdown(): Promise<void> {
    for (const vessel of this.#vessels) {
      await vessel.shutdown();
    }
    this.#vessels.length = 0;
  }

  broadcastChronicleEntry(sessionId: string, message: Message): void {
    this.#crdtBus.append(sessionId, message);
  }

  async #spawnVessel(vesselConfig: VesselPeerConfig): Promise<SwarmVesselHandle> {
    const vesselId = `vessel-${vesselConfig.name}-${Math.random().toString(36).substring(2, 8)}`;
    const workerPath = resolve(join(__dirname, "vessel-worker.js"));

    const workerData: VesselWorkerData = {
      vesselId,
      name: vesselConfig.name,
      shard: vesselConfig.shard,
      model: vesselConfig.model ?? "mock",
      soul: vesselConfig.soul,
      vows: vesselConfig.vows,
      barrier: vesselConfig.barrier ?? "none",
      workspace: this.#workspace,
      sessionId: `swarm-${vesselConfig.name}`,
      memoryDir: join(this.#workspace, ".rimuru", "sessions"),
    };

    const worker = new Worker(workerPath, { workerData });

    const handle: SwarmVesselHandle = {
      name: vesselConfig.name,
      vesselId,
      worker,
      ready: () => this.#waitForReady(worker, vesselId),
      run: (objective: string) => this.#sendObjective(worker, vesselId, objective),
      shutdown: () => this.#shutdownVessel(worker, vesselId),
    };

    await handle.ready();
    return handle;
  }

  async #waitForReady(worker: Worker, vesselId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const handler = (message: VesselWorkerMessage) => {
        if (message.type === "pong" && (message.payload as any)?.vesselId === vesselId) {
          worker.off("message", handler);
          resolve(true);
        }
      };
      worker.on("message", handler);
      worker.postMessage({ type: "ping" });
    });
  }

  async #sendObjective(worker: Worker, vesselId: string, objective: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const handler = (message: VesselWorkerMessage) => {
        if ((message.payload as any)?.vesselId !== vesselId) return;
        if (message.type === "result") {
          worker.off("message", handler);
          resolve((message.payload as any).response);
        } else if (message.type === "error") {
          worker.off("message", handler);
          reject(new Error((message.payload as any).error));
        }
      };
      worker.on("message", handler);
      worker.postMessage({ type: "objective", payload: objective });
    });
  }

  async #shutdownVessel(worker: Worker, vesselId: string): Promise<void> {
    return new Promise((resolve) => {
      const handler = (message: VesselWorkerMessage) => {
        if ((message.payload as any)?.vesselId !== vesselId) return;
        worker.off("message", handler);
        resolve();
      };
      worker.on("message", handler);
      worker.postMessage({ type: "shutdown" });
    });
  }

  #setupStarGossip(): void {
    let lastClock = 0;
    setInterval(() => {
      const entries = this.#crdtBus.getEntries(lastClock);
      if (entries.length > 0) {
        for (const vessel of this.#vessels) {
          this.#crdtBus.syncToPeer(vessel.vesselId, entries);
        }
        lastClock = this.#crdtBus.getClock();
      }
    }, 100);
  }

  #setupMeshGossip(): void {
    this.#setupStarGossip();
  }

  #setupRingGossip(): void {
    this.#setupStarGossip();
  }
}
