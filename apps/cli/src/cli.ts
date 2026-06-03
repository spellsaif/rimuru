#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";
import * as net from "node:net";
import chalk from "chalk";
import { 
  FlowBus, 
  JsonChronicle, 
  JsonTraceStore, 
  Sovereign, 
  loadRuntimeConfig, 
  type ProviderKind,
  validateRuntimeConfig,
  createShard,
  planObjective,
  buildLexicalIndex,
  loadPlugins,
  createSemanticMemory,
  serveMcpStdio,
  createRuntimeRuneRegistry,
  createRuntime,
  isRisk,
  runAgentTurn,
  runChatTurn,
  applyRollback,
  inspectRollback,
  listRollbacks,
  listVessels,
  listCircles,
  approvePairing,
  listPairings,
  createRitual,
  deleteRitual,
  listRituals,
  setRitualEnabled,
  createCanvasArtifact,
  listCanvasArtifacts,
  readCanvasArtifact,
  writeSystemdUserService
} from "@rimuru/core";
import { 
  getGateStatus, 
  readGateState, 
  stopGate,
  listenGateServer,
  getGateRuntimeStatus
} from "@rimuru/gate";
import { 
  deleteVaultSecret, 
  getVaultSecret, 
  listVaultSecrets, 
  setVaultSecret 
} from "@rimuru/vault";
import { ansi, paint } from "./ansi.js";
import { renderDashboard } from "./dashboard.js";
import sirv from "sirv";
import open from "open";
import { createServer } from "node:http";

import { promptApproval, runInteractiveTui } from "./interactive.js";
import { setupWorkspace, setupWorkspaceInteractive } from "./setup.js";


const h = () => dirname(fileURLToPath(import.meta.url));

function printBanner() {
  process.stdout.write(paint("\n" + [
    "   ____  ____ __  ________  ____  __ ",
    "  / __ \\/  _/  |/  / __ / / / / / / ",
    " / /_/ // // /|_/ / /_/ / / / / / /  ",
    "/ _, _// // /  / / _, _/ /_/ /_/ /   ",
    "/_/ |_/___/_/  /_/_/ |_|\\____/\\____/ ",
    "                                      "
  ].join("\n") + "\n", ansi.cyan, ansi.bold));
  process.stdout.write(paint(`   Sovereign Runtime • v0.8.0-dev\n\n`, ansi.gray, ansi.italic));
}

import { Command } from "commander";

const program = new Command();

program
  .name("rimuru")
  .description("🌌 Rimuru: The Sovereign, Local-First AI Orchestration Kernel")
  .version("0.8.0-dev")
  .helpOption("-h, --help", "Display help menu");

program
  .command("chat [prompt...]")
  .description("Run a one-off chat turn or start TUI")
  .action(async (promptParts) => {
    printBanner();
    await chat(promptParts);
  });

program
  .command("doctor")
  .description("Verify environment and configuration diagnostics")
  .option("--json", "Output diagnostics as JSON")
  .option("--fix", "Attempt to auto-fix safe warning flags")
  .action(async () => {
    printBanner();
    await doctor();
  });

program
  .command("setup")
  .alias("init")
  .alias("awaken")
  .description("Initialize or reset a Rimuru workspace")
  .action(async () => {
    printBanner();
    await init();
  });

program
  .command("gate [args...]")
  .alias("gateway")
  .description("Manage the Gate API webhook gateway server")
  .action(async (gateArgs) => {
    printBanner();
    await gate(gateArgs);
  });

program
  .command("session [args...]")
  .alias("soul")
  .description("Manage active session identities")
  .action(async (sArgs) => {
    printBanner();
    await session(sArgs);
  });

program
  .command("vessel [args...]")
  .description("Describe or manage active vessels")
  .action(async (vArgs) => {
    printBanner();
    await vessel(vArgs);
  });

program
  .command("memory [args...]")
  .alias("chronicle")
  .description("Chronicle and semantic memory management")
  .action(async (mArgs) => {
    printBanner();
    await memory(mArgs);
  });

program
  .command("trace [args...]")
  .alias("sage")
  .description("Inspect or replay redacted execution traces")
  .action(async (tArgs) => {
    printBanner();
    await trace(tArgs);
  });

program
  .command("plugin [args...]")
  .alias("skill")
  .description("Manage workspace plugins")
  .action(async (pArgs) => {
    printBanner();
    await plugin(pArgs);
  });

program
  .command("mcp [args...]")
  .description("Serve tools over Model Context Protocol (MCP)")
  .action(async (mcpArgs) => {
    await mcp(mcpArgs);
  });

program
  .command("version")
  .description("Show current version info")
  .action(async (vArgs) => {
    await version(vArgs);
  });

program
  .command("rune [args...]")
  .alias("tool")
  .description("Invoke a policy-guarded tool")
  .action(async (rArgs) => {
    printBanner();
    await rune(rArgs);
  });

program
  .command("provider [args...]")
  .alias("shard")
  .description("Configure provider connections")
  .action(async (pArgs) => {
    printBanner();
    await provider(pArgs);
  });

program
  .command("channel [args...]")
  .alias("circle")
  .description("List circle integrations")
  .action(async (cArgs) => {
    printBanner();
    await channel(cArgs);
  });

program
  .command("pairing [args...]")
  .description("List or approve client pairings")
  .action(async (pArgs) => {
    printBanner();
    await pairing(pArgs);
  });

program
  .command("vault [args...]")
  .alias("secrets")
  .description("Manage secrets in the encrypted store")
  .action(async (vArgs) => {
    printBanner();
    await vault(vArgs);
  });

program
  .command("ritual [args...]")
  .alias("schedule")
  .description("Schedule automated prompts/tasks")
  .action(async (rArgs) => {
    printBanner();
    await ritual(rArgs);
  });

program
  .command("canvas [args...]")
  .description("Manage workspace artifacts")
  .action(async (cArgs) => {
    printBanner();
    await canvas(cArgs);
  });

program
  .command("update [args...]")
  .alias("release")
  .description("Check or install packages updates")
  .action(async (rArgs) => {
    printBanner();
    await release(rArgs);
  });

program
  .command("registry [args...]")
  .alias("guild")
  .description("Interact with the global schema registry")
  .action(async (rArgs) => {
    printBanner();
    await registry(rArgs);
  });

program
  .command("rollback [args...]")
  .alias("rewind")
  .description("Rewind file edits to previous states")
  .action(async (rArgs) => {
    printBanner();
    await rollback(rArgs);
  });

program
  .command("approval [args...]")
  .alias("pact")
  .description("Manage pending workspace change approvals")
  .action(async (aArgs) => {
    printBanner();
    await approval(aArgs);
  });

program
  .command("policy [args...]")
  .alias("vow")
  .description("Configure capability policies")
  .action(async (pArgs) => {
    printBanner();
    await policy(pArgs);
  });

program
  .command("plan [args...]")
  .description("Display objective plans")
  .action(async (pArgs) => {
    printBanner();
    await plan(pArgs);
  });

program
  .command("config [args...]")
  .alias("settings")
  .description("View or modify runtime options")
  .action(async (cArgs) => {
    printBanner();
    await configCmd(cArgs);
  });

program
  .command("dashboard")
  .alias("dash")
  .alias("ui")
  .description("View the Sovereign Dashboard")
  .action(async () => {
    printBanner();
    await webDash();
  });

program
  .command("tui")
  .description("Start the interactive split-pane terminal chat window (Ink TUI)")
  .action(async () => {
    printBanner();
    await tui();
  });

program
  .command("flow")
  .alias("loop")
  .description("Stream continuous events telemetry to the terminal")
  .action(async () => {
    printBanner();
    await flow();
  });

program
  .command("agent [objective...]")
  .description("Run a goal-oriented autonomous agent loop")
  .action(async (objParts) => {
    printBanner();
    await agent(objParts);
  });

program
  .command("index [args...]")
  .description("Rebuild project lexical and semantic databases")
  .action(async (idxArgs) => {
    printBanner();
    await indexWorkspace(idxArgs);
  });

// Set default action when no command is provided
program
  .action(async () => {
    if (process.argv.slice(2).length === 0) {
      printBanner();
      help();
    } else {
      process.stderr.write(paint(`Unknown command: ${process.argv.slice(2).join(" ")}\n`, ansi.red));
      help();
      process.exitCode = 1;
    }
  });

// Override help printing to match our beautiful existing help layout
program.on("--help", () => {
  process.stdout.write("\n");
  help();
});

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function chat(args: readonly string[]): Promise<void> {
  const prompt = args.join(" ").trim();
  if (!prompt) {
    await tui();
    return;
  }


  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const result = await runChatTurn({ config, workspace: process.cwd(), prompt, trace: process.env.RIMURU_TRACE === "1" });
  process.stdout.write(`${result.response.content}\n`);
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.connect({ port, host: "127.0.0.1" }, () => {
      client.end();
      resolve(true);
    });
    client.on("error", () => {
      resolve(false);
    });
  });
}

async function checkOllamaReachable(baseUrl = "http://127.0.0.1:11434"): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkWorkspaceWriteable(workspace: string): Promise<boolean> {
  try {
    const testFile = join(workspace, ".rimuru", ".write-test");
    await mkdir(dirname(testFile), { recursive: true });
    await writeFile(testFile, "test", "utf8");
    const content = await readFile(testFile, "utf8");
    await unlink(testFile);
    return content === "test";
  } catch {
    return false;
  }
}

async function doctor(): Promise<void> {
  const workspace = process.cwd();
  const config = await loadRuntimeConfig({ workspace });
  const json = process.argv.includes("--json");
  const fix = process.argv.includes("--fix");

  const diagnostics = [...validateRuntimeConfig(config)];

  // Check filesystem writeability
  let fsStatus = "OK";
  const writeable = await checkWorkspaceWriteable(workspace);
  if (!writeable) {
    fsStatus = "ERROR (No write access to .rimuru)";
    diagnostics.push({
      level: "error",
      code: "FS_WRITE_ERROR",
      message: "Workspace .rimuru directory is not writeable. Check file permissions."
    });
  }

  // Check API keys or Ollama connection
  let providerStatus = "OK";
  if (config.provider === "ollama") {
    const reachable = await checkOllamaReachable(config.baseUrl);
    if (!reachable) {
      providerStatus = `OFFLINE (Cannot connect to Ollama at ${config.baseUrl ?? "http://127.0.0.1:11434"})`;
      diagnostics.push({
        level: "warning",
        code: "OLLAMA_OFFLINE",
        message: `Ollama local daemon is not reachable at ${config.baseUrl ?? "http://127.0.0.1:11434"}. Make sure it is running.`
      });
    }
  } else if (config.provider !== "mock") {
    let keyExists = false;
    try {
      const vaultKey = await getVaultSecret(workspace, "RIMURU_API_KEY");
      if (vaultKey) keyExists = true;
    } catch {}
    if (!keyExists && process.env.RIMURU_API_KEY) keyExists = true;
    
    if (!keyExists) {
      providerStatus = "MISSING_API_KEY";
      diagnostics.push({
        level: "error",
        code: "MISSING_API_KEY",
        message: `API Key for ${config.provider} is missing. Set RIMURU_API_KEY in your environment or Vault.`
      });
    }
  }

  // Check Gateway Port availability
  let portStatus = "FREE";
  const portInUse = await isPortInUse(config.gatewayPort);
  if (portInUse) {
    portStatus = "IN_USE";
    diagnostics.push({
      level: "warning",
      code: "PORT_OCCUPIED",
      message: `Gateway port ${config.gatewayPort} is occupied. Verify if another instance is running.`
    });
  }

  if (fix) {
    const fixedItems: string[] = [];
    
    // 1. Create missing folders
    const subDirs = ["sessions", "traces", "plugins", "rollbacks", "canvas", "rituals", "service"];
    for (const name of subDirs) {
      const dirPath = join(workspace, ".rimuru", name);
      if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
        fixedItems.push(`Created directory .rimuru/${name}`);
      }
    }

    // 2. Install systemd user service if missing (and platform is linux)
    if (process.platform === "linux") {
      const serviceFile = join(workspace, ".rimuru", "service", "rimuru.service");
      if (!existsSync(serviceFile)) {
        try {
          await writeSystemdUserService({ workspace });
          fixedItems.push("Generated systemd user service at .rimuru/service/rimuru.service");
        } catch (err: any) {
          diagnostics.push({
            level: "error",
            code: "DAEMON_FIX_FAILED",
            message: `Failed to generate systemd service: ${err.message}`
          });
        }
      }
    }

    if (json) {
      process.stdout.write(JSON.stringify({ repaired: fixedItems, diagnostics }, null, 2) + "\n");
      return;
    }

    process.stdout.write(chalk.bgGreen.black(" RIMURU REPAIRED ") + "\n\n");
    if (fixedItems.length === 0) {
      process.stdout.write("No issues needed repairing.\n");
    } else {
      for (const item of fixedItems) {
        process.stdout.write(`- ${chalk.green(item)}\n`);
      }
    }
    process.stdout.write("\nRe-run without --fix to check active status.\n");
    return;
  }

  const checks: readonly (readonly [string, string])[] = [
    ["node", process.version],
    ["platform", process.platform],
    ["workspace", workspace],
    ["filesystem", fsStatus],
    ["provider", `${config.provider} (${providerStatus})`],
    ["model", config.model],
    ["gateway", `port ${config.gatewayPort} (${portStatus})`],
    ["session", config.sessionId],
    ["memory", config.memoryDir],
    ["risks", config.allowedRisks.join(",")],
    ["sandbox", config.sandboxMode]
  ];

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...Object.fromEntries(checks), diagnostics }, null, 2)}\n`);
    return;
  }

  process.stdout.write(chalk.bgCyan.black(" RIMURU DIAGNOSTICS ") + "\n\n");
  for (const [name, value] of checks) {
    let coloredVal = value;
    if (value.includes("ERROR") || value.includes("OFFLINE") || value.includes("MISSING")) {
      coloredVal = chalk.red(value);
    } else if (value === "OK" || value === "FREE") {
      coloredVal = chalk.green(value);
    }
    process.stdout.write(`${chalk.bold(name.padEnd(12))} ${coloredVal}\n`);
  }

  process.stdout.write("\n" + chalk.bold("DIAGNOSTIC MESSAGES:") + "\n");
  const errors = diagnostics.filter(d => d.level === "error");
  const warnings = diagnostics.filter(d => d.level === "warning");

  if (diagnostics.length === 0) {
    process.stdout.write(chalk.green("No issues found. Your Sovereign assistant workspace is healthy.\n"));
  } else {
    for (const d of diagnostics) {
      const level = d.level === "error" ? chalk.bgRed.black(" ERROR ") : chalk.bgYellow.black(" WARN  ");
      process.stdout.write(`${level} [${d.code}] ${d.message}\n`);
    }
  }
}

async function init(): Promise<void> {
  const isInteractive = process.argv.includes("--wizard") || 
                        process.argv.includes("--interactive") || 
                        (process.stdin.isTTY && process.argv.length <= 3);

  if (isInteractive) {
    const result = await setupWorkspaceInteractive({ workspace: process.cwd(), force: process.argv.includes("--force") });
    process.stdout.write(`\nInitialized Rimuru workspace at ${process.cwd()}\nConfig: ${result.configPath}\n`);
    return;
  }
  
  const model = argValue(process.argv, "--model");
  const result = await setupWorkspace({ 
    workspace: process.cwd(), 
    provider: parseProviderArg(argValue(process.argv, "--provider") ?? argValue(process.argv, "--shard") ?? "openai-compatible"), 
    ...(model ? { model } : {}), 
    vessel: argValue(process.argv, "--vessel") ?? "main", 
    soul: argValue(process.argv, "--soul") ?? "default", 
    vows: (argValue(process.argv, "--vows") ?? "read").split(",").map((vow) => vow.trim()).filter(Boolean), 
    barrier: parseBarrierArg(argValue(process.argv, "--barrier") ?? "none"), 
    gatewayPort: Number(argValue(process.argv, "--port") ?? 19710), 
    force: process.argv.includes("--force") 
  });
  process.stdout.write(`Initialized Rimuru workspace at ${process.cwd()}\nConfig: ${result.configPath}\n`);
}


async function gate(args: readonly string[]): Promise<void> {
  const subcommand = args.find((arg) => !arg.startsWith("--")) ?? "status";
  if (subcommand !== "status" && subcommand !== "start" && subcommand !== "stop" && subcommand !== "install-service") {
    process.stderr.write("Usage: rimuru gate [status|start|stop|install-service] [--host <host>] [--port <port>] [--approvals] [--json]\n");
    process.exitCode = 1;
    return;
  }

  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const status = getGateStatus(config, process.cwd());
  if (subcommand === "stop") {
    process.stdout.write(`${JSON.stringify(await stopGate(process.cwd()), null, 2)}\n`);
    return;
  }

  if (subcommand === "start") {
    const handle = await listenGateServer({ config, workspace: process.cwd(), host: argValue(args, "--host") ?? "127.0.0.1", port: Number(argValue(args, "--port") ?? config.gatewayPort), approvals: args.includes("--approvals") || process.env.RIMURU_APPROVALS === "1", trace: process.env.RIMURU_TRACE === "1" });
    if (args.includes("--json")) process.stdout.write(`${JSON.stringify({ ...handle.status, url: handle.url }, null, 2)}\n`);
    else process.stdout.write(`Rimuru Gate listening at ${handle.url}\n`);
    await new Promise<void>(() => undefined);
    return;
  }

  if (subcommand === "install-service") {
    const path = await writeSystemdUserService({ workspace: process.cwd(), port: Number(argValue(args, "--port") ?? config.gatewayPort), cliPath: resolve(process.cwd(), "dist", "cli.js") });
    process.stdout.write(`Wrote systemd user service: ${path}\nRun: systemctl --user enable --now rimuru.service\n`);
    return;
  }

  const runtimeStatus = await getGateRuntimeStatus(config, process.cwd());
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(runtimeStatus, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `${runtimeStatus.name} ${runtimeStatus.state} (${runtimeStatus.runtime})`,
      `workspace ${status.workspace}`,
      `soul      ${status.soul}`,
      `shard     ${status.shard}/${status.model}`,
      `vows      ${status.vows.join(",") || "none"}`,
      `barrier   ${status.barrier}`,
      ...(runtimeStatus.url ? [`url       ${runtimeStatus.url}`] : []),
      ...(runtimeStatus.pid ? [`pid       ${runtimeStatus.pid}`] : [])
    ].join("\n") + "\n"
  );
}

async function session(args: readonly string[]): Promise<void> {
  const [subcommand = "list", sessionId, ...rest] = args;
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const chronicle = new JsonChronicle(resolve(config.memoryDir));
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await chronicle.listSessions(), null, 2)}\n`);
    return;
  }
  if (subcommand === "history" && sessionId) {
    process.stdout.write(`${JSON.stringify(await chronicle.load(sessionId), null, 2)}\n`);
    return;
  }
  if (subcommand === "summary" && sessionId) {
    process.stdout.write(`${await chronicle.summarize(sessionId)}\n`);
    return;
  }
  if (subcommand === "send" && sessionId) {
    const prompt = rest.join(" ").trim();
    if (!prompt) {
      process.stderr.write("Usage: rimuru session send <session> <prompt>\n");
      process.exitCode = 1;
      return;
    }
    const result = await runChatTurn({ config, workspace: process.cwd(), prompt, sessionId, trace: process.env.RIMURU_TRACE === "1" });
    process.stdout.write(`${result.response.content}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru session [list|history <session>|summary <session>|send <session> <prompt>]\n");
  process.exitCode = 1;
}

async function vessel(args: readonly string[]): Promise<void> {
  const [subcommand = "list", name] = args;
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(listVessels(config), null, 2)}\n`);
    return;
  }
  if (subcommand === "current") {
    process.stdout.write(`${JSON.stringify(listVessels(config).find((item) => item.active), null, 2)}\n`);
    return;
  }
  if (subcommand === "create" && name) {
    const local = await readLocalConfig();
    const vessels = readObject(local.vessels);
    vessels[name] = {
      shard: argValue(args, "--provider") ?? argValue(args, "--shard") ?? "mock",
      model: argValue(args, "--model") ?? "mock",
      soul: argValue(args, "--soul") ?? name,
      vows: (argValue(args, "--vows") ?? "read").split(",").map((vow) => vow.trim()).filter(Boolean),
      barrier: argValue(args, "--barrier") ?? "none"
    };
    await writeLocalConfig({ ...local, vessels });
    process.stdout.write(`${JSON.stringify({ created: name, vessel: vessels[name] }, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru vessel [list|current|create <name> --provider <provider> --model <model>]\n");
  process.exitCode = 1;
}

async function rune(args: readonly string[]): Promise<void> {
  const [name, rawInput = "{}"] = args;
  if (!name) {
    process.stderr.write("Usage: rimuru rune <name> [json-input]\n");
    process.exitCode = 1;
    return;
  }

  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const flowBus = new FlowBus();
  const registry = await createCliRuneRegistry(config.allowedRisks.filter(isRisk), process.env.RIMURU_APPROVALS === "1", flowBus);

  const input = JSON.parse(rawInput) as unknown;
  const output = await registry.invoke(name, input, { workspace: process.cwd(), sessionId: config.sessionId, audit: true });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function provider(args: readonly string[]): Promise<void> {
  const [subcommand = "current"] = args;
  const providers = ["mock", "openai-compatible", "anthropic", "gemini", "ollama", "openrouter"];
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(providers, null, 2)}\n`);
    return;
  }
  if (subcommand === "current") {
    const config = await loadRuntimeConfig({ workspace: process.cwd() });
    process.stdout.write(`${JSON.stringify({ shard: config.provider, model: config.model }, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru provider [current|list]\n");
  process.exitCode = 1;
}

async function channel(args: readonly string[]): Promise<void> {
  const [subcommand = "list", name, ...rest] = args;
  if (subcommand === "list") {
    const config = await loadRuntimeConfig({ workspace: process.cwd() });
    process.stdout.write(`${JSON.stringify(listCircles(config), null, 2)}\n`);
    return;
  }
  if (subcommand === "add") {
    if (!name) {
      process.stderr.write("Usage: rimuru channel add <local|telegram|slack|discord|webhook> [name] [--token-env ENV]\n");
      process.exitCode = 1;
      return;
    }
    const kind = parseCircleKind(name);
    const circleName = rest.find((item) => !item.startsWith("--")) ?? name;
    const local = await readLocalConfig();
    const circles = Array.isArray(local.circles) ? [...local.circles] : [];
    circles.push({ name: circleName, kind, enabled: true, ...(argValue(args, "--token-env") ? { tokenEnv: argValue(args, "--token-env") } : {}), allowFrom: (argValue(args, "--allow") ?? (kind === "local" ? "*" : "")).split(",").map((item) => item.trim()).filter(Boolean) });
    await writeLocalConfig({ ...local, circles });
    process.stdout.write(`${JSON.stringify({ added: circleName, kind }, null, 2)}\n`);
    return;
  }
  if (subcommand === "remove" && name) {
    const local = await readLocalConfig();
    const circles = Array.isArray(local.circles) ? local.circles.filter((circle) => !isRecord(circle) || circle.name !== name) : [];
    await writeLocalConfig({ ...local, circles });
    
    // Deep Clean: Remove auth/data directory if requested
    if (args.includes("--clean")) {
      const { rm } = await import("node:fs/promises");
      const circleDir = resolve(process.cwd(), ".rimuru", "circles", name);
      try {
        await rm(circleDir, { recursive: true, force: true });
        process.stdout.write(paint(`✔ Deep cleaned data for ${name}\n`, ansi.gray));
      } catch (e) {
        /* ignore if dir doesn't exist */
      }
    }

    process.stdout.write(`${JSON.stringify({ removed: name }, null, 2)}\n`);
    return;
  }

  if (subcommand === "send") {
    const target = name ?? "local";
    if (target === "local") {
      const message = rest.join(" ").trim();
      if (!message) {
        process.stderr.write("Usage: rimuru channel send local <message>\n");
        process.exitCode = 1;
        return;
      }
      const config = await loadRuntimeConfig({ workspace: process.cwd() });
      const result = await runChatTurn({ config, workspace: process.cwd(), prompt: `Circle local message from cli: ${message}`, trace: process.env.RIMURU_TRACE === "1" });
      process.stdout.write(`${result.response.content}\n`);
      return;
    }
    process.stderr.write("Direct sends are only implemented for local Circle; external Circles receive webhooks through Gate.\n");
    process.exitCode = 1;
    return;
  }
  process.stderr.write("Usage: rimuru channel [list|add <kind> [name]|remove <name>|send local <message>]\n");
  process.exitCode = 1;
}

async function rollback(args: readonly string[]): Promise<void> {
  const [subcommand = "list", id] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await listRollbacks(process.cwd()), null, 2)}\n`);
    return;
  }
  if (subcommand === "inspect" && id) {
    process.stdout.write(`${JSON.stringify(await inspectRollback(process.cwd(), id), null, 2)}\n`);
    return;
  }
  if ((subcommand === "apply" || subcommand === "restore") && id) {
    process.stdout.write(`${JSON.stringify(await applyRollback(process.cwd(), id), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru rollback [list|inspect <id>|apply <id>]\n");
  process.exitCode = 1;
}

async function pairing(args: readonly string[]): Promise<void> {
  const [subcommand = "list", code] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await listPairings(process.cwd()), null, 2)}\n`);
    return;
  }
  if (subcommand === "approve" && code) {
    process.stdout.write(`${JSON.stringify(await approvePairing(process.cwd(), code), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru pairing [list|approve <code>]\n");
  process.exitCode = 1;
}

async function vault(args: readonly string[]): Promise<void> {
  const [subcommand = "list", name, ...rest] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await listVaultSecrets(process.cwd()), null, 2)}\n`);
    return;
  }
  if (subcommand === "set" && name) {
    const value = rest.join(" ");
    if (!value) {
      process.stderr.write("Usage: rimuru vault set <name> <value>\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(await setVaultSecret(process.cwd(), name, value), null, 2)}\n`);
    return;
  }
  if (subcommand === "get" && name) {
    process.stdout.write(`${await getVaultSecret(process.cwd(), name)}\n`);
    return;
  }
  if ((subcommand === "delete" || subcommand === "remove") && name) {
    process.stdout.write(`${JSON.stringify(await deleteVaultSecret(process.cwd(), name), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru vault [list|set <name> <value>|get <name>|delete <name>]\n");
  process.exitCode = 1;
}

async function ritual(args: readonly string[]): Promise<void> {
  const [subcommand = "list", id, ...rest] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await listRituals(process.cwd()), null, 2)}\n`);
    return;
  }
  if (subcommand === "create" && id) {
    const prompt = rest.join(" ").trim();
    if (!prompt) {
      process.stderr.write("Usage: rimuru ritual create <id> <prompt> --every <minutes> [--session <session>]\n");
      process.exitCode = 1;
      return;
    }
    const config = await loadRuntimeConfig({ workspace: process.cwd() });
    process.stdout.write(`${JSON.stringify(await createRitual(process.cwd(), { id, prompt, sessionId: argValue(args, "--session") ?? config.sessionId, everyMinutes: Number(argValue(args, "--every") ?? 60) }), null, 2)}\n`);
    return;
  }
  if (subcommand === "enable" && id) {
    process.stdout.write(`${JSON.stringify(await setRitualEnabled(process.cwd(), id, true), null, 2)}\n`);
    return;
  }
  if (subcommand === "disable" && id) {
    process.stdout.write(`${JSON.stringify(await setRitualEnabled(process.cwd(), id, false), null, 2)}\n`);
    return;
  }
  if ((subcommand === "delete" || subcommand === "remove") && id) {
    process.stdout.write(`${JSON.stringify(await deleteRitual(process.cwd(), id), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru ritual [list|create <id> <prompt> --every <minutes>|enable <id>|disable <id>|delete <id>]\n");
  process.exitCode = 1;
}

async function canvas(args: readonly string[]): Promise<void> {
  const [subcommand = "list", id, ...rest] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await listCanvasArtifacts(process.cwd()), null, 2)}\n`);
    return;
  }
  if (subcommand === "show" && id) {
    process.stdout.write(`${JSON.stringify(await readCanvasArtifact(process.cwd(), id), null, 2)}\n`);
    return;
  }
  if (subcommand === "create" && id) {
    const content = rest.join(" ");
    if (!content) {
      process.stderr.write("Usage: rimuru canvas create <title> <content> [--kind markdown|html|text|json]\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(await createCanvasArtifact(process.cwd(), { title: id, kind: parseArtifactKind(argValue(args, "--kind") ?? "markdown"), content }), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru canvas [list|show <id>|create <title> <content>]\n");
  process.exitCode = 1;
}

async function release(args: readonly string[]): Promise<void> {
  const [subcommand = "check"] = args;
  const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as { readonly name?: string; readonly version?: string };
  if (subcommand === "check") {
    process.stdout.write(`${JSON.stringify({ package: pkg.name ?? "rimuru", localVersion: pkg.version ?? "0.0.0", npm: `npm view ${pkg.name ?? "rimuru"} version`, publish: "npm publish --access public", checks: ["npm run check", "npm pack --dry-run"] }, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru update [check]\n");
  process.exitCode = 1;
}

async function registry(args: readonly string[]): Promise<void> {
  const [subcommand = "list"] = args;
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify({ registry: "local", pluginDir: resolve(process.cwd(), ".rimuru", "plugins"), install: "Place a skill folder containing rimuru.plugin.json in .rimuru/plugins/<name>." }, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru registry [list]\n");
  process.exitCode = 1;
}

async function approval(args: readonly string[]): Promise<void> {
  const [subcommand = "list", id] = args;
  const gate = await readGateState(process.cwd());
  if (!gate) {
    process.stdout.write(`${JSON.stringify({ pending: [], note: "Gate is not running. Start with: rimuru gate start --approvals" }, null, 2)}\n`);
    return;
  }
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await fetchGateJson(gate.url, "/approvals"), null, 2)}\n`);
    return;
  }
  if ((subcommand === "approve" || subcommand === "allow") && id) {
    process.stdout.write(`${JSON.stringify(await fetchGateJson(gate.url, `/approvals/${id}/approve`, { scope: args.includes("--session") ? "session" : "once" }), null, 2)}\n`);
    return;
  }
  if ((subcommand === "deny" || subcommand === "reject") && id) {
    process.stdout.write(`${JSON.stringify(await fetchGateJson(gate.url, `/approvals/${id}/deny`, { reason: "denied by CLI" }), null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru approval [list|approve <id> [--session]|deny <id>]\n");
  process.exitCode = 1;
}

async function policy(args: readonly string[]): Promise<void> {
  const [subcommand = "show"] = args;
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  if (subcommand === "show") {
    process.stdout.write(`${JSON.stringify({ vows: config.allowedRisks, barrier: config.sandboxMode }, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru policy [show]\n");
  process.exitCode = 1;
}

async function configCmd(args: readonly string[]): Promise<void> {
  const [subcommand = "list", key, ...rest] = args;
  const local = await readLocalConfig();

  if (subcommand === "list") {
    process.stdout.write(paint("\n CURRENT CONFIGURATION\n", ansi.cyan, ansi.bold));
    process.stdout.write(JSON.stringify(local, null, 2) + "\n");
    return;
  }

  if (subcommand === "get" && key) {
    const value = local[key];
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  if (subcommand === "set" && key) {
    const value = rest.join(" ");
    let parsed: any = value;
    try { parsed = JSON.parse(value); } catch { /* use as string */ }
    
    local[key] = parsed;
    await writeLocalConfig(local);
    process.stdout.write(paint(`✔ Set ${key} to ${value}\n`, ansi.green));
    return;
  }

  process.stderr.write("Usage: rimuru config [list|get <key>|set <key> <value>]\n");
  process.exitCode = 1;
}

function plan(args: readonly string[]): void {

  const objective = args.join(" ").trim();
  if (!objective) {
    process.stderr.write("Usage: rimuru plan <objective>\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(planObjective(objective), null, 2)}\n`);
}

async function webDash(): Promise<void> {
  const workspace = process.cwd();
  const config = await loadRuntimeConfig({ workspace });
  
  // 1. Ensure Gate is running
  const runtimeStatus = await getGateRuntimeStatus(config, workspace);
  if (runtimeStatus.runtime !== "running") {
    console.log(paint("Launching Sovereign Gate...", ansi.cyan));
    listenGateServer({ 
      workspace, 
      config,
      port: config.gatewayPort
    }).then(handle => {
      console.log(paint(`Gate online at ${handle.url}`, ansi.gray));
    }).catch(err => console.error("Failed to start Gate:", err));
  }

  // 2. Serve Static Web UI
  const distPath = h();
  const publicPath = existsSync(join(distPath, "index.html")) 
    ? distPath 
    : resolve(distPath, "..", "public");

  const serve = sirv(publicPath, { dev: false, single: true });
  const port = 19711;

  const server = createServer((req, res) => {
    serve(req, res);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(paint(`\nSovereign Dashboard live at ${url}`, ansi.green, ansi.bold));
    console.log(paint("Press Ctrl+C to close the dashboard server.\n", ansi.gray));
    open(url).catch(() => {});
  });
}


async function tui(): Promise<void> {
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const flowBus = new FlowBus();
  
  const runtime = await createRuntime({
    config,
    workspace: process.cwd(),
    flowBus,
    approvals: process.env.RIMURU_APPROVALS === "1",
    approvalPrompt: async (request) => {
      return { allowed: true, reason: "auto-approved in TUI" };
    }
  });

  await runInteractiveTui({
    sovereign: runtime.sovereign,
    runes: runtime.runes,
    flowBus,
    chronicle: runtime.chronicle,
    traceStore: runtime.traceStore,
    workspace: process.cwd(),
    sessionId: config.sessionId,
    provider: config.provider,
    model: config.model
  });
}

async function agent(args: readonly string[]): Promise<void> {
  const objective = args.join(" ").trim();
  if (!objective) {
    process.stderr.write("Usage: rimuru agent <objective>\n");
    process.exitCode = 1;
    return;
  }
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const result = await runAgentTurn({
    config,
    workspace: process.cwd(),
    objective,
    approvals: process.env.RIMURU_APPROVALS === "1",
    approvalPrompt: async (request) => {
      const allowed = await promptApproval(`Allow ${request.rune} (${request.risk})?`);
      return { allowed, reason: allowed ? "approved once" : "denied by user" };
    },
    trace: process.env.RIMURU_TRACE === "1"
  });
  process.stdout.write(`${JSON.stringify({ observations: result.observations, answer: result.final.response.content }, null, 2)}\n`);
}


async function flow(): Promise<void> {
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const flowBus = new FlowBus();
  
  process.stdout.write(`Rimuru Flow (Session: \x1b[36m${config.sessionId}\x1b[0m)\nType /exit to quit.\n\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[35mrimuru>\x1b[0m "
  });
  
  flowBus.listen((event) => {
    switch (event.type) {
      case "rune.requested":
        process.stdout.write(`\n\x1b[90m[tool] running ${event.rune}...\x1b[0m\n`);
        break;
      case "rune.completed":
        process.stdout.write(`\x1b[90m[tool] completed ${event.rune}\x1b[0m\n`);
        break;
      case "rune.denied":
        process.stdout.write(`\x1b[31m[tool] denied ${event.rune}: ${event.reason}\x1b[0m\n`);
        break;
    }
  });

  rl.prompt();
  for await (const line of rl) {
    const prompt = line.trim();
    if (!prompt) {
      rl.prompt();
      continue;
    }
    if (prompt === "/exit" || prompt === "/quit") break;
    
    try {
      process.stdout.write("\x1b[32m"); // start streaming color
      await runAgentTurn({
        config,
        workspace: process.cwd(),
        objective: prompt,
        flowBus,
        approvals: process.env.RIMURU_APPROVALS === "1",
        approvalPrompt: async (request) => {
          const answer = await rl.question(`\n\x1b[33mAllow ${request.rune} (${request.risk})? (y/N)\x1b[0m `);
          const allowed = answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
          return { allowed, reason: allowed ? "approved by user" : "denied by user" };
        },
        trace: process.env.RIMURU_TRACE === "1",
        onText: (text) => process.stdout.write(text)
      });
      process.stdout.write("\x1b[0m\n\n"); // end streaming color
    } catch (error) {
       process.stderr.write(`\n\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m\n\n`);
    }
    rl.prompt();
  }
  rl.close();
}

async function indexWorkspace(args: readonly string[]): Promise<void> {
  const query = args.join(" ").trim();
  const index = await buildLexicalIndex(process.cwd());
  process.stdout.write(`${JSON.stringify(query ? index.search(query) : index.files.slice(0, 25), null, 2)}\n`);
}

async function memory(args: readonly string[]): Promise<void> {
  const [subcommand = "list", sessionArg, ...rest] = args;
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  const chronicle = new JsonChronicle(resolve(config.memoryDir));
  const sessionId = sessionArg ?? config.sessionId;
  const semantic = createSemanticMemory(resolve(process.cwd(), ".rimuru"));
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await chronicle.listSessions(), null, 2)}\n`);
    return;
  }
  if (subcommand === "summary") {
    process.stdout.write(`${await chronicle.summarize(sessionId)}\n`);
    return;
  }
  if (subcommand === "compact") {
    await chronicle.compact(sessionId);
    process.stdout.write(`Compacted chronicle session ${sessionId}\n`);
    return;
  }
  if (subcommand === "semantic") {
    const records = await semantic.indexChronicle(sessionId, chronicle);
    process.stdout.write(`${JSON.stringify({ indexed: records.length, sessionId }, null, 2)}\n`);
    return;
  }
  if (subcommand === "search") {
    const query = [sessionArg, ...rest].filter(Boolean).join(" ").trim();
    if (!query) {
      process.stderr.write("Usage: rimuru memory search <query>\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(await semantic.search(query, { limit: 8 }), null, 2)}\n`);
    return;
  }
  if (subcommand === "remember") {
    const text = [sessionArg, ...rest].filter(Boolean).join(" ").trim();
    if (!text) {
      process.stderr.write("Usage: rimuru memory remember <text>\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(await semantic.remember({ sessionId: config.sessionId, scope: "note", text }), null, 2)}\n`);
    return;
  }
  if (subcommand === "semantic-compact") {
    await semantic.compact();
    process.stdout.write("Compacted semantic memory\n");
    return;
  }
  process.stderr.write("Usage: rimuru memory [list|summary|compact|semantic|search|remember|semantic-compact] [args]\n");
  process.exitCode = 1;
}

async function trace(args: readonly string[]): Promise<void> {
  const [subcommand = "list", name] = args;
  const store = new JsonTraceStore(resolve(process.cwd(), ".rimuru", "traces"));
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(await store.list(), null, 2)}\n`);
    return;
  }
  if ((subcommand === "inspect" || subcommand === "replay") && name) {
    const record = await store.inspect(name);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  process.stderr.write("Usage: rimuru trace [list|inspect|replay] [trace-file]\n");
  process.exitCode = 1;
}

async function plugin(args: readonly string[]): Promise<void> {
  const [subcommand = "list", name] = args;
  const plugins = await loadPlugins(resolve(process.cwd(), ".rimuru", "plugins"));
  if (subcommand === "list") {
    process.stdout.write(`${JSON.stringify(plugins.map(pluginSummary), null, 2)}\n`);
    return;
  }
  if (subcommand === "inspect" && name) {
    const plugin = plugins.find((candidate) => candidate.manifest.name === name);
    if (!plugin) throw new Error(`Unknown plugin: ${name}`);
    process.stdout.write(`${JSON.stringify(pluginSummary(plugin), null, 2)}\n`);
    return;
  }
  if (subcommand === "install") {
    process.stderr.write("Usage: create .rimuru/plugins/<name>/rimuru.plugin.json with an entry file; package install is not implemented yet.\n");
    process.exitCode = 1;
    return;
  }
  process.stderr.write("Usage: rimuru plugin [list|inspect <name>|install]\n");
  process.exitCode = 1;
}

async function mcp(args: readonly string[]): Promise<void> {
  const [subcommand] = args;
  if (subcommand !== "serve") {
    process.stderr.write("Usage: rimuru mcp serve\n");
    process.exitCode = 1;
    return;
  }
  const config = await loadRuntimeConfig({ workspace: process.cwd() });
  await serveMcpStdio({
    registry: await createCliRuneRegistry(config.allowedRisks.filter(isRisk), process.env.RIMURU_APPROVALS === "1"),
    workspace: process.cwd(),
    sessionId: config.sessionId,
    traceStore: new JsonTraceStore(resolve(process.cwd(), ".rimuru", "traces"))
  });
}

async function version(args: readonly string[]): Promise<void> {
  const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as { readonly name?: string; readonly version?: string };
  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(pkg, null, 2)}\n`);
  else process.stdout.write(`${pkg.name ?? "rimuru"} ${pkg.version ?? "0.0.0"}\n`);
}

function pluginSummary(plugin: Awaited<ReturnType<typeof loadPlugins>>[number]): unknown {
  return {
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    root: plugin.root,
    entry: plugin.entry ?? null,
    runes: plugin.runes.map((rune) => ({ name: rune.name, description: rune.description, risk: rune.risk, executable: !rune.description.includes("declared by plugin") }))
  };
}

async function createCliRuneRegistry(allowedRisks: readonly ("read" | "write" | "execute" | "network")[], approvals: boolean, flowBus = new FlowBus()) {
  return createRuntimeRuneRegistry({
    workspace: process.cwd(),
    allowedRisks,
    flowBus,
    approvals,
    approvalPrompt: async (request) => {
      const allowed = await promptApproval(`Allow ${request.rune} (${request.risk})?`);
      return { allowed, reason: allowed ? "approved once" : "denied by user" };
    }
  });
}

async function fetchGateJson(baseUrl: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" }
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : response.statusText);
  return data;
}

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

async function readLocalConfig(): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(resolve(process.cwd(), "rimuru.config.json"), "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeLocalConfig(config: Record<string, unknown>): Promise<void> {
  await writeFile(resolve(process.cwd(), "rimuru.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProviderArg(value: string): ProviderKind {
  if (value === "mock" || value === "openai-compatible" || value === "anthropic" || value === "gemini" || value === "ollama" || value === "openrouter") return value;
  throw new Error(`Unsupported provider: ${value}`);
}

function parseBarrierArg(value: string): "none" | "readonly" | "docker" {
  if (value === "none" || value === "readonly" || value === "docker") return value;
  throw new Error(`Unsupported barrier: ${value}`);
}

function parseCircleKind(value: string): "local" | "webhook" | "telegram" | "slack" | "discord" | "whatsapp" {
  if (value === "local" || value === "webhook" || value === "telegram" || value === "slack" || value === "discord" || value === "whatsapp") return value;
  throw new Error(`Unsupported Circle kind: ${value}`);
}


function parseArtifactKind(value: string): "markdown" | "html" | "text" | "json" {
  if (value === "markdown" || value === "html" || value === "text" || value === "json") return value;
  throw new Error(`Unsupported Canvas kind: ${value}`);
}

function help(): void {
  const c = (s: string) => paint(s, ansi.cyan);
  const g = (s: string) => paint(s, ansi.gray);
  const b = (s: string) => paint(s, ansi.bold);

  process.stdout.write([
    b(" CORE COMMANDS"),
    `  ${c("init")}         ${g("Initialize a Rimuru workspace (alias: setup, awaken)")}`,
    `  ${c("dash")}         ${g("View the Sovereign Dashboard (default)")}`,
    `  ${c("chat")}         ${g("Run a one-off chat turn or start TUI")}`,
    `  ${c("agent")}        ${g("Run a goal-oriented autonomous agent loop")}`,
    `  ${c("gate")}         ${g("Manage the Gate API server (start/stop/status)")}`,
    "",
    b(" CAPABILITIES"),
    `  ${c("rune")}         ${g("Invoke a policy-guarded tool (alias: tool)")}`,
    `  ${c("vault")}        ${g("Manage secrets in the encrypted store")}`,
    `  ${c("ritual")}       ${g("Schedule automated prompts/tasks")}`,
    `  ${c("canvas")}       ${g("Manage workspace artifacts (markdown, html)")}`,
    "",
    b(" CONCEPTS"),
    `  ${b("Workspace")}    ${g("The current directory. Everything is scoped here.")}`,
    `  ${b("Soul")}         ${g("Identity defined in SOUL.md (personality & goal).")}`,
    `  ${b("Vows")}         ${g("Permissions (read/write/etc) you grant the agent.")}`,
    `  ${b("Vault")}        ${g("Secure local storage for your API keys.")}`,
    "",
    b(" SYSTEM & RECOVERY"),
    `  ${c("memory")}       ${g("Chronicle and semantic memory management")}`,
    `  ${c("trace")}        ${g("Inspect or replay redacted execution traces")}`,
    `  ${c("rollback")}     ${g("Rewind file edits to previous states")}`,
    `  ${c("doctor")}       ${g("Verify environment and configuration")}`,
    "",
    b(" EXTRAS"),
    `  ${c("mcp")}          ${g("Serve tools over Model Context Protocol")}`,
    `  ${c("version")}      ${g("Show current version info")}`,
    "",
    g(" Run 'rimuru <command> --help' for specific subcommand details."),
    ""
  ].join("\n"));
}


