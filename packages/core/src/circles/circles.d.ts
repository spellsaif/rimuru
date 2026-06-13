import type { CircleConfig, RuntimeConfig } from "../config/runtime-config.js";
import type { FlowBus } from "../core/events.js";
export interface CircleSummary {
    readonly name: string;
    readonly kind: string;
    readonly enabled: boolean;
    readonly endpoint: string;
    readonly paired: boolean;
}
export interface CircleMessage {
    readonly circle: string;
    readonly from: string;
    readonly text: string;
    readonly sessionId?: string;
    readonly raw: unknown;
}
/**
 * Channel Adapter interface.
 * Standardizes how different messaging platforms interact with Rimuru.
 */
export interface CircleAdapter {
    readonly kind: string;
    normalize(circle: CircleConfig, body: Record<string, unknown>): CircleMessage | {
        readonly challenge?: string;
        readonly pong?: boolean;
    } | undefined;
    send?(circle: CircleConfig, chatId: string, text: string): Promise<void>;
    start?(circle: CircleConfig, context: {
        workspace: string;
        flowBus: FlowBus;
    }): Promise<void>;
}
export declare function verifySlackSignature(signingSecret: string, timestamp: string, rawBody: string, signature: string): boolean;
export declare function verifyDiscordSignature(publicKeyHex: string, timestamp: string, rawBody: string, signatureHex: string): boolean;
export declare const TELEGRAM_ADAPTER: CircleAdapter;
export declare const SLACK_ADAPTER: CircleAdapter;
export declare const DISCORD_ADAPTER: CircleAdapter;
export declare function registerCircleAdapter(adapter: CircleAdapter): void;
export declare function getCircleAdapter(kind: string): CircleAdapter | undefined;
export declare function listCircles(config: RuntimeConfig): readonly CircleSummary[];
export declare function circleByName(config: RuntimeConfig, name: string): CircleConfig | undefined;
export declare function normalizeLocalCircleMessage(body: Record<string, unknown>, sessionId: string): CircleMessage;
