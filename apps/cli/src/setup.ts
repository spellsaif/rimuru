import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import {
  type CircleConfig,
  type ProviderKind,
  FlowBus,
  JsonChronicle,
  JsonTraceStore,
  Sovereign,
  createShard,
  loadRuntimeConfig,
  writeSystemdUserService,
} from "@rimuru/core";
import { setVaultSecret } from "@rimuru/vault";
import { runInteractiveTui } from "./interactive.js";
import { ansi } from "./ansi.js";

export interface SetupOptions {
  readonly workspace: string;
  readonly provider?: ProviderKind;
  readonly model?: string;
  readonly vessel?: string;
  readonly soul?: string;
  readonly vows?: readonly string[];
  readonly barrier?: "none" | "readonly" | "docker" | "wasi";
  readonly gatewayPort?: number;
  readonly circles?: readonly CircleConfig[];
  readonly force?: boolean;
}

export interface SetupResult {
  readonly configPath: string;
  readonly created: readonly string[];
}

export async function setupWorkspace(options: SetupOptions): Promise<SetupResult> {
  const root = options.workspace;
  const created = ["sessions", "traces", "plugins", "rollbacks", "canvas", "rituals"].map((name) =>
    join(root, ".rimuru", name),
  );
  for (const path of created) await mkdir(path, { recursive: true });
  const configPath = join(root, "rimuru.config.json");
  const vessel = options.vessel ?? "main";
  const provider = options.provider ?? "openai-compatible";

  const config = {
    vessel,
    gatewayPort: options.gatewayPort ?? 19710,
    vessels: {
      [vessel]: {
        shard: provider,
        model: options.model ?? defaultModel(provider),
        soul: options.soul ?? "default",
        vows: options.vows ?? ["read"],
        barrier: options.barrier ?? "none",
      },
    },
    circles: options.circles ?? [{ name: "local", kind: "local", enabled: true }],
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    flag: options.force ? "w" : "wx",
  }).catch((error: unknown) => {
    if (!options.force && typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      return;
    throw error;
  });
  await createOnboardingDocs(root, config);
  return { configPath, created };
}

async function createOnboardingDocs(root: string, config: any) {
  const rimuruMd = `
# 🌌 RIMURU WORKSPACE

Welcome to your Sovereign Assistant workspace. This directory is now a secure hub for AI interaction.

## 🧭 Concepts

- **Workspace**: This directory (${root}). Rimuru has permissions to interact with files here based on your "Vows".
- **Vows (Permissions)**: Your current settings allow: \`${config.vessels[config.vessel].vows.join(", ")}\`.
- **Soul (Identity)**: Defined in \`SOUL.md\`. This is how Rimuru sees itself and behaves.
- **Vault**: Secure storage for your API keys and secrets (hidden in \`.rimuru/\`).
- **Memory**: Every interaction is stored in \`.rimuru/sessions\` to provide long-term context.

## 🛠️ Commands

- \`rimuru dash\`: See everything connected at once.
- \`rimuru chat\`: Start a conversation.
- \`rimuru agent\`: Give Rimuru a goal to solve using your workspace tools.

## 🔗 Everything is Connected
Your Vault provides the keys, your Soul provides the personality, and your Workspace provides the tools (Runes). Rimuru orchestrates them all to serve you.
`;

  const soulMd = `
# 👤 RIMURU SOUL

You are Rimuru, a powerful and precise Sovereign Assistant.
You are running in a local workspace with the following purpose:
- Be direct and useful.
- Prefer explicit actions over hidden magic.
- Maintain safety and observability at all times.

You are here to help the user manage their code, tasks, and data within this directory.

## Guidelines for Custom Runes (workspace.compileRune)
- **Use TypeScript by default:** Always use \`typescript\` for lightweight logic, formatting, calculators, text manipulation, and simple algorithms.
- **Write Pure JS/TS Code:** In TypeScript runes, do not import Node.js APIs (e.g. \`fs\`, \`path\`) or non-standard Web APIs (like \`TextEncoder\`/\`TextDecoder\`), as they are not available in the QuickJS sandbox. Just write standard JS functions that return serializable values.
- **DO NOT write Wasm memory wrappers for TS:** TypeScript runes are evaluated in a standard JavaScript engine (QuickJS) and **do not** compile to WebAssembly. Do not write AssemblyScript or memory pointer/malloc boilerplate for TS runes.
- **Rust is fallback only:** Use \`rust\` only for CPU-bound computations. Remember that compiling Rust targeting WASI requires a \`fn main() {}\` function (even if it's empty) to build successfully.
- **Instant Chat Registration:** Once you successfully call \`workspace.compileRune\`, the custom rune is automatically registered in-memory as a chat tool named \`custom.<rune_name>\`. Inform the user that it is ready to be used immediately in the chat session, and **do not** print generic instructions on how to manually import or run the file.
`;

  await writeFile(join(root, "RIMURU.md"), rimuruMd.trim() + "\n", "utf8");
  await writeFile(join(root, "SOUL.md"), soulMd.trim() + "\n", "utf8");
}

export async function setupWorkspaceInteractive(
  options: Pick<SetupOptions, "workspace" | "force">,
): Promise<SetupResult> {
  p.intro(chalk.bgCyan.black(" RIMURU AWAKENING "));

  const project = await p.group(
    {
      provider: () =>
        p.select({
          message: "Choose your AI Overlord (Provider):",
          options: [
            { label: "Anthropic (Claude)", value: "anthropic" },
            { label: "OpenRouter (Universal)", value: "openrouter" },
            { label: "Gemini (Google)", value: "gemini" },
            { label: "Ollama (Local-First)", value: "ollama" },
            { label: "OpenAI-Compatible", value: "openai-compatible" },
          ],
        }),
      apiKey: ({ results }) => {
        if (results.provider === "ollama") return Promise.resolve("");
        return p.password({
          message: `API Key for ${results.provider}:`,
          validate: (v) => (v && v.length < 5 ? "API key seems too short" : undefined),
        });
      },
      model: ({ results }) =>
        p.text({
          message: "Model Name:",
          initialValue: defaultModel(results.provider as ProviderKind),
        }),
      vows: () =>
        p.multiselect({
          message: "What 'Vows' (Permissions) do you grant?",
          options: [
            { label: "Read (Files & Workspace)", value: "read" },
            { label: "Write (Create & Edit)", value: "write" },
            { label: "Execute (Shell & Tools)", value: "execute" },
            { label: "Network (Remote access)", value: "network" },
          ],
          initialValues: ["read"],
        }),
      barrier: () =>
        p.select({
          message: "Sandbox Protection (Barrier):",
          options: [
            { label: "None (Raw access)", value: "none" },
            { label: "Read-only (Safety first)", value: "readonly" },
            { label: "Docker (Maximum isolation)", value: "docker" },
            { label: "WASI (Lightweight WebAssembly sandbox)", value: "wasi" },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel("Awakening cancelled.");
        process.exit(0);
      },
    },
  );

  // --- CIRCLES & WEBHOOKS ONBOARDING ---
  const setupCircles = await p.confirm({
    message: "Would you like to configure external messaging channels (Circles)?",
    initialValue: false,
  });

  const circles: CircleConfig[] = [{ name: "local", kind: "local", enabled: true }];
  if (setupCircles && !p.isCancel(setupCircles)) {
    const circleKind = await p.select({
      message: "Which Circle platform would you like to configure?",
      options: [
        { label: "Slack", value: "slack" },
        { label: "Discord", value: "discord" },
        { label: "Telegram", value: "telegram" },
      ],
    });

    if (circleKind && !p.isCancel(circleKind)) {
      const circleName = await p.text({
        message: "Enter a name for this Circle channel:",
        initialValue: `my-${circleKind}`,
      });

      if (circleName && !p.isCancel(circleName)) {
        if (circleKind === "slack") {
          const token = await p.password({ message: "Slack Bot Token (xoxb-...):" });
          const signingSecret = await p.password({ message: "Slack Signing Secret:" });
          if (token && !p.isCancel(token) && signingSecret && !p.isCancel(signingSecret)) {
            circles.push({
              name: String(circleName),
              kind: "slack",
              enabled: true,
              token: String(token),
              signingSecret: String(signingSecret),
            });
          }
        } else if (circleKind === "discord") {
          const token = await p.password({ message: "Discord Bot Token:" });
          const publicKey = await p.password({ message: "Discord Public Key (for webhook signature verification):" });
          if (token && !p.isCancel(token) && publicKey && !p.isCancel(publicKey)) {
            circles.push({
              name: String(circleName),
              kind: "discord",
              enabled: true,
              token: String(token),
              publicKey: String(publicKey),
            });
          }
        } else if (circleKind === "telegram") {
          const token = await p.password({ message: "Telegram Bot Token:" });
          if (token && !p.isCancel(token)) {
            circles.push({
              name: String(circleName),
              kind: "telegram",
              enabled: true,
              token: String(token),
            });
          }
        }
      }
    }
  }

  // --- BACKGROUND DAEMON (SYSTEMD USER SERVICE) ONBOARDING ---
  const installDaemon = await p.confirm({
    message: "Would you like to install Rimuru as a background autostart daemon (systemd user service)?",
    initialValue: false,
  });

  const spinner = p.spinner();
  spinner.start("Forging workspace...");

  const result = await setupWorkspace({
    workspace: options.workspace,
    provider: project.provider as ProviderKind,
    model: project.model as string,
    vows: project.vows as string[],
    barrier: project.barrier as any,
    circles,
    force: true,
  });

  const apiKey = project.apiKey as string;
  if (apiKey) {
    const provider = project.provider as string;
    const envKey =
      provider === "openai-compatible" ? "RIMURU_API_KEY" : `RIMURU_${provider.toUpperCase().replace("-", "_")}_KEY`;
    await setVaultSecret(options.workspace, "RIMURU_API_KEY", apiKey);
    await setVaultSecret(options.workspace, envKey, apiKey);
  }

  if (installDaemon && !p.isCancel(installDaemon)) {
    try {
      await writeSystemdUserService({ workspace: options.workspace });
    } catch (err: any) {
      p.log.warn(`Could not install systemd service: ${err.message}`);
    }
  }

  spinner.stop("Workspace forged.");

  p.note(
    `1. Edit ${chalk.cyan("SOUL.md")} to change personality.\n2. Add tools to folders with ${chalk.cyan("RUNE.md")}.\n3. View your manifest in ${chalk.cyan("RIMURU.md")}.`,
    "Next Steps",
  );

  p.outro(`Run ${chalk.cyan("rimuru dash")} to see the live dashboard.`);

  // --- SEAMLESS HANDOVER TO TUI ---
  const startChat = await p.confirm({
    message: "Would you like to start talking to Rimuru now?",
    initialValue: true,
  });

  if (startChat && !p.isCancel(startChat)) {
    process.stdout.write(ansi.clear);
    const config = await loadRuntimeConfig({ workspace: options.workspace });
    const flowBus = new FlowBus();
    const chronicle = new JsonChronicle(resolve(config.memoryDir));

    await runInteractiveTui({
      sovereign: new Sovereign({ shard: createShard(config), chronicle, flowBus }),
      flowBus,
      chronicle,
      traceStore: new JsonTraceStore(resolve(options.workspace, ".rimuru", "traces")),
      workspace: options.workspace,
      sessionId: config.sessionId,
      provider: config.provider,
      model: config.model,
    });
  }

  return result;
}

function defaultModel(provider: ProviderKind): string {
  switch (provider) {
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    case "gemini":
      return "gemini-1.5-pro";
    case "ollama":
      return "llama3.1";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "openai-compatible":
      return "gpt-4.1-mini";
    default:
      return "gpt-4";
  }
}
