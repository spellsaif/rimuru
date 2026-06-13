import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  minify: true,
  bundle: true,
  publicDir: "public",
  target: "node20",
  platform: "node",
  // Bundle internal workspace packages
  noExternal: ["@rimuru/core", "@rimuru/gate", "@rimuru/vault", "@rimuru/voice"],
  shims: true, // Fix for some CJS dependencies
  external: [
    "puppeteer-core",
    "puppeteer",
    "qrcode-terminal",
    "@aws-sdk/client-s3",
    "unzipper",
    "sharp",
    "events",
    "fs",
    "path",
    "os",
    "crypto",
    "stream",
    "util",
    "url",
    "http",
    "https",
    "zlib",
    "whatsapp-web.js",
    "typescript",
    "quickjs-emscripten",
  ],
});
