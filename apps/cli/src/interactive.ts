import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { ReadStream, WriteStream } from "node:tty";
import type { Flow, FlowBus, Sovereign, JsonChronicle, JsonTraceStore } from "@rimuru/core";
import { ansi, paint, stripAnsi, fileLink, getTermWidth, paintMarkdown } from "./ansi.js";

export interface TuiState {
  readonly sessionId: string;
  readonly workspace: string;
  readonly provider: string;
  readonly model: string;
  readonly input: string;
  readonly transcript: readonly { readonly role: "user" | "assistant" | "system"; readonly content: string }[];
  readonly events: readonly Flow[];
  readonly mode: "idle" | "thinking" | "approving";
  readonly status: string;
  readonly currentThought: string;
  readonly activeRune?: string;
}

export interface InteractiveTuiOptions {
  readonly sovereign: Sovereign;
  readonly flowBus: FlowBus;
  readonly chronicle: JsonChronicle;
  readonly traceStore: JsonTraceStore;
  readonly workspace: string;
  readonly sessionId: string;
  readonly provider: string;
  readonly model: string;
  readonly input?: ReadStream;
  readonly output?: WriteStream;
}

export async function runInteractiveTui(options: InteractiveTuiOptions): Promise<void> {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;

  let state: TuiState = {
    sessionId: options.sessionId,
    workspace: options.workspace,
    provider: options.provider,
    model: options.model,
    input: "",
    transcript: [],
    events: [],
    mode: "idle",
    status: "Type a message and press Enter. Ctrl+C to exit.",
    currentThought: ""
  };

  const render = () => {
    output.write(ansi.clear + renderTui(state, getTermWidth(), output.rows || 24));
  };

  const unlisten = options.flowBus.listen((event) => {
    state = { ...state, events: [...state.events, event].slice(-20) };
    if (event.type === "rune.requested") state = { ...state, activeRune: event.rune };
    if (event.type === "rune.completed" || event.type === "rune.denied") state = { ...state, activeRune: undefined };
    render();
  });

  if (input.isTTY) input.setRawMode(true);
  input.resume();
  output.write(ansi.altBuffer + ansi.hideCursor);
  render();

  try {
    await new Promise<void>((resolve) => {
      input.on("data", async (chunk) => {
        const key = chunk.toString();
        if (key === "\u0003") resolve();
        if (state.mode === "thinking") return;

        if (key === "\r" || key === "\n") {
          const prompt = state.input.trim();
          if (prompt) {
            state = { ...state, input: "", mode: "thinking", currentThought: "" };
            await handlePrompt(prompt);
          }
        } else if (key === "\u007F") {
          state = { ...state, input: state.input.slice(0, -1) };
        } else if (key.length === 1 && key >= " ") {
          state = { ...state, input: state.input + key };
        }
        render();
      });
    });
  } finally {
    unlisten();
    if (input.isTTY) input.setRawMode(false);
    output.write(ansi.mainBuffer + ansi.showCursor);
  }

  async function handlePrompt(prompt: string) {
    const assistantIdx = state.transcript.length + 1;
    state = {
      ...state,
      transcript: [...state.transcript, { role: "user", content: prompt }, { role: "assistant", content: "" }]
    };
    render();

    try {
      await options.sovereign.run({
        prompt,
        workspace: state.workspace,
        sessionId: state.sessionId,
        onText: (text) => {
          const transcript = [...state.transcript];
          const current = transcript[assistantIdx];
          transcript[assistantIdx] = { role: "assistant", content: (current?.content ?? "") + text };
          state = { ...state, transcript };
          render();
        }
      });
      state = { ...state, mode: "idle", status: "Rimuru is ready." };
    } catch (e) {
      state = { ...state, mode: "idle", status: `Error: ${e instanceof Error ? e.message : String(e)}` };
    }
    render();
  }
}

function renderTui(state: TuiState, width: number, height: number): string {
  const bodyHeight = height - 5;
  const header = paint(` RIMURU SESSIONS ❯ ${state.sessionId} (${state.model})`, ansi.bgCyan, ansi.black, ansi.bold);
  const info = paint(` Workspace: ${fileLink(state.workspace)}`, ansi.gray, ansi.dim);
  const divider = paint("─".repeat(width), ansi.gray);

  // Render Chat at full width
  const chatLines = renderChat(state.transcript, width - 4, bodyHeight);
  
  // Render Logs as a small floating box in top right
  const logLines = renderLogs(state.events, 40, 5);
  
  const lines: string[] = [];
  for (let i = 0; i < bodyHeight; i++) {
    let chat = chatLines[i] ?? "";
    
    // Overlay logs in the top right if within the first 5 lines
    if (i >= 0 && i < logLines.length) {
      const log = logLines[i];
      const visibleChat = stripAnsi(chat);
      const padding = Math.max(0, width - stripAnsi(chat).length - stripAnsi(log).length - 4);
      chat = chat + " ".repeat(padding) + log;
    }
    
    lines.push(` ${chat}`);
  }

  const footer = renderFooter(state, width);
  return [header, info, divider, ...lines, divider, footer].join("\n");
}


function renderChat(items: TuiState["transcript"], width: number, height: number): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const isUser = item.role === "user";
    const prefix = isUser ? paint(" YOU ", ansi.bgWhite, ansi.black) : paint(" RIMURU ", ansi.bgGreen, ansi.black);
    const content = item.content || "...";
    
    lines.push(prefix);
    
    // Apply markdown BEFORE wrapping so styles don't break across lines
    const styledContent = paintMarkdown(content);
    const contentLines = wrap(styledContent, width - 4);
    
    for (const line of contentLines) {
      lines.push("  " + line);
    }
    lines.push("");
  }
  return lines.slice(-height);
}


function renderLogs(events: readonly Flow[], width: number, height: number): string[] {
  if (events.length === 0) return [];
  const lines: string[] = [paint(" EVENTS HUD ", ansi.bgYellow, ansi.black, ansi.bold)];
  
  for (const e of events.slice(-height + 1)) {
    const type = e.type.split(".")[1] || e.type;
    let icon = "•";
    let color: string = ansi.gray;

    if (e.type.startsWith("rune.")) {
        icon = "⚡";
        color = ansi.yellow;
    } else if (e.type.startsWith("run.")) {
        icon = "🌀";
        color = ansi.cyan;
    } else if (e.type === "thought.emitted") {
        icon = "🧠";
        color = ansi.magenta;
        lines.push(paint(`${icon} ${type.toUpperCase()}`, color));
        continue;
    }

    lines.push(paint(`${icon} ${type.toUpperCase()}`, color));
  }
  return lines;
}


function renderFooter(state: TuiState, width: number): string {
  const isThinking = state.mode === "thinking";
  const prefix = isThinking ? paint(" ◔ THINKING ", ansi.yellow, ansi.bold) : paint(" ❯ INPUT    ", ansi.cyan, ansi.bold);

  let content = "";
  if (isThinking) {
    const rune = state.activeRune ? ` [Running ${paint(state.activeRune, ansi.magenta)}]` : "";
    content = paint("Reasoning and acting..." + rune, ansi.dim);
  } else {
    content = state.input + paint("█", ansi.cyan);
  }

  return ` ${prefix} ${content}`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let current = "";

    for (const word of words) {
      const lineWithWord = current ? current + " " + word : word;
      if (stripAnsi(lineWithWord).length > width) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = lineWithWord;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  return text + " ".repeat(Math.max(0, width - visible.length));
}

export async function promptApproval(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: defaultInput, output: defaultOutput });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
