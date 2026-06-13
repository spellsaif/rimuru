export interface BranchOptions {
    readonly ignoreDirs?: readonly string[];
    readonly symlinkDirs?: readonly string[];
}
/**
 * Creates a lightweight branch of the workspace by copying source files and symlinking large dependencies.
 */
export declare function createWorkspaceBranch(workspace: string, branchId: string, options?: BranchOptions): Promise<string>;
/**
 * Deletes a workspace branch safely.
 */
export declare function deleteWorkspaceBranch(workspace: string, branchId: string): Promise<void>;
/**
 * Merges changes from the branch back to the master workspace.
 */
export declare function mergeWorkspaceBranch(workspace: string, branchId: string, options?: BranchOptions): Promise<readonly string[]>;
