export interface VaultEntrySummary {
    readonly name: string;
    readonly updatedAt: string;
}
export declare function listVaultSecrets(workspace: string): Promise<readonly VaultEntrySummary[]>;
export declare function setVaultSecret(workspace: string, name: string, value: string, env?: NodeJS.ProcessEnv): Promise<VaultEntrySummary>;
export declare function getVaultSecret(workspace: string, name: string, env?: NodeJS.ProcessEnv): Promise<string>;
export declare function deleteVaultSecret(workspace: string, name: string): Promise<{
    readonly deleted: boolean;
}>;
