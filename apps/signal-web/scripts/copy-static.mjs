import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(appDir, "..");
const distDir = join(rootDir, "dist");
const assetsDir = join(distDir, "assets");

await mkdir(assetsDir, { recursive: true });
await copyFile(join(rootDir, "index.html"), join(distDir, "index.html"));
await copyFile(join(rootDir, "src", "styles.css"), join(assetsDir, "styles.css"));
