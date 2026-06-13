import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk } from "../core/types.js";
export interface OpenAICompatibleOptions {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly model: string;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
}
export declare class OpenAICompatibleShard implements Shard {
    #private;
    readonly name = "openai-compatible";
    constructor(options: OpenAICompatibleOptions);
    complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse>;
    stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk>;
}
