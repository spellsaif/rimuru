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

export function jsonSchemaToZod(schema: RuneSchema | undefined): z.ZodType<any> | undefined {
  if (!schema) return undefined;
  return convertRuneSchema(schema);
}

function convertRuneSchema(schema: any): z.ZodType<any> | undefined {
  if (!schema) return undefined;

  if (schema.enum && Array.isArray(schema.enum)) {
    const base = convertBaseType(schema.type);
    if (base) return base;
    return z.union(schema.enum.map((v: any) => z.literal(v)));
  }

  if (schema.type === "array") {
    return z.array(z.any());
  }
  if (schema.type === "boolean") {
    return z.boolean();
  }
  if (schema.type === "number") {
    return z.number();
  }
  if (schema.type === "string") {
    if (schema.pattern) {
      try {
        return z.string().regex(new RegExp(schema.pattern));
      } catch {
        return z.string();
      }
    }
    return z.string();
  }
  if (schema.type === "object") {
    const shape: Record<string, z.ZodType<any>> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      let fieldSchema = convertRuneSchema(prop) ?? z.any();
      if (!schema.required?.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }
      shape[key] = fieldSchema;
    }
    return z.object(shape);
  }

  return undefined;
}

function convertBaseType(type: string): z.ZodType<any> | undefined {
  switch (type) {
    case "string": return z.string();
    case "number": return z.number();
    case "boolean": return z.boolean();
    case "array": return z.array(z.any());
    case "object": return z.object({});
    default: return undefined;
  }
}

export function zodToOpenAISchema(zodType: z.ZodType<any>, metadata?: { name?: string; description?: string }): object {
  const jsonSchema = zodToJsonSchema(zodType);
  return {
    type: "function",
    function: {
      name: metadata?.name ?? "tool",
      description: metadata?.description ?? "",
      parameters: jsonSchema,
    },
  };
}

export function zodToAnthropicSchema(zodType: z.ZodType<any>, metadata?: { name?: string; description?: string }): object {
  const jsonSchema = zodToJsonSchema(zodType);
  return {
    name: metadata?.name ?? "tool",
    description: metadata?.description ?? "",
    input_schema: jsonSchema,
  };
}

export function zodToGeminiSchema(zodType: z.ZodType<any>, metadata?: { name?: string; description?: string }): object {
  const jsonSchema = zodToJsonSchema(zodType);
  return {
    functionDeclarations: [{
      name: metadata?.name ?? "tool",
      description: metadata?.description ?? "",
      parameters: uppercaseSchemaTypes(jsonSchema),
    }],
  };
}

function uppercaseSchemaTypes(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(uppercaseSchemaTypes);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "type" && typeof value === "string") {
      result[key] = value.toUpperCase();
    } else {
      result[key] = uppercaseSchemaTypes(value);
    }
  }
  return result;
}

function zodToJsonSchema(zodType: z.ZodType<any>): object {
  const def = (zodType as any)._def ?? {};
  const typeName = def.typeName;

  if (typeName === "ZodString") {
    const result: any = { type: "string" };
    for (const check of def.checks ?? []) {
      if (check.kind === "regex") result.pattern = check.regex.source;
    }
    return result;
  }
  if (typeName === "ZodNumber") return { type: "number" };
  if (typeName === "ZodBoolean") return { type: "boolean" };
  if (typeName === "ZodArray") return { type: "array", items: zodToJsonSchema(def.type) };
  if (typeName === "ZodEnum") return { type: "string", enum: def.values };
  if (typeName === "ZodObject") {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(def.shape() ?? {}) as [string, z.ZodType<any>][]) {
      properties[key] = zodToJsonSchema(value);
      if ((value as any)._def.typeName !== "ZodOptional") {
        required.push(key);
      }
    }
    const result: any = { type: "object", properties };
    if (required.length > 0) result.required = required;
    return result;
  }
  return { type: "string" };
}
