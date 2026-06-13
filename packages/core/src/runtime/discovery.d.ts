import type { Rune } from "../core/types.js";
export declare function loadSoul(workspace: string): Promise<string | undefined>;
/**
 * Discovers sandboxed runes in .rimuru/runes/ workspace directory.
 */
export declare function discoverSandboxedRunes(workspace: string): Promise<readonly Rune[]>;
