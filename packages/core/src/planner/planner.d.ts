export interface PlanStep {
    readonly id: number;
    readonly goal: string;
    readonly suggestedRune?: string;
}
export interface Plan {
    readonly objective: string;
    readonly steps: readonly PlanStep[];
}
export declare function planObjective(objective: string): Plan;
