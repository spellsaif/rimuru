import type { AssistantResponse, Message, Shard } from "../core/types.js";
export declare class MockShard implements Shard {
    readonly name = "mock";
    complete(messages: readonly Message[]): Promise<AssistantResponse>;
}
