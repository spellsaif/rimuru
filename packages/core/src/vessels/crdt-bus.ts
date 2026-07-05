import { EventEmitter } from "node:events";
import type { Message } from "../core/types.js";

export interface CrdtEntry {
  readonly sessionId: string;
  readonly vesselId: string;
  readonly logicalClock: number;
  readonly message: Message;
}

export interface CrdtSyncEvent {
  readonly type: "sync";
  readonly entries: readonly CrdtEntry[];
  readonly fromVessel: string;
}

export interface CrdtMergeEvent {
  readonly type: "merge";
  readonly entry: CrdtEntry;
}

export class CrdtBus {
  readonly #entries: CrdtEntry[] = [];
  readonly #vesselId: string;
  readonly #emitter = new EventEmitter();
  readonly #peerHandlers = new Map<string, (entry: CrdtEntry) => void>();
  #clock = 0;

  constructor(vesselId: string) {
    this.#vesselId = vesselId;
  }

  get vesselId(): string {
    return this.#vesselId;
  }

  append(sessionId: string, message: Message): CrdtEntry {
    this.#clock++;
    const entry: CrdtEntry = {
      sessionId,
      vesselId: this.#vesselId,
      logicalClock: this.#clock,
      message,
    };
    this.#entries.push(entry);
    this.#emitter.emit("merge", { type: "merge", entry });
    return entry;
  }

  merge(entries: readonly CrdtEntry[]): void {
    for (const entry of entries) {
      const existing = this.#entries.find(
        (e) => e.vesselId === entry.vesselId && e.logicalClock === entry.logicalClock,
      );
      if (!existing) {
        this.#entries.push(entry);
        this.#emitter.emit("merge", { type: "merge", entry });
      }
    }
  }

  getEntries(sinceClock = 0): readonly CrdtEntry[] {
    return this.#entries.filter((e) => e.logicalClock > sinceClock || e.vesselId !== this.#vesselId);
  }

  getEntriesForSession(sessionId: string): readonly CrdtEntry[] {
    return this.#entries.filter((e) => e.sessionId === sessionId);
  }

  getAllEntries(): readonly CrdtEntry[] {
    return [...this.#entries];
  }

  getClock(): number {
    return this.#clock;
  }

  registerPeer(vesselId: string, handler: (entry: CrdtEntry) => void): void {
    this.#peerHandlers.set(vesselId, handler);
  }

  unregisterPeer(vesselId: string): void {
    this.#peerHandlers.delete(vesselId);
  }

  syncToPeer(vesselId: string, entries: readonly CrdtEntry[]): void {
    const handler = this.#peerHandlers.get(vesselId);
    if (handler) {
      for (const entry of entries) {
        handler(entry);
      }
    }
  }

  onMerge(handler: (event: CrdtMergeEvent) => void): () => void {
    this.#emitter.on("merge", handler);
    return () => this.#emitter.off("merge", handler);
  }

  toMessages(sessionId: string): readonly Message[] {
    return [...this.getEntriesForSession(sessionId)]
      .sort((a: CrdtEntry, b: CrdtEntry) => {
        if (a.logicalClock !== b.logicalClock) return a.logicalClock - b.logicalClock;
        return a.vesselId.localeCompare(b.vesselId);
      })
      .map((e: CrdtEntry) => e.message);
  }
}
