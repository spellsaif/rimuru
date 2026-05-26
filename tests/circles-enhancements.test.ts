import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { 
  verifySlackSignature, 
  verifyDiscordSignature, 
  TELEGRAM_ADAPTER, 
  SLACK_ADAPTER, 
  DISCORD_ADAPTER,
  sendMessageRune
} from "../packages/core/src/index.js";

describe("Circles & Webhooks Enhancements", () => {
  describe("Dynamic Session Partitioning", () => {
    it("partitions Telegram sessions dynamically per chat", () => {
      const circle = { name: "my-telegram", kind: "telegram", enabled: true } as any;
      const update = {
        message: {
          chat: { id: 12345 },
          from: { id: 67890, username: "testuser" },
          text: "hello bot"
        }
      };
      const msg = TELEGRAM_ADAPTER.normalize(circle, update) as any;
      expect(msg).toBeDefined();
      expect(msg.sessionId).toBe("telegram-my-telegram-12345");
      expect(msg.from).toBe("testuser");
    });

    it("partitions Slack sessions dynamically per channel and thread", () => {
      const circle = { name: "my-slack", kind: "slack", enabled: true } as any;
      
      // Without thread
      const body1 = {
        event: {
          channel: "C9999",
          user: "U1111",
          text: "slack message"
        }
      };
      const msg1 = SLACK_ADAPTER.normalize(circle, body1) as any;
      expect(msg1.sessionId).toBe("slack-my-slack-C9999");
      expect(msg1.from).toBe("U1111");

      // With thread
      const body2 = {
        event: {
          channel: "C9999",
          user: "U1111",
          text: "slack thread message",
          thread_ts: "123456.789"
        }
      };
      const msg2 = SLACK_ADAPTER.normalize(circle, body2) as any;
      expect(msg2.sessionId).toBe("slack-my-slack-C9999-123456.789");
    });

    it("partitions Discord sessions dynamically per channel", () => {
      const circle = { name: "my-discord", kind: "discord", enabled: true } as any;
      const body = {
        channel_id: "D8888",
        author: { id: "A2222", username: "discorduser" },
        content: "discord message"
      };
      const msg = DISCORD_ADAPTER.normalize(circle, body) as any;
      expect(msg.sessionId).toBe("discord-my-discord-D8888");
      expect(msg.from).toBe("discorduser");
    });
  });

  describe("Webhook Cryptographic Signature Verification", () => {
    it("verifies Slack signature correctly", () => {
      const secret = "slacksecret";
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = '{"event":{"text":"hello"}}';
      
      // Calculate valid signature
      const crypto = require("node:crypto");
      const baseString = `v0:${timestamp}:${rawBody}`;
      const hmac = crypto.createHmac("sha256", secret).update(baseString).digest("hex");
      const signature = `v0=${hmac}`;

      const isValid = verifySlackSignature(secret, timestamp, rawBody, signature);
      expect(isValid).toBe(true);

      const isInvalid = verifySlackSignature(secret, timestamp, rawBody, "v0=wronghmac");
      expect(isInvalid).toBe(false);

      // Replay attack prevention check (timestamp > 5 mins old)
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
      const oldBaseString = `v0:${oldTimestamp}:${rawBody}`;
      const oldHmac = crypto.createHmac("sha256", secret).update(oldBaseString).digest("hex");
      const oldSignature = `v0=${oldHmac}`;
      expect(verifySlackSignature(secret, oldTimestamp, rawBody, oldSignature)).toBe(false);
    });

    it("verifies Discord Ed25519 signatures correctly", () => {
      const crypto = require("node:crypto");
      
      // Generate a transient Ed25519 keypair for testing
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
      
      // Export public key as raw public key (32 bytes)
      const spki = publicKey.export({ format: "der", type: "spki" });
      const rawPublicKeyHex = spki.subarray(spki.length - 32).toString("hex");

      const timestamp = "12345678";
      const rawBody = '{"content":"ping"}';
      const data = Buffer.from(timestamp + rawBody, "utf8");
      
      const signature = crypto.sign(undefined, data, privateKey);
      const signatureHex = signature.toString("hex");

      const isValid = verifyDiscordSignature(rawPublicKeyHex, timestamp, rawBody, signatureHex);
      expect(isValid).toBe(true);

      const isInvalid = verifyDiscordSignature(rawPublicKeyHex, timestamp, rawBody, "abcdef");
      expect(isInvalid).toBe(false);
    });
  });

  describe("Outgoing Adapter Send Methods", () => {
    beforeAll(() => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({ ok: true, message: "sent" })
        };
      }));
    });

    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it("calls Slack chat.postMessage correctly", async () => {
      const circle = { name: "my-slack", kind: "slack", token: "xoxb-test" } as any;
      await SLACK_ADAPTER.send!(circle, "C123", "hello from tests");
      
      expect(fetch).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer xoxb-test",
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({ channel: "C123", text: "hello from tests" })
        })
      );
    });

    it("calls Discord message post correctly", async () => {
      const circle = { name: "my-discord", kind: "discord", token: "bot-token" } as any;
      await DISCORD_ADAPTER.send!(circle, "D123", "hello from tests");
      
      expect(fetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/channels/D123/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bot bot-token",
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({ content: "hello from tests" })
        })
      );
    });
  });
});
