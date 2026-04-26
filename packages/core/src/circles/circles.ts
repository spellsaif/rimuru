import type { CircleConfig, RuntimeConfig } from "../config/runtime-config.js";

export interface CircleSummary {
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly paired: boolean;
}

export interface CircleMessage {
  readonly circle: string;
  readonly from: string;
  readonly text: string;
  readonly sessionId?: string;
  readonly raw: unknown;
}

/**
 * Channel Adapter interface.
 * Standardizes how different messaging platforms interact with Rimuru.
 */
export interface CircleAdapter {
  readonly kind: string;
  normalize(circle: CircleConfig, body: Record<string, unknown>): CircleMessage | { readonly challenge?: string; readonly pong?: boolean } | undefined;
  send?(circle: CircleConfig, chatId: string, text: string): Promise<void>;
}

export const TELEGRAM_ADAPTER: CircleAdapter = {
  kind: "telegram",
  normalize(circle, update) {
    const message = readRecord(update.message) ?? readRecord(update.edited_message);
    if (!message) return undefined;
    const chat = readRecord(message.chat);
    const from = readRecord(message.from);
    const text = typeof message.text === "string" ? message.text : undefined;
    if (!chat || !text) return undefined;
    const sender = String(from?.username ?? from?.id ?? chat.id ?? "telegram");
    return { circle: circle.name, from: sender, text, ...(circle.sessionId ? { sessionId: circle.sessionId } : {}), raw: update };
  },
  async send(circle, chatId, text) {
    const token = circle.tokenEnv ? process.env[circle.tokenEnv] : undefined;
    if (!token) throw new Error(`Missing Telegram token for circle ${circle.name}`);
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  }
};

export const SLACK_ADAPTER: CircleAdapter = {
  kind: "slack",
  normalize(circle, body) {
    if (typeof body.challenge === "string") return { challenge: body.challenge };
    const event = readRecord(body.event);
    if (!event || typeof event.text !== "string") return undefined;
    const from = String(event.user ?? event.channel ?? "slack");
    return { circle: circle.name, from, text: event.text, ...(circle.sessionId ? { sessionId: circle.sessionId } : {}), raw: body };
  }
};

export const DISCORD_ADAPTER: CircleAdapter = {
  kind: "discord",
  normalize(circle, body) {
    if (body.type === 1) return { pong: true };
    const data = readRecord(body.data);
    const message = readRecord(body.message);
    const user = readRecord(body.user) ?? readRecord(readRecord(body.member)?.user);
    const author = readRecord(message?.author) ?? readRecord(body.author);
    const content = typeof body.content === "string" ? body.content : typeof message?.content === "string" ? message.content : typeof data?.name === "string" ? `/${data.name}` : undefined;
    if (!content) return undefined;
    const from = String(user?.username ?? user?.id ?? author?.username ?? author?.id ?? body.channel_id ?? "discord");
    return { circle: circle.name, from, text: content, ...(circle.sessionId ? { sessionId: circle.sessionId } : {}), raw: body };
  }
};

const ADAPTERS: Record<string, CircleAdapter> = {
  telegram: TELEGRAM_ADAPTER,
  slack: SLACK_ADAPTER,
  discord: DISCORD_ADAPTER
};

export function getCircleAdapter(kind: string): CircleAdapter | undefined {
  return ADAPTERS[kind];
}

export function listCircles(config: RuntimeConfig): readonly CircleSummary[] {
  return normalizedCircles(config).map((circle) => ({
    name: circle.name,
    kind: circle.kind,
    enabled: circle.enabled !== false,
    endpoint: endpointFor(circle),
    paired: circle.allowFrom?.includes("*") ?? false
  }));
}

export function circleByName(config: RuntimeConfig, name: string): CircleConfig | undefined {
  return normalizedCircles(config).find((circle) => circle.name === name && circle.enabled !== false);
}

export function normalizeLocalCircleMessage(body: Record<string, unknown>, sessionId: string): CircleMessage {
  return {
    circle: "local",
    from: typeof body.from === "string" ? body.from : "local",
    text: typeof body.message === "string" ? body.message : typeof body.prompt === "string" ? body.prompt : String(body.text ?? ""),
    sessionId: typeof body.sessionId === "string" ? body.sessionId : sessionId,
    raw: body
  };
}

function normalizedCircles(config: RuntimeConfig): readonly CircleConfig[] {
  return config.circles.length > 0 ? config.circles : [{ name: "local", kind: "local", enabled: true }];
}

function endpointFor(circle: CircleConfig): string {
  if (["telegram", "slack", "discord"].includes(circle.kind)) return `/circles/${circle.name}/${circle.kind}`;
  return `/circles/${circle.name}/message`;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
