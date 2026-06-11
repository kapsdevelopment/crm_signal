import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const build = spawnSync("node", [
  "../../node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.json",
], {
  cwd: appDir,
  stdio: "inherit",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const copy = spawnSync("node", ["scripts/copy-static.mjs"], {
  cwd: appDir,
  stdio: "inherit",
});

if (copy.status !== 0) {
  process.exit(copy.status ?? 1);
}

await import("./dev-server.mjs");
