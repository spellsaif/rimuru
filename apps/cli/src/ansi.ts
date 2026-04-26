export const ansi = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  italic: "\u001B[3m",
  underline: "\u001B[4m",
  black: "\u001B[30m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  blue: "\u001B[34m",
  magenta: "\u001B[35m",
  cyan: "\u001B[36m",
  white: "\u001B[37m",
  gray: "\u001B[90m",
  bgBlack: "\u001B[40m",
  bgRed: "\u001B[41m",
  bgGreen: "\u001B[42m",
  bgYellow: "\u001B[43m",
  bgBlue: "\u001B[44m",
  bgMagenta: "\u001B[45m",
  bgCyan: "\u001B[46m",
  bgWhite: "\u001B[47m",
  clear: "\u001B[2J\u001B[H",
  hideCursor: "\u001B[?25l",
  showCursor: "\u001B[?25h",
  altBuffer: "\u001B[?1049h",
  mainBuffer: "\u001B[?1049l"
} as const;

export function paint(value: string, ...codes: readonly string[]): string {
  if (codes.length === 0) return value;
  return `${codes.join("")}${value}${ansi.reset}`;
}

export function link(text: string, url: string): string {
  return `\u001B]8;;${url}\u001B\\${text}\u001B]8;;\u001B\\`;
}

export function fileLink(path: string, label?: string): string {
  return link(label ?? path, `file://${path}`);
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

export function getTermWidth(): number {
  return process.stdout.columns || 80;
}
