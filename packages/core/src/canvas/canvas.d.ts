export interface CanvasArtifact {
    readonly id: string;
    readonly title: string;
    readonly kind: "markdown" | "html" | "text" | "json";
    readonly content: string;
    readonly createdAt: string;
}
export interface CanvasArtifactSummary {
    readonly id: string;
    readonly title: string;
    readonly kind: CanvasArtifact["kind"];
    readonly createdAt: string;
}
export declare function createCanvasArtifact(workspace: string, input: {
    readonly title: string;
    readonly kind: CanvasArtifact["kind"];
    readonly content: string;
}): Promise<CanvasArtifactSummary>;
export declare function listCanvasArtifacts(workspace: string): Promise<readonly CanvasArtifactSummary[]>;
export declare function readCanvasArtifact(workspace: string, id: string): Promise<CanvasArtifact>;
