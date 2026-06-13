import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertCommandName } from "./workspace.js";
const execFileAsync = promisify(execFile);
const compiledModulesCache = new Map();
export async function runSandboxedCommand(input, mode = sandboxModeFromEnv()) {
    if (mode !== "wasi") {
        assertCommandName(input.command);
    }
    if (mode === "readonly")
        throw new Error("Sandbox readonly mode denies command execution");
    if (mode === "docker") {
        const { stdout, stderr } = await execFileAsync("docker", [
            "run",
            "--rm",
            "--network",
            "none",
            "-v",
            `${input.workspace}:/workspace:rw`,
            "-w",
            "/workspace",
            "node:22-alpine",
            input.command,
            ...(input.args ?? []),
        ], { cwd: input.workspace, signal: input.signal, maxBuffer: 1024 * 1024 });
        return { stdout, stderr };
    }
    if (mode === "wasi") {
        let stdoutFile;
        let stderrFile;
        let stdinFile;
        const { join, resolve } = await import("node:path");
        const { resolveWorkspacePath } = await import("./workspace.js");
        // Ensure wasm path does not escape workspace or access forbidden directories
        const wasmPath = resolve(input.workspace, `${input.command}.wasm`);
        resolveWorkspacePath(input.workspace, wasmPath, { allowRimuruInternal: true });
        const stdoutPath = join(input.workspace, `.rimuru-wasi-stdout-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
        const stderrPath = join(input.workspace, `.rimuru-wasi-stderr-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
        const stdinPath = join(input.workspace, `.rimuru-wasi-stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
        try {
            const { WASI } = await import("node:wasi");
            const { readFile, open, unlink, writeFile } = await import("node:fs/promises");
            stdoutFile = await open(stdoutPath, "w+");
            stderrFile = await open(stderrPath, "w+");
            if (input.stdin !== undefined) {
                await writeFile(stdinPath, input.stdin, "utf8");
                stdinFile = await open(stdinPath, "r");
            }
            const wasi = new WASI({
                version: "preview1",
                args: [input.command, ...(input.args ?? [])],
                env: process.env,
                preopens: { "/workspace": input.workspace },
                stdin: stdinFile ? stdinFile.fd : undefined,
                stdout: stdoutFile.fd,
                stderr: stderrFile.fd,
            });
            let wasmModule = compiledModulesCache.get(wasmPath);
            if (!wasmModule) {
                const wasmBuffer = await readFile(wasmPath);
                wasmModule = await WebAssembly.compile(wasmBuffer);
                compiledModulesCache.set(wasmPath, wasmModule);
            }
            const instance = await WebAssembly.instantiate(wasmModule, wasi.getImportObject());
            wasi.start(instance);
            await stdoutFile.close();
            await stderrFile.close();
            stdoutFile = undefined;
            stderrFile = undefined;
            if (stdinFile) {
                await stdinFile.close();
                stdinFile = undefined;
                await unlink(stdinPath);
            }
            const stdout = await readFile(stdoutPath, "utf8");
            const stderr = await readFile(stderrPath, "utf8");
            await unlink(stdoutPath);
            await unlink(stderrPath);
            return { stdout, stderr };
        }
        catch (e) {
            if (stdoutFile) {
                try {
                    await stdoutFile.close();
                }
                catch { }
            }
            if (stderrFile) {
                try {
                    await stderrFile.close();
                }
                catch { }
            }
            if (stdinFile) {
                try {
                    await stdinFile.close();
                }
                catch { }
            }
            try {
                const { unlink } = await import("node:fs/promises");
                await unlink(stdoutPath);
            }
            catch { }
            try {
                const { unlink } = await import("node:fs/promises");
                await unlink(stderrPath);
            }
            catch { }
            try {
                const { unlink } = await import("node:fs/promises");
                await unlink(stdinPath);
            }
            catch { }
            throw new Error(`WASI execution failed: wasm binary for '${input.command}' not found or invalid (${e.message})`);
        }
    }
    const { stdout, stderr } = await execFileAsync(input.command, [...(input.args ?? [])], {
        cwd: input.workspace,
        signal: input.signal,
        maxBuffer: 1024 * 1024,
    });
    return { stdout, stderr };
}
export function sandboxModeFromEnv(env = process.env) {
    const value = env.RIMURU_SANDBOX ?? "none";
    if (value === "none" || value === "readonly" || value === "docker" || value === "wasi")
        return value;
    throw new Error(`Unsupported sandbox mode: ${value}`);
}
//# sourceMappingURL=sandbox.js.map