import pg from "pg";
import { createDbClient } from "../db.js";

type IdRow = {
  id: string;
};

type OrganizationRow = {
  id: string;
  orgnr: string;
  name: string;
};

type LocalIcpSeed = {
  name: string;
  description: string;
  criteria: Record<string, unknown>;
};

const localIcpSeeds: LocalIcpSeed[] = [
  {
    name: "Lokal ICP: Oslo IT/SaaS",
    description:
      "Aktive aksjeselskaper i Oslo innen programvare, IT-drift og datatjenester.",
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["62.", "63.1"],
      requireActive: true,
      scoreBoost: 15,
    },
  },
  {
    name: "Lokal ICP: Oslo B2B-rådgivning",
    description:
      "Aktive aksjeselskaper i Oslo innen bedriftsrådgivning, teknisk rådgivning, marked og spesialisert tjenesteyting.",
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["70.22", "71.1", "73.", "74.9"],
      requireActive: true,
      scoreBoost: 12,
    },
  },
  {
    name: "Lokal ICP: Oslo håndverk/utbygging",
    description:
      "Aktive aksjeselskaper i Oslo innen bygg, anlegg, håndverk og installasjon.",
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["41.", "42.", "43."],
      requireActive: true,
      scoreBoost: 10,
    },
  },
  {
    name: "Lokal ICP: Oslo eiendom/utleie/holding",
    description:
      "Aktive aksjeselskaper i Oslo innen eiendom, utleie, eiendomsforvaltning og holding.",
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["64.2", "68."],
      requireActive: true,
      scoreBoost: 6,
    },
  },
];

const retiredIcpNames = ["Lokal Oslo ICP", "Lokal ICP: Oslo bygg/eiendom"];
const watchlistName = "Lokal manuell watchlist";

const watchlistCriteria = {
  scoreBoost: 18,
};

async function deactivateRetiredIcps(client: pg.Client): Promise<void> {
  await client.query(
    `update icp_profiles
     set is_active = false
     where tenant_id is null
       and name = any($1::text[])`,
    [retiredIcpNames],
  );
}

async function upsertIcpProfile(
  client: pg.Client,
  seed: LocalIcpSeed,
): Promise<string> {
  const existing = await client.query<IdRow>(
    `select id
     from icp_profiles
     where tenant_id is null
       and name = $1
     limit 1`,
    [seed.name],
  );

  const existingRow = existing.rows[0];

  if (existingRow) {
    await client.query(
      `update icp_profiles
       set description = $2,
           criteria = $3
       where id = $1`,
      [existingRow.id, seed.description, seed.criteria],
    );

    return existingRow.id;
  }

  const created = await client.query<IdRow>(
    `insert into icp_profiles (name, description, criteria)
     values ($1, $2, $3)
     returning id`,
    [seed.name, seed.description, seed.criteria],
  );

  return created.rows[0].id;
}

async function getOrCreateWatchlist(client: pg.Client): Promise<string> {
  const existing = await client.query<IdRow>(
    `select id
     from watchlists
     where tenant_id is null
       and name = $1
     limit 1`,
    [watchlistName],
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const created = await client.query<IdRow>(
    `insert into watchlists (name, description, criteria)
     values ($1, $2, $3)
     returning id`,
    [
      watchlistName,
      "Lokal dev-watchlist for manuell prioritering av enkeltorganisasjoner.",
      watchlistCriteria,
    ],
  );

  return created.rows[0].id;
}

async function findFirstImportedOrganization(
  client: pg.Client,
): Promise<OrganizationRow> {
  const result = await client.query<OrganizationRow>(
    `select id, orgnr, name
     from organizations
     order by name
     limit 1`,
  );

  const organization = result.rows[0];

  if (!organization) {
    throw new Error("No organizations found. Run `pnpm worker brreg:import --scope oslo --limit 10` first.");
  }

  return organization;
}

async function addWatchlistItem(options: {
  client: pg.Client;
  watchlistId: string;
  organization: OrganizationRow;
}): Promise<void> {
  await options.client.query(
    `insert into watchlist_items (
       watchlist_id,
       organization_id,
       orgnr,
       display_name,
       note
     )
     values ($1, $2, $3, $4, $5)
     on conflict (watchlist_id, orgnr) do nothing`,
    [
      options.watchlistId,
      options.organization.id,
      options.organization.orgnr,
      options.organization.name,
      "Lokal seed for manuell prioritering.",
    ],
  );
}

export async function runSeedLocalContext(): Promise<void> {
  const client = createDbClient();
  await client.connect();

  try {
    await deactivateRetiredIcps(client);
    const icpProfiles = [];

    for (const seed of localIcpSeeds) {
      const id = await upsertIcpProfile(client, seed);
      icpProfiles.push({ id, name: seed.name });
    }

    const watchlistId = await getOrCreateWatchlist(client);
    const organization = await findFirstImportedOrganization(client);

    await addWatchlistItem({ client, watchlistId, organization });

    console.log("Local scoring context seeded");
    console.log(
      JSON.stringify(
        {
          icpProfiles,
          deactivatedRetiredIcps: retiredIcpNames,
          watchlist: { id: watchlistId, name: watchlistName },
          watchlistItem: {
            orgnr: organization.orgnr,
            name: organization.name,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}
