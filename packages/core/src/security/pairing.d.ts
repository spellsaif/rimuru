export interface PairingEntry {
    readonly code: string;
    readonly circle: string;
    readonly from: string;
    readonly createdAt: string;
}
export interface AllowedSender {
    readonly circle: string;
    readonly from: string;
    readonly approvedAt: string;
}
interface PairingFile {
    readonly pending: readonly PairingEntry[];
    readonly allowed: readonly AllowedSender[];
}
export declare function requestPairing(workspace: string, circle: string, from: string): Promise<PairingEntry>;
export declare function approvePairing(workspace: string, code: string): Promise<AllowedSender>;
export declare function listPairings(workspace: string): Promise<PairingFile>;
export declare function isSenderAllowed(workspace: string, circle: string, from: string, configuredAllow?: readonly string[]): Promise<boolean>;
export declare function requireSenderAllowed(workspace: string, circle: string, from: string, configuredAllow?: readonly string[]): Promise<{
    readonly allowed: true;
} | {
    readonly allowed: false;
    readonly pairing: PairingEntry;
}>;
export {};
