export interface ServiceFileOptions {
    readonly workspace: string;
    readonly nodePath?: string;
    readonly cliPath?: string;
    readonly port?: number;
}
export declare function renderSystemdUserService(options: ServiceFileOptions): string;
export declare function writeSystemdUserService(options: ServiceFileOptions & {
    readonly path?: string;
}): Promise<string>;
