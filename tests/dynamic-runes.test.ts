import { describe, expect, it } from "vitest";
import { executeDynamicRune } from "../src/index.js";

describe("dynamic WASM-sandboxed runes", () => {
  it("executes valid code and returns outputs", async () => {
    const code = `
      const result = input.a + input.b;
      globalThis.output = { sum: result };
    `;
    const output = await executeDynamicRune(code, { a: 10, b: 20 });
    expect(output).toEqual({ sum: 30 });
  });

  it("handles basic return values without globalThis.output", async () => {
    const code = `
      input.val * 2;
    `;
    const output = await executeDynamicRune(code, { val: 5 });
    expect(output).toBe(10);
  });

  it("isolates execution from global node variables", async () => {
    const code = `
      let isIsolated = false;
      try {
        const p = process;
      } catch (e) {
        isIsolated = true;
      }
      isIsolated;
    `;
    const output = await executeDynamicRune(code, {});
    expect(output).toBe(true);
  });

  it("captures runtime errors gracefully", async () => {
    const code = `
      throw new Error("VM crashed");
    `;
    await expect(executeDynamicRune(code, {})).rejects.toThrow("Dynamic VM execution error");
  });
});
