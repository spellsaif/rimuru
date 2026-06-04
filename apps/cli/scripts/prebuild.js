import { mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

async function prebuild() {
  const publicDir = join(process.cwd(), "public");
  const webOutDir = join(process.cwd(), "..", "web", "out");

  // Re-create the public folder
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });

  if (existsSync(webOutDir)) {
    console.log(`Copying files from ${webOutDir} to ${publicDir}...`);
    await cp(webOutDir, publicDir, { recursive: true });
  } else {
    console.warn(`Warning: Web app build output not found at ${webOutDir}. Build @rimuru/web first.`);
  }
}

prebuild().catch((err) => {
  console.error("Prebuild failed:", err);
  process.exit(1);
});
