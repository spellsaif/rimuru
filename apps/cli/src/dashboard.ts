import type { Flow } from "@rimuru/core";
import { ansi, paint, stripAnsi } from "./ansi.js";

export interface DashboardModel {
  readonly title: string;
  readonly status: string;
  readonly provider: string;
  readonly model: string;
  readonly workspace: string;
  readonly events: readonly Flow[];
  readonly runes?: readonly string[];
  readonly sessions?: readonly string[];
}

/**
 * Premium Dashboard renderer for Rimuru.
 * Uses a double-box layout with vibrant colors.
 */
export function renderDashboard(model: DashboardModel): string {
  const width = Math.max(84, process.stdout.columns || 84);
  const leftWidth = Math.floor(width * 0.45);
  const rightWidth = width - leftWidth - 1;

  const header = renderHeader(model, width);
  const body = renderBody(model, leftWidth, rightWidth);
  const footer = renderFooter(model, width);

  return [header, ...body, footer].join("\n");
}

function renderHeader(model: DashboardModel, width: number): string {
  const top = paint(`╔${"═".repeat(width - 2)}╗`, ansi.cyan);
  const title = paint(`║ ${pad(model.title.toUpperCase(), width - 4)} ║`, ansi.cyan, ansi.bold);
  const sub = paint(`║ ${pad(model.status, width - 4)} ║`, ansi.cyan, ansi.dim);
  const mid = paint(`╠${"═".repeat(width - 2)}╣`, ansi.cyan);
  return [top, title, sub, mid].join("\n");
}

function renderBody(model: DashboardModel, leftWidth: number, rightWidth: number): string[] {
  const leftLines = [
    paint(" SYSTEM STATUS", ansi.bold, ansi.white),
    "",
    `${paint(" Workspace: ", ansi.gray)}${model.workspace}`,
    `${paint(" Provider:  ", ansi.gray)}${paint(model.provider, ansi.green)}`,
    `${paint(" Model:     ", ansi.gray)}${paint(model.model, ansi.yellow)}`,
    "",
    paint(" ACTIVE CAPABILITIES (RUNES)", ansi.bold, ansi.white),
    ...(model.runes?.slice(0, 10).map(r => `${paint(" ❯ ", ansi.cyan)}${r}`) ?? [paint(" No runes loaded", ansi.dim)]),
    "",
    paint(" RECENT SESSIONS", ansi.bold, ansi.white),
    ...(model.sessions?.slice(-5).map(s => `${paint(" ◔ ", ansi.magenta)}${s}`) ?? [paint(" No history", ansi.dim)])
  ];

  const rightLines = [
    paint(" LIVE FLOW LOG", ansi.bold, ansi.white),
    "",
    ...(model.events.length > 0 
      ? model.events.slice(-15).map(renderEvent)
      : [paint(" No flow events yet", ansi.dim)])
  ];

  const maxLines = Math.max(leftLines.length, rightLines.length, 18);
  const lines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const left = pad(leftLines[i] ?? "", leftWidth - 2);
    const right = pad(rightLines[i] ?? "", rightWidth - 2);
    lines.push(paint("║", ansi.cyan) + " " + left + paint("│", ansi.cyan) + " " + right + paint("║", ansi.cyan));
  }

  return lines;
}

function renderFooter(model: DashboardModel, width: number): string {
  const mid = paint(`╠${"═".repeat(width - 2)}╣`, ansi.cyan);
  const help = paint(`║ ${pad("Press [C] for Chat | [R] to Refresh | [V] for Vault | [Q] to Quit", width - 4)} ║`, ansi.cyan, ansi.dim);
  const bot = paint(`╚${"═".repeat(width - 2)}╝`, ansi.cyan);
  return [mid, help, bot].join("\n");
}

function renderEvent(event: Flow): string {
  const time = paint(event.at.toISOString().slice(11, 19), ansi.gray);
  switch (event.type) {
    case "run.started": return `${time} ${paint("STARTED ", ansi.bgGreen, ansi.black)} ${event.sessionId}`;
    case "rune.requested": return `${time} ${paint("INVOKE  ", ansi.bgMagenta, ansi.black)} ${event.rune}`;
    case "rune.completed": return `${time} ${paint("SUCCESS ", ansi.green)} ${event.rune}`;
    case "provider.requested": return `${time} ${paint("QUERY   ", ansi.yellow)} ${event.provider}`;
    case "run.completed": return `${time} ${paint("FINISHED", ansi.bgGreen, ansi.black)} ${event.sessionId}`;
    case "rune.denied": return `${time} ${paint("DENIED  ", ansi.bgRed, ansi.white)} ${event.rune}`;
    default: return `${time} ${paint("EVENT   ", ansi.dim)} ${event.type}`;
  }
}

function pad(value: string, width: number): string {
  const visible = stripAnsi(value);
  if (visible.length >= width) return value.slice(0, width - 1) + "…";
  return value + " ".repeat(width - visible.length);
}

export interface FullScreenTuiModel {
  readonly title: string;
  readonly provider: string;
  readonly model: string;
  readonly sessionId: string;
  readonly workspace: string;
  readonly input: string;
  readonly transcript: readonly { readonly role: string; readonly content: string }[];
  readonly events: readonly any[];
  readonly sessions?: readonly string[];
  readonly traces?: readonly string[];
  readonly mode: string;
  readonly status: string;
}

export function renderFullScreenTui(model: FullScreenTuiModel, width: number, height: number): string {
  const header = paint(`║ === ${model.title.toUpperCase()} ===`, ansi.cyan, ansi.bold);
  const info = paint(`║ Provider/Model: ${model.provider}/${model.model} | Session: ${model.sessionId}`, ansi.green);
  const workspace = paint(`║ Workspace: ${model.workspace}`, ansi.gray);
  
  const conversationLines = [
    paint("╟─ Conversation ────────────────────────────────────────", ansi.cyan),
    ...model.transcript.map(t => paint(`║  [${t.role.toUpperCase()}] ${t.content}`, ansi.white))
  ];

  const chronicleLines = [
    paint("╟─ Chronicle & Sessions ────────────────────────────────", ansi.cyan),
    ...(model.sessions ?? []).map(s => paint(`║  • ${s}`, ansi.magenta))
  ];

  const traceLines = [
    paint("╟─ Traces ──────────────────────────────────────────────", ansi.cyan),
    ...(model.traces ?? []).map(t => paint(`║  • ${t}`, ansi.yellow))
  ];

  const statusLine = paint(`║ Status: ${model.status} | Mode: ${model.mode} | Input: ${model.input}`, ansi.blue);

  return [
    paint(`╔${"═".repeat(Math.max(40, width - 2))}╗`, ansi.cyan),
    header,
    info,
    workspace,
    ...conversationLines,
    ...chronicleLines,
    ...traceLines,
    paint(`╟${"─".repeat(Math.max(40, width - 2))}╢`, ansi.cyan),
    statusLine,
    paint(`╚${"═".repeat(Math.max(40, width - 2))}╝`, ansi.cyan)
  ].join("\n");
}

