import * as readline from "node:readline";

export async function selectInteractive<T>(prompt: string, options: readonly T[], defaultIndex = 0): Promise<T> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    let selected = defaultIndex;

    const render = () => {
      process.stdout.write("\x1b[?25l"); // Hide cursor
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
      process.stdout.write(`\x1b[96m?\x1b[0m ${prompt}\n`);
      for (let i = 0; i < options.length; i++) {
        if (i === selected) {
          process.stdout.write(`\x1b[36m❯ ${options[i]}\x1b[0m\n`);
        } else {
          process.stdout.write(`  ${options[i]}\n`);
        }
      }
    };

    const cleanup = () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h"); // Show cursor
      process.stdin.removeListener("keypress", onKeypress);
      rl.close();
    };

    const onKeypress = (_str: string, key: any) => {
      if (key.name === "up" || key.name === "k") {
        selected = (selected - 1 + options.length) % options.length;
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        render();
      } else if (key.name === "down" || key.name === "j") {
        selected = (selected + 1) % options.length;
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        render();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        readline.clearScreenDown(process.stdout);
        process.stdout.write(`\x1b[96m?\x1b[0m ${prompt} \x1b[36m${String(options[selected])}\x1b[0m\n`);
        resolve(options[selected]);
      } else if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(1);
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

export async function multiSelectInteractive<T>(prompt: string, options: readonly T[], defaultIndices: number[] = []): Promise<T[]> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    let cursor = 0;
    const selected = new Set(defaultIndices);

    const render = () => {
      process.stdout.write("\x1b[?25l"); // Hide cursor
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
      process.stdout.write(`\x1b[96m?\x1b[0m ${prompt} \x1b[90m(Press <space> to select, <enter> to confirm)\x1b[0m\n`);
      for (let i = 0; i < options.length; i++) {
        const isSelected = selected.has(i);
        const prefix = i === cursor ? "\x1b[36m❯\x1b[0m" : " ";
        const box = isSelected ? "\x1b[32m◉\x1b[0m" : "◯";
        const color = isSelected ? "\x1b[32m" : "";
        const reset = isSelected ? "\x1b[0m" : "";
        process.stdout.write(`${prefix} ${box} ${color}${options[i]}${reset}\n`);
      }
    };

    const cleanup = () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h"); // Show cursor
      process.stdin.removeListener("keypress", onKeypress);
      rl.close();
    };

    const onKeypress = (_str: string, key: any) => {
      if (key.name === "up" || key.name === "k") {
        cursor = (cursor - 1 + options.length) % options.length;
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        render();
      } else if (key.name === "down" || key.name === "j") {
        cursor = (cursor + 1) % options.length;
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        render();
      } else if (key.name === "space") {
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        render();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        const result = Array.from(selected).map(i => options[i]);
        readline.moveCursor(process.stdout, 0, -(options.length + 1));
        readline.clearScreenDown(process.stdout);
        process.stdout.write(`\x1b[96m?\x1b[0m ${prompt} \x1b[36m${result.join(", ") || "none"}\x1b[0m\n`);
        resolve(result);
      } else if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(1);
      }
    };

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

export async function inputInteractive(prompt: string, defaultValue = "", password = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`\x1b[96m?\x1b[0m ${prompt} ${defaultValue ? `\x1b[90m(${defaultValue})\x1b[0m ` : ""}`);

    let isMuted = password;
    const originalWrite = process.stdout.write.bind(process.stdout);

    if (isMuted) {
      // @ts-expect-error - overriding write for password masking
      process.stdout.write = (chunk: any, encoding: any, callback: any) => {
        if (!isMuted) return originalWrite(chunk, encoding, callback);
        if (chunk === "\r\n" || chunk === "\n") return originalWrite(chunk, encoding, callback);
        return originalWrite("*");
      };

    }

    rl.question("", (answer) => {
      isMuted = false; // Stop masking
      if (password) process.stdout.write = originalWrite;
      rl.close();
      const result = answer.trim() || defaultValue;
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearScreenDown(process.stdout);
      const displayValue = password && result ? "*".repeat(Math.min(result.length, 12)) : result;
      process.stdout.write(`\x1b[96m?\x1b[0m ${prompt} \x1b[36m${displayValue || (defaultValue ? defaultValue : "empty")}\x1b[0m\n`);
      resolve(result);
    });
  });
}
