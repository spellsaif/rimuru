export interface ResolveWorkspacePathOptions {
    readonly allowRimuruInternal?: boolean;
}
export declare function resolveWorkspacePath(workspace: string, path: string, options?: ResolveWorkspacePathOptions): string;
export declare function assertCommandName(command: string): void;
export declare function assertFormatterName(command: string): void;
