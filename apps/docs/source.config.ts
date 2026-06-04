import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// @ts-ignore - portability error with Zod inference
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
