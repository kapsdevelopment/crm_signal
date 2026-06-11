import { getStringArg, parseArgs } from "../args.js";
import { createDbClient } from "../db.js";

const allowedRatings = new Set(["useful", "maybe", "noise"]);

type SignalTargetRow = {
  id: string;
  signal_type: string;
  score: number;
  title: string;
  orgnr: string;
  organization_name: string;
};

type FeedbackInsertRow = {
  id: string;
  created_at: Date;
};

function requiredString(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Missing required ${label}`);
  }

  return trimmed;
}

async function findSignalByIdPrefix(
  idPrefix: string,
): Promise<SignalTargetRow> {
  if (idPrefix.length < 8) {
    throw new Error("--id must be at least 8 characters when using a prefix.");
  }

  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<SignalTargetRow>(
      `select
         gs.id,
         gs.signal_type,
         gs.score,
         gs.title,
         o.orgnr,
         o.name as organization_name
       from generated_signals gs
       join organizations o on o.id = gs.organization_id
       where gs.id::text = $1
          or gs.id::text like $2
       order by gs.id
       limit 2`,
      [idPrefix, `${idPrefix}%`],
    );

    if (result.rows.length === 0) {
      throw new Error(`No signal found for --id ${idPrefix}`);
    }

    if (result.rows.length > 1) {
      throw new Error(
        `More than one signal matches --id ${idPrefix}. Use a longer prefix.`,
      );
    }

    return result.rows[0];
  } finally {
    await client.end();
  }
}

export async function runMarkSignalFeedback(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const idPrefix = requiredString(getStringArg(args, "id", ""), "--id");
  const rating = requiredString(
    getStringArg(args, "rating", getStringArg(args, "status", "")),
    "--rating",
  );
  const reason = getStringArg(args, "reason", "").trim() || null;

  if (!allowedRatings.has(rating)) {
    throw new Error("--rating must be one of: useful, maybe, noise");
  }

  const signal = await findSignalByIdPrefix(idPrefix);
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<FeedbackInsertRow>(
      `insert into signal_feedback (
         generated_signal_id,
         rating,
         reason
       )
       values ($1, $2, $3)
       returning id, created_at`,
      [signal.id, rating, reason],
    );
    const feedback = result.rows[0];

    console.log("Signal feedback recorded");
    console.log(
      JSON.stringify(
        {
          feedbackId: feedback.id,
          createdAt: feedback.created_at.toISOString(),
          signal: {
            id: signal.id,
            type: signal.signal_type,
            score: signal.score,
            title: signal.title,
            orgnr: signal.orgnr,
            organizationName: signal.organization_name,
          },
          rating,
          reason,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}
