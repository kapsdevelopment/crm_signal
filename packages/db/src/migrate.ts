import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

type MigrationRecord = {
  id: string;
  filename: string;
  checksum: string;
  applied_at: Date;
};

const { Client } = pg;

const defaultDatabaseUrl =
  "postgresql://crm_signal:crm_signal_dev_password@localhost:54329/crm_signal";

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

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function getMigrationId(filename: string): string {
  return filename.replace(/\.sql$/u, "");
}

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

async function ensureMigrationTable(client: pg.Client): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      filename text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(
  client: pg.Client,
): Promise<Map<string, MigrationRecord>> {
  const result = await client.query<MigrationRecord>(
    "select id, filename, checksum, applied_at from schema_migrations order by id",
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "up";
  const repoRoot = findRepoRoot(process.cwd());
  const migrationsDir = path.join(repoRoot, "infra", "migrations");

  loadDotEnv(path.join(repoRoot, ".env"));

  const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    await ensureMigrationTable(client);

    const applied = await getAppliedMigrations(client);
    const migrationFiles = readdirSync(migrationsDir)
      .filter((filename) => filename.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    if (command === "status") {
      for (const filename of migrationFiles) {
        const id = getMigrationId(filename);
        const marker = applied.has(id) ? "applied" : "pending";
        console.log(`${marker.padEnd(8)} ${filename}`);
      }

      return;
    }

    if (command !== "up") {
      throw new Error(`Unknown migrate command: ${command}`);
    }

    for (const filename of migrationFiles) {
      const id = getMigrationId(filename);
      const sql = readFileSync(path.join(migrationsDir, filename), "utf8");
      const sqlChecksum = checksum(sql);
      const existing = applied.get(id);

      if (existing) {
        if (existing.checksum !== sqlChecksum) {
          throw new Error(
            `Migration ${filename} has changed after being applied.`,
          );
        }

        console.log(`skipping ${filename}`);
        continue;
      }

      console.log(`applying ${filename}`);

      await client.query("begin");

      try {
        await client.query(sql);
        await client.query(
          `insert into schema_migrations (id, filename, checksum)
           values ($1, $2, $3)`,
          [id, filename, sqlChecksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
