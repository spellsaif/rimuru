import type { Flow } from "./types.js";

export type FlowListener = (event: Flow) => void;

export class FlowBus {
  readonly #events: Flow[] = [];
  readonly #listeners = new Set<FlowListener>();

  emit(event: Flow): void {
    this.#events.push(event);
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  listen(listener: FlowListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  snapshot(): readonly Flow[] {
    return [...this.#events];
  }
}
