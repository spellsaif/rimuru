import type { AssistantResponse, Message, Shard } from "../core/types.js";

export class MockShard implements Shard {
  readonly name = "mock";

  async complete(messages: readonly Message[]): Promise<AssistantResponse> {
    const userMessage = messages[messages.length - 1];
    const content = `Rimuru heard: ${userMessage ? userMessage.content : ""}`;
    return { content };
  }
}
