import type { RuntimeConfig } from "../config/runtime-config.js";
export interface VesselSummary {
    readonly name: string;
    readonly active: boolean;
    readonly shard: string;
    readonly model: string;
    readonly soul: string;
    readonly vows: readonly string[];
    readonly barrier: string;
    readonly workspace?: string;
}
export declare function listVessels(config: RuntimeConfig): readonly VesselSummary[];
export declare function activeVessel(config: RuntimeConfig): VesselSummary;
