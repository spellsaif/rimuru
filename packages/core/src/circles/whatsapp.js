import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { runChatTurn } from "../runtime/runtime.js";
// Keep track of active clients for the 'send' method
const ACTIVE_CLIENTS = new Map();
function getBrowserPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    if (process.platform === "win32") {
        const paths = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : "",
        ].filter(Boolean);
        for (const p of paths) {
            if (existsSync(p))
                return p;
        }
    }
    else if (process.platform === "darwin") {
        const paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ];
        for (const p of paths) {
            if (existsSync(p))
                return p;
        }
    }
    else if (process.platform === "linux") {
        const commands = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
        for (const cmd of commands) {
            try {
                const path = execSync(`which ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
                    .toString()
                    .trim();
                if (path)
                    return path;
            }
            catch { }
        }
        const paths = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
        for (const p of paths) {
            if (existsSync(p))
                return p;
        }
    }
    return undefined;
}
/**
 * Basic Markdown to WhatsApp formatter.
 */
function formatForWhatsApp(text) {
    return (text
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
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)"));
}
/**
 * WhatsApp Circle Adapter using local QR code pairing.
 */
export const WHATSAPP_ADAPTER = {
    kind: "whatsapp",
    normalize(circle, body) {
        return undefined;
    },
    async send(circle, chatId, text) {
        const client = ACTIVE_CLIENTS.get(circle.name);
        if (!client)
            throw new Error(`WhatsApp client for circle ${circle.name} is not active`);
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
                dataPath: join(workspace, ".rimuru", "circles", circle.name, "auth"),
            }),
            puppeteer: {
                executablePath: browserPath,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            },
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
                data: { qr },
            });
        });
        client.on("ready", () => {
            console.log(`[whatsapp] Circle ${circle.name} is READY!`);
            flowBus.emit({
                type: "circle.connected",
                at: new Date(),
                circle: circle.name,
                kind: "whatsapp",
            });
        });
        ACTIVE_CLIENTS.set(circle.name, client);
        const recentReplies = new Set();
        const recentTexts = new Set();
        const handleMessage = async (msg) => {
            // STRICT PERSONAL MODE: Only handle messages sent to MYSELF
            const contact = await client.getContactById(msg.to);
            if (!msg.fromMe || !contact.isMe)
                return;
            const from = msg.from;
            const text = msg.body;
            // LOOP PREVENTION: Don't reply to our own messages (ID or Content match)
            if (recentReplies.has(msg.id.id) || recentTexts.has(text))
                return;
            // Skip if it's a status update, empty, or a bot's own system message
            if (!text || msg.isStatus || text.startsWith("⚠️") || text.startsWith("❌"))
                return;
            console.log(`[whatsapp] Handling personal message: ${text}`);
            flowBus.emit({
                type: "circle.message_received",
                at: new Date(),
                circle: circle.name,
                from: "me", // Abstracted for privacy
                text,
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
                            if (window.WWebJS) {
                                await window.WWebJS.sendChatstate("composing", chatId);
                            }
                        }, msg.from);
                    }
                    console.log(`[whatsapp] Typing indicator active.`);
                }
                catch (e) {
                    console.warn("[whatsapp] Failed to send typing state:", e);
                }
                const result = await runChatTurn({
                    config,
                    workspace,
                    prompt: text,
                    sessionId: circle.sessionId ?? config.sessionId,
                    flowBus,
                });
                // Add text to loop prevention cache BEFORE sending
                const answer = formatForWhatsApp(result.response.content);
                recentTexts.add(answer);
                if (recentTexts.size > 20) {
                    const first = recentTexts.values().next().value;
                    if (first)
                        recentTexts.delete(first);
                }
                // Reply back on WhatsApp
                const reply = await msg.reply(answer);
                // Add to loop prevention cache (ID)
                recentReplies.add(reply.id.id);
                if (recentReplies.size > 50) {
                    const first = recentReplies.values().next().value;
                    if (first)
                        recentReplies.delete(first);
                }
                console.log(`[whatsapp] Personal reply sent.`);
            }
            catch (error) {
                console.error(`[whatsapp] Error:`, error);
                await msg.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        // Listen to both, but only process if fromMe
        client.on("message", handleMessage);
        client.on("message_create", handleMessage);
        await client.initialize();
    },
};
//# sourceMappingURL=whatsapp.js.map