import { z } from "zod";
import type { RuneSchema } from "../core/types.js";
export type JsonSchemaType = "object" | "string" | "number" | "boolean" | "array" | "null";
export interface JsonSchemaObject {
    readonly type: "object";
    readonly properties?: Readonly<Record<string, JsonSchemaField>>;
    readonly required?: readonly string[];
    readonly additionalProperties?: boolean;
}
export type JsonSchemaField = JsonSchemaObject | {
    readonly type: "string" | "number" | "boolean" | "array" | "null";
    readonly enum?: readonly (string | number)[];
    readonly description?: string;
};
export declare function jsonSchemaToZod(schema: RuneSchema | undefined): z.ZodType<any> | undefined;
export declare function zodToOpenAISchema(zodType: z.ZodType<any>, metadata?: {
    name?: string;
    description?: string;
}): object;
export declare function zodToAnthropicSchema(zodType: z.ZodType<any>, metadata?: {
    name?: string;
    description?: string;
}): object;
export declare function zodToGeminiSchema(zodType: z.ZodType<any>, metadata?: {
    name?: string;
    description?: string;
}): object;
