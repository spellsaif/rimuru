import type { AssistantResponse, Message, Shard, ShardOptions, StreamChunk } from "../core/types.js";
export interface AnthropicOptions {
    readonly apiKey: string;
    readonly model: string;
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
}
export declare class AnthropicShard implements Shard {
    #private;
    readonly name = "anthropic";
    constructor(options: AnthropicOptions);
    complete(messages: readonly Message[], options?: ShardOptions): Promise<AssistantResponse>;
    stream(messages: readonly Message[], options?: ShardOptions): AsyncIterable<StreamChunk>;
}
