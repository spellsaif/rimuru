import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
    },
    alias: {
      "../src/index.js": resolve(__dirname, "./packages/core/src/index.ts"),
    },
  },
});
