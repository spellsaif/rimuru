import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export async function createCanvasArtifact(workspace, input) {
    const artifact = {
        id: `${Date.now()}-${safeName(input.title || "artifact")}.json`,
        title: input.title || "Untitled",
        kind: input.kind,
        content: input.content,
        createdAt: new Date().toISOString(),
    };
    const path = artifactPath(workspace, artifact.id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return summarize(artifact);
}
export async function listCanvasArtifacts(workspace) {
    try {
        const entries = (await readdir(canvasRoot(workspace)))
            .filter((entry) => entry.endsWith(".json"))
            .sort()
            .reverse();
        const artifacts = await Promise.all(entries.map((entry) => readCanvasArtifact(workspace, entry)));
        return artifacts.map(summarize);
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
            return [];
        throw error;
    }
}
export async function readCanvasArtifact(workspace, id) {
    const parsed = JSON.parse(await readFile(artifactPath(workspace, safeArtifactId(id)), "utf8"));
    if (typeof parsed.id !== "string" ||
        typeof parsed.title !== "string" ||
        typeof parsed.kind !== "string" ||
        typeof parsed.content !== "string" ||
        typeof parsed.createdAt !== "string") {
        throw new Error(`Invalid canvas artifact: ${id}`);
    }
    if (parsed.kind !== "markdown" && parsed.kind !== "html" && parsed.kind !== "text" && parsed.kind !== "json")
        throw new Error(`Invalid canvas artifact kind: ${parsed.kind}`);
    return {
        id: parsed.id,
        title: parsed.title,
        kind: parsed.kind,
        content: parsed.content,
        createdAt: parsed.createdAt,
    };
}
function summarize(artifact) {
    return { id: artifact.id, title: artifact.title, kind: artifact.kind, createdAt: artifact.createdAt };
}
function canvasRoot(workspace) {
    return join(workspace, ".rimuru", "canvas");
}
function artifactPath(workspace, id) {
    return join(canvasRoot(workspace), safeArtifactId(id));
}
function safeArtifactId(id) {
    const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    return safe.endsWith(".json") ? safe : `${safe}.json`;
}
function safeName(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
//# sourceMappingURL=canvas.js.map