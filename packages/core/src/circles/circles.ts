import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { CircleConfig, RuntimeConfig } from "../config/runtime-config.js";
import type { FlowBus } from "../core/events.js";

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
  normalize(
    circle: CircleConfig,
    body: Record<string, unknown>,
  ): CircleMessage | { readonly challenge?: string; readonly pong?: boolean } | undefined;
  send?(circle: CircleConfig, chatId: string, text: string): Promise<void>;
  start?(circle: CircleConfig, context: { workspace: string; flowBus: FlowBus }): Promise<void>;
}

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = createHmac("sha256", signingSecret);
  hmac.update(baseString);
  const computed = `v0=${hmac.digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function verifyDiscordSignature(
  publicKeyHex: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): boolean {
  try {
    const signature = Buffer.from(signatureHex, "hex");
    const data = Buffer.from(timestamp + rawBody, "utf8");
    const header = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
    const keyBuffer = Buffer.concat([header, Buffer.from(publicKeyHex, "hex")]);
    const publicKey = createPublicKey({
      key: keyBuffer,
      format: "der",
      type: "spki",
    });
    return verify(undefined, data, publicKey, signature);
  } catch (error) {
    console.error("[circles] Discord signature verification error:", error);
    return false;
  }
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
    const sessionId = circle.sessionId || `telegram-${circle.name}-${chat.id}`;
    return { circle: circle.name, from: sender, text, sessionId, raw: update };
  },
  async send(circle, chatId, text) {
    const token = circle.tokenEnv ? process.env[circle.tokenEnv] : (circle.token ?? process.env.TELEGRAM_BOT_TOKEN);
    if (!token) throw new Error(`Missing Telegram token for circle ${circle.name}`);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(`Telegram API error: ${json.description}`);
    }
  },
};

export const SLACK_ADAPTER: CircleAdapter = {
  kind: "slack",
  normalize(circle, body) {
    if (typeof body.challenge === "string") return { challenge: body.challenge };
    const event = readRecord(body.event);
    if (!event || typeof event.text !== "string") return undefined;
    const from = String(event.user ?? event.channel ?? "slack");
    const threadSuffix = event.thread_ts ? `-${event.thread_ts}` : "";
    const sessionId = circle.sessionId || `slack-${circle.name}-${event.channel ?? "default"}${threadSuffix}`;
    return { circle: circle.name, from, text: event.text, sessionId, raw: body };
  },
  async send(circle, chatId, text) {
    const token = circle.tokenEnv ? process.env[circle.tokenEnv] : (circle.token ?? process.env.SLACK_BOT_TOKEN);
    if (!token) throw new Error(`Missing Slack token for circle ${circle.name}`);
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: chatId, text }),
    });
    if (!res.ok) {
      throw new Error(`Slack postMessage failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(`Slack API error: ${json.error}`);
    }
  },
};

export const DISCORD_ADAPTER: CircleAdapter = {
  kind: "discord",
  normalize(circle, body) {
    if (body.type === 1) return { pong: true };
    const data = readRecord(body.data);
    const message = readRecord(body.message);
    const user = readRecord(body.user) ?? readRecord(readRecord(body.member)?.user);
    const author = readRecord(message?.author) ?? readRecord(body.author);
    const content =
      typeof body.content === "string"
        ? body.content
        : typeof message?.content === "string"
          ? message.content
          : typeof data?.name === "string"
            ? `/${data.name}`
            : undefined;
    if (!content) return undefined;
    const from = String(user?.username ?? user?.id ?? author?.username ?? author?.id ?? body.channel_id ?? "discord");
    const channelId = String(body.channel_id ?? message?.channel_id ?? "default");
    const sessionId = circle.sessionId || `discord-${circle.name}-${channelId}`;
    return { circle: circle.name, from, text: content, sessionId, raw: body };
  },
  async send(circle, chatId, text) {
    const token = circle.tokenEnv ? process.env[circle.tokenEnv] : (circle.token ?? process.env.DISCORD_BOT_TOKEN);
    if (!token) throw new Error(`Missing Discord token for circle ${circle.name}`);
    const res = await fetch(`https://discord.com/api/v10/channels/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${token}`,
      },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) {
      throw new Error(`Discord message post failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as any;
    if (json.code) {
      throw new Error(`Discord API error: ${json.message} (code ${json.code})`);
    }
  },
};

const ADAPTERS: Map<string, CircleAdapter> = new Map();

export function registerCircleAdapter(adapter: CircleAdapter): void {
  ADAPTERS.set(adapter.kind, adapter);
}

// Register default adapters
registerCircleAdapter(TELEGRAM_ADAPTER);
registerCircleAdapter(SLACK_ADAPTER);
registerCircleAdapter(DISCORD_ADAPTER);

export function getCircleAdapter(kind: string): CircleAdapter | undefined {
  return ADAPTERS.get(kind);
}

export function listCircles(config: RuntimeConfig): readonly CircleSummary[] {
  return normalizedCircles(config).map((circle) => ({
    name: circle.name,
    kind: circle.kind,
    enabled: circle.enabled !== false,
    endpoint: endpointFor(circle),
    paired: circle.allowFrom?.includes("*") ?? false,
  }));
}

export function circleByName(config: RuntimeConfig, name: string): CircleConfig | undefined {
  return normalizedCircles(config).find((circle) => circle.name === name && circle.enabled !== false);
}

export function normalizeLocalCircleMessage(body: Record<string, unknown>, sessionId: string): CircleMessage {
  return {
    circle: "local",
    from: typeof body.from === "string" ? body.from : "local",
    text:
      typeof body.message === "string"
        ? body.message
        : typeof body.prompt === "string"
          ? body.prompt
          : String(body.text ?? ""),
    sessionId: typeof body.sessionId === "string" ? body.sessionId : sessionId,
    raw: body,
  };
}

function normalizedCircles(config: RuntimeConfig): readonly CircleConfig[] {
  return config.circles.length > 0 ? config.circles : [{ name: "local", kind: "local", enabled: true }];
}

function endpointFor(circle: CircleConfig): string {
  if (["telegram", "slack", "discord"].includes(circle.kind)) return `/circles/${circle.name}/${circle.kind}`;
  if (circle.kind === "whatsapp") return "/circles/whatsapp/status";
  return `/circles/${circle.name}/message`;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
