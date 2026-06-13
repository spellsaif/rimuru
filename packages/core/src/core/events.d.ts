import type { Flow } from "./types.js";
export type FlowListener = (event: Flow) => void;
export declare class FlowBus {
    #private;
    emit(event: Flow): void;
    listen(listener: FlowListener): () => void;
    snapshot(): readonly Flow[];
}
