import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export function renderSystemdUserService(options) {
    const nodePath = options.nodePath ?? process.execPath;
    const cliPath = options.cliPath ?? join(options.workspace, "dist", "cli.js");
    const port = options.port ?? 19710;
    return `[Unit]
Description=Rimuru Gate
After=network.target

[Service]
Type=simple
WorkingDirectory=${options.workspace}
ExecStart=${nodePath} ${cliPath} gate start --port ${port}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
}
export async function writeSystemdUserService(options) {
    const path = options.path ?? join(process.env.HOME ?? options.workspace, ".config", "systemd", "user", "rimuru.service");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, renderSystemdUserService(options), "utf8");
    return path;
}
//# sourceMappingURL=service.js.map