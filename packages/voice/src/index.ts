import { execFile } from "node:child_process";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RuntimeConfig, AgentLoop, RuneRegistry, Sovereign, Chronicle } from "@rimuru/core";
import { createRuntime, runAgentTurn } from "@rimuru/core";

const execFileAsync = promisify(execFile);

export interface VoiceLoopOptions {
  readonly config: RuntimeConfig;
  readonly workspace: string;
  readonly sessionId?: string;
}

let listening = false;

export async function startVoiceLoop(options: VoiceLoopOptions): Promise<void> {
  const runtime = await createRuntime({ config: options.config, workspace: options.workspace });
  const sessionId = options.sessionId ?? `voice-${Date.now()}`;
  listening = true;

  process.stdout.write("🎤 Voice loop started. Speak after the prompt. Press Ctrl+C to stop.\n");

  while (listening) {
    const tmpDir = join(options.workspace, ".rimuru", "voice");
    await mkdir(tmpDir, { recursive: true });
    const wavPath = join(tmpDir, `listen-${Date.now()}.wav`);

    // Capture audio
    let transcript = "";
    try {
      process.stdout.write("🎤 Listening (5s)... ");
      await execFileAsync("arecord", [
        "-d", "5",
        "-f", "cd",
        "-t", "wav",
        wavPath,
      ], { timeout: 10_000 });
      process.stdout.write("Got audio. ");

      // Transcribe — try whisper CLI if installed
      transcript = await transcribe(wavPath);
      if (!transcript) transcript = "[audio captured — no speech detected]";
    } catch {
      process.stdout.write("No mic detected. ");
      transcript = "[no microphone available]";
    }

    try { await unlink(wavPath); } catch {}

    if (!transcript || transcript.trim().length === 0) {
      process.stdout.write("Skipping empty input.\n");
      continue;
    }

    process.stdout.write(`"${transcript.slice(0, 60)}${transcript.length > 60 ? '...' : ''}"\n`);

    // Run agent turn
    process.stdout.write("🤔 Thinking... ");
    try {
      const result = await runAgentTurn({
        config: options.config,
        workspace: options.workspace,
        objective: transcript,
        sessionId,
        onText: (text) => process.stdout.write(text),
      });

      const response = result.final.response.content;
      process.stdout.write("\n");
      process.stdout.write(`🗣 ${response.slice(0, 200)}${response.length > 200 ? '...' : ''}\n`);

      // Speak response
      await speak(response, options.workspace);
    } catch (e) {
      process.stdout.write(`\nError: ${e instanceof Error ? e.message : String(e)}\n`);
    }

    process.stdout.write("\n");
  }
}

export function stopVoiceLoop(): void {
  listening = false;
}

async function transcribe(wavPath: string): Promise<string> {
  // Try whisper CLI
  try {
    const { stdout } = await execFileAsync("whisper", [
      wavPath,
      "--model", "tiny",
      "--language", "en",
      "--output_format", "txt",
      "--output_dir", "/tmp",
      "--fp16", "False",
    ], { timeout: 30_000 });
    const lines = stdout.split("\n").filter(Boolean);
    const lastLine = lines[lines.length - 1] ?? "";
    return lastLine.replace(/^\[\d+:\d+\.\d+ --> \d+:\d+\.\d+\]\s*/, "").trim();
  } catch {
    // whisper not available
  }

  // Fallback: just note the file exists
  return "";
}

async function speak(text: string, workspace: string): Promise<void> {
  const tmpDir = join(workspace, ".rimuru", "voice");
  await mkdir(tmpDir, { recursive: true });
  const wavPath = join(tmpDir, `speak-${Date.now()}.wav`);

  try {
    await execFileAsync("espeak-ng", [
      text,
      "-w", wavPath,
      "-s", "150",
    ], { timeout: 15_000 });

    try {
      await execFileAsync("ffplay", [
        "-nodisp",
        "-autoexit",
        "-loglevel", "quiet",
        wavPath,
      ], { timeout: 60_000 });
    } catch {
      try {
        await execFileAsync("aplay", [wavPath], { timeout: 60_000 });
      } catch {
        // no audio output available
      }
    }
  } catch {
    // espeak-ng not available — skip audio output
  }

  try { await unlink(wavPath); } catch {}
}

export function renderVoiceSystemdService(workspace: string, nodePath?: string): string {
  const home = process.env.HOME ?? "/root";
  const node = nodePath ?? process.execPath;

  return [
    "[Unit]",
    "Description=Rimuru Voice Agent",
    "After=network-online.target sound.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${process.env.USER ?? "root"}`,
    `WorkingDirectory=${workspace}`,
    `ExecStart=${node} -e "import('@rimuru/voice').then(v => v.startVoiceLoop({config: require('${join(home, '.rimuru', 'voice-config.json')}'), workspace: '${workspace}'}))"`,
    "Restart=on-failure",
    "RestartSec=5",
    "StandardOutput=journal",
    "StandardError=journal",
    "SyslogIdentifier=rimuru-voice",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ].join("\n");
}
