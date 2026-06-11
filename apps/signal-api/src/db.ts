import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const defaultDatabaseUrl =
  "postgresql://crm_signal:crm_signal_dev_password@localhost:54329/crm_signal";

function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    if (existsSync(path.join(currentPath, "pnpm-workspace.yaml"))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  throw new Error(`Could not find repo root from ${startPath}`);
}

function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getDatabaseUrl(): string {
  const repoRoot = findRepoRoot(process.cwd());
  loadDotEnv(path.join(repoRoot, ".env"));

  return process.env.DATABASE_URL ?? defaultDatabaseUrl;
}

export function createDbClient(): pg.Client {
  return new Client({ connectionString: getDatabaseUrl() });
}
