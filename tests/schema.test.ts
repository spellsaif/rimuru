import { describe, expect, it } from "vitest";
import { jsonSchemaToZod, zodToOpenAISchema, zodToAnthropicSchema, zodToGeminiSchema } from "../src/core/schema.js";
import { z } from "zod";

describe("Schema system", () => {
  it("converts basic RuneSchema to Zod", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    });
    expect(zod).toBeDefined();
    const result = zod!.safeParse({ name: "hello" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      required: ["count"],
      properties: { count: { type: "number" } },
    });
    const result = zod!.safeParse({ count: "not-a-number" });
    expect(result.success).toBe(false);
  });

  it("handles optional fields", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      required: ["requiredField"],
      properties: {
        requiredField: { type: "string" },
        optionalField: { type: "boolean" },
      },
    });
    const result = zod!.safeParse({ requiredField: "x" });
    expect(result.success).toBe(true);
  });

  it("handles enums", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      properties: {
        color: { type: "string", enum: ["red", "green", "blue"] },
      },
    });
    const result = zod!.safeParse({ color: "red" });
    expect(result.success).toBe(true);
  });

  it("handles nested objects", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      required: ["meta"],
      properties: {
        meta: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "number" },
            tags: { type: "array" },
          },
        },
      },
    });
    const result = zod!.safeParse({ meta: { id: 42, tags: ["a", "b"] } });
    expect(result.success).toBe(true);
  });

  it("handles arrays", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      properties: { items: { type: "array" } },
    });
    const result = zod!.safeParse({ items: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it("returns undefined for null schema", () => {
    expect(jsonSchemaToZod(undefined)).toBeUndefined();
  });

  it("converts simple Zod to OpenAI format", () => {
    const schema = zodToOpenAISchema(z.object({ name: z.string() }), { name: "test", description: "A test tool" });
    const obj = schema as any;
    expect(obj.type).toBe("function");
    expect(obj.function.name).toBe("test");
    expect(obj.function.description).toBe("A test tool");
    expect(obj.function.parameters.type).toBe("object");
  });

  it("converts Zod to Anthropic format", () => {
    const schema = zodToAnthropicSchema(z.object({ x: z.number() }), { name: "calc" });
    const obj = schema as any;
    expect(obj.name).toBe("calc");
    expect(obj.input_schema.type).toBe("object");
    expect(obj.input_schema.properties.x.type).toBe("number");
  });

  it("converts Zod to Gemini format with uppercased types", () => {
    const schema = zodToGeminiSchema(z.object({ name: z.string() }), { name: "greet" });
    const obj = schema as any;
    expect(obj.functionDeclarations[0].name).toBe("greet");
    expect(obj.functionDeclarations[0].parameters.type).toBe("OBJECT");
  });

  it("handles Zod string with regex pattern", () => {
    const zod = jsonSchemaToZod({
      type: "object",
      properties: { email: { type: "string", pattern: "^[a-z]+@[a-z]+\\.com$" } },
    });
    const result = zod!.safeParse({ email: "test@abc.com" });
    expect(result.success).toBe(true);
    const fail = zod!.safeParse({ email: "not-an-email" });
    expect(fail.success).toBe(false);
  });
});
