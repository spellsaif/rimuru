import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

import type { CircleConfig } from "../config/runtime-config.js";
import type { CircleAdapter, CircleMessage } from "./circles.js";
import type { FlowBus } from "../core/events.js";
import { runChatTurn } from "../runtime/runtime.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { requireSenderAllowed } from "../security/pairing.js";

// Keep track of active clients for the 'send' method
const ACTIVE_CLIENTS: Map<string, any> = new Map();

function getBrowserPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  if (process.platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : ""
    ].filter(Boolean);
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (process.platform === "linux") {
    const commands = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
    for (const cmd of commands) {
      try {
        const path = execSync(`which ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        if (path) return path;
      } catch {}
    }
    const paths = [
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

/**
 * Basic Markdown to WhatsApp formatter.
 */
function formatForWhatsApp(text: string): string {
  return text
    // Bold: **text** or __text__ -> *text*
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .replace(/__(.*?)__/g, "*$1*")
    // Headers: # Header -> *HEADER*
    .replace(/^# (.*$)/gm, "*$1*")
    .replace(/^## (.*$)/gm, "*$1*")
    .replace(/^### (.*$)/gm, "*$1*")
    // Lists: - item -> • item
    .replace(/^- /gm, "• ")
    // Links: [text](url) -> text (url)
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)");
}



/**
 * WhatsApp Circle Adapter using local QR code pairing.
 */
export const WHATSAPP_ADAPTER: CircleAdapter = {
  kind: "whatsapp",

  normalize(circle, body): CircleMessage | undefined {
    return undefined;
  },

  async send(circle, chatId, text) {
    const client = ACTIVE_CLIENTS.get(circle.name);
    if (!client) throw new Error(`WhatsApp client for circle ${circle.name} is not active`);
    await client.sendMessage(chatId, text);
  },


  async start(circle, { workspace, flowBus }) {
    console.log(`[whatsapp] Initializing WhatsApp Circle: ${circle.name}...`);

    const browserPath = getBrowserPath();
    if (!browserPath) {
      throw new Error(`[whatsapp] Could not automatically locate Google Chrome or Chromium. Please set the PUPPETEER_EXECUTABLE_PATH environment variable.`);
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: join(workspace, ".rimuru", "circles", circle.name, "auth")
      }),
      puppeteer: {
        executablePath: browserPath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      }
    });


    client.on("qr", (qr) => {
      console.log(`[whatsapp] Scan this QR code to connect ${circle.name}:`);
      qrcode.generate(qr, { small: true });
      
      // Emit flow event so UI can display it
      flowBus.emit({
        type: "circle.pairing_requested",
        at: new Date(),
        circle: circle.name,
        kind: "whatsapp",
        data: { qr }
      });
    });

    client.on("ready", () => {
      console.log(`[whatsapp] Circle ${circle.name} is READY!`);
      flowBus.emit({
        type: "circle.connected",
        at: new Date(),
        circle: circle.name,
        kind: "whatsapp"
      });
    });

    ACTIVE_CLIENTS.set(circle.name, client);


    const RECENT_REPLIES = new Set<string>();
    const RECENT_TEXTS = new Set<string>();

    const handleMessage = async (msg: any) => {
        // STRICT PERSONAL MODE: Only handle messages sent to MYSELF
        const contact = await client.getContactById(msg.to);
        if (!msg.fromMe || !contact.isMe) return;

        const from = msg.from;
        const text = msg.body;

        // LOOP PREVENTION: Don't reply to our own messages (ID or Content match)
        if (RECENT_REPLIES.has(msg.id.id) || RECENT_TEXTS.has(text)) return;




        // Skip if it's a status update, empty, or a bot's own system message
        if (!text || msg.isStatus || text.startsWith("⚠️") || text.startsWith("❌")) return;

        console.log(`[whatsapp] Handling personal message: ${text}`);

        flowBus.emit({
            type: "circle.message_received",
            at: new Date(),
            circle: circle.name,
            from: "me", // Abstracted for privacy
            text
        });

        try {
            const config = await loadRuntimeConfig({ workspace });
            
            console.log(`[whatsapp] Sovereign reasoning...`);
            
            // Show "Typing..." indicator while thinking
            try {
                await client.sendPresenceAvailable();
                // Send typing state directly to the chat ID for speed
            if (client.pupPage) {
                await client.pupPage.evaluate(async (chatId) => {
                    if ((window as any).WWebJS) {
                        await (window as any).WWebJS.sendChatstate('composing', chatId);
                    }
                }, msg.from);
            }

                console.log(`[whatsapp] Typing indicator active.`);
            } catch (e) {
                console.warn("[whatsapp] Failed to send typing state:", e);
            }


            const result = await runChatTurn({



                config,
                workspace,
                prompt: text,
                sessionId: circle.sessionId ?? config.sessionId,
                flowBus
            });

            // Add text to loop prevention cache BEFORE sending
            const answer = formatForWhatsApp(result.response.content);
            RECENT_TEXTS.add(answer);
            if (RECENT_TEXTS.size > 20) {
                const first = RECENT_TEXTS.values().next().value;
                if (first) RECENT_TEXTS.delete(first);
            }

            // Reply back on WhatsApp
            const reply = await msg.reply(answer);
            
            // Add to loop prevention cache (ID)
            RECENT_REPLIES.add(reply.id.id);
            if (RECENT_REPLIES.size > 50) {
                const first = RECENT_REPLIES.values().next().value;
                if (first) RECENT_REPLIES.delete(first);
            }

            console.log(`[whatsapp] Personal reply sent.`);

        } catch (error) {
            console.error(`[whatsapp] Error:`, error);
            await msg.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    // Listen to both, but only process if fromMe
    client.on("message", handleMessage);
    client.on("message_create", handleMessage);




    await client.initialize();
  }
};
