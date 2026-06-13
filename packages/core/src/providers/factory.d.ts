import type { RuntimeConfig, ProviderKind } from "../config/runtime-config.js";
import type { Shard } from "../core/types.js";
export interface ShardAdapter {
    readonly kind: ProviderKind;
    matches(baseUrl?: string): boolean;
    create(config: RuntimeConfig): Shard;
}
export declare function registerShardAdapter(adapter: ShardAdapter): void;
export declare function createShard(config: RuntimeConfig): Shard;
export declare function listShardKinds(): readonly ProviderKind[];
