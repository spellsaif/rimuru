import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk } from "../core/types.js";
export interface GeminiOptions {
    readonly apiKey: string;
    readonly model: string;
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
}
export declare class GeminiShard implements Shard {
    #private;
    readonly name = "gemini";
    constructor(options: GeminiOptions);
    complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse>;
    stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk>;
}
