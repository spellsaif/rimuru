import { circleByName, getCircleAdapter } from "../circles/circles.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import type { Rune } from "../core/types.js";

export const sendMessageRune: Rune<
  { readonly circle: string; readonly chatId: string; readonly text: string },
  { readonly sent: boolean }
> = {
  name: "circles.sendMessage",
  description: "Sends a message to an external paired channel/chat on a Circle platform (e.g. Slack or Telegram).",
  risk: "network",
  inputSchema: {
    type: "object",
    required: ["circle", "chatId", "text"],
    properties: {
      circle: { type: "string" },
      chatId: { type: "string" },
      text: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    required: ["sent"],
    properties: {
      sent: { type: "boolean" },
    },
  },
  async invoke(input, context) {
    const config = await loadRuntimeConfig({ workspace: context.workspace });
    const circle = circleByName(config, input.circle);
    if (!circle) {
      throw new Error(`Circle not found or disabled: ${input.circle}`);
    }
    const adapter = getCircleAdapter(circle.kind);
    if (!adapter) {
      throw new Error(`Circle adapter kind not supported: ${circle.kind}`);
    }
    if (!adapter.send) {
      throw new Error(`Circle adapter for ${circle.kind} does not support sending messages`);
    }
    await adapter.send(circle, input.chatId, input.text);
    return { sent: true };
  },
};
