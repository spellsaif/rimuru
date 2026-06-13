import { FlowBus } from "./events.js";
import type { Chronicle, RunRequest, RunResult, Shard } from "./types.js";
export interface SovereignOptions {
    readonly shard: Shard;
    readonly chronicle: Chronicle;
    readonly systemPrompt?: string;
    readonly flowBus?: FlowBus;
    readonly clock?: () => Date;
}
export declare class Sovereign {
    #private;
    constructor(options: SovereignOptions);
    run(request: RunRequest): Promise<RunResult>;
    private systemMessage;
    private complete;
}
