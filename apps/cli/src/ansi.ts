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

export function paintMarkdown(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];
    const trimmed = line.trim();

    // Code Block Toggle
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(paint(line, ansi.bgCyan, ansi.black, ansi.bold));
      i++;
      continue;
    }

    if (inCodeBlock) {
      result.push(paint(line, ansi.bgBlack, ansi.white));
      i++;
      continue;
    }

    // Table Detection
    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Parse Table Data
      const tableData = tableLines
        .filter(l => !/^\|[|\-:\s]+\|$/.test(l)) // Filter out separators
        .map(l => l.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim()));

      if (tableData.length > 0) {
        // Calculate Max Widths
        const colWidths = tableData[0].map((_, colIdx) => Math.max(...tableData.map(row => stripAnsi(paintMarkdown(row[colIdx] || "")).length)));

        // Render Table
        tableData.forEach((row, rowIdx) => {
          const cells = row.map((cell, colIdx) => {
            const styled = paintMarkdown(cell);
            const padding = colWidths[colIdx] - stripAnsi(styled).length;
            return " " + styled + " ".repeat(padding) + " ";
          });

          const isHeader = rowIdx === 0;
          const rowStr = paint("│", ansi.cyan) + cells.join(paint("│", ansi.cyan)) + paint("│", ansi.cyan);
          result.push(isHeader ? paint(rowStr, ansi.bold) : rowStr);

          // Add separator after header
          if (isHeader) {
            const sep = paint("├", ansi.cyan) + colWidths.map(w => "─".repeat(w + 2)).join(paint("┼", ansi.cyan)) + paint("┤", ansi.cyan);
            result.push(sep);
          }
        });
        continue;
      }
    }

    // Regular Markdown (recursion-safe for cells)
    let text = line;
    text = text.replace(/^# (.*$)/gm, paint("$1", ansi.cyan, ansi.bold, ansi.underline));
    text = text.replace(/^## (.*$)/gm, paint("$1", ansi.cyan, ansi.bold));
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, paint("$1", ansi.bold, ansi.italic));
    text = text.replace(/\*\*(.*?)\*\*/g, paint("$1", ansi.bold));
    text = text.replace(/\*(.*?)\*/g, paint("$1", ansi.italic));
    text = text.replace(/`(.*?)`/g, paint("$1", ansi.bgBlack, ansi.cyan));
    if (text.trim().startsWith("- ")) text = text.replace("- ", " • ");

    result.push(text);
    i++;
  }

  return result.join("\n");
}


