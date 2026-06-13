export interface Ritual {
    readonly id: string;
    readonly prompt: string;
    readonly sessionId: string;
    readonly everyMinutes: number;
    readonly enabled: boolean;
    readonly nextRunAt: string;
    readonly lastRunAt?: string;
}
export declare function listRituals(workspace: string): Promise<readonly Ritual[]>;
export declare function createRitual(workspace: string, input: {
    readonly id: string;
    readonly prompt: string;
    readonly sessionId: string;
    readonly everyMinutes: number;
    readonly startAt?: Date;
}): Promise<Ritual>;
export declare function deleteRitual(workspace: string, id: string): Promise<{
    readonly deleted: boolean;
}>;
export declare function setRitualEnabled(workspace: string, id: string, enabled: boolean): Promise<Ritual>;
export declare function runDueRituals(workspace: string, now: Date, runner: (ritual: Ritual) => Promise<void>): Promise<readonly Ritual[]>;
