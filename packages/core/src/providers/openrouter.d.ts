import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk } from "../core/types.js";
export interface OpenRouterOptions {
    readonly baseUrl?: string;
    readonly apiKey: string;
    readonly model: string;
    readonly fetchImpl?: typeof fetch;
}
export declare class OpenRouterShard implements Shard {
    #private;
    readonly name = "openrouter";
    constructor(options: OpenRouterOptions);
    complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse>;
    stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk>;
}
