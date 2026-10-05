/**
 * Apply supabase/migrations/*.sql to the database in SUPABASE_DB_URL (.env.local), in order, each in a
 * transaction, recording what ran in app_private.migrations (a schema the API does not expose).
 *
 *   npm run db:migrate                      # status: applied and pending, nothing changes
 *   npm run db:migrate -- --apply           # run the pending migrations
 *   npm run db:migrate -- --baseline=0010   # one time: record 0001…0010 as applied (they were run by hand)
 *
 * The database holds the learner's real progress, so migrations that delete data (drop table/column,
 * truncate, delete from) are refused unless --allow-destructive is passed.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DIR = join(__dirname, "../supabase/migrations");
const DESTRUCTIVE = /\b(drop\s+table|drop\s+column|drop\s+schema|truncate|delete\s+from)\b/i;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`));

async function main() {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    console.error(
      "SUPABASE_DB_URL in .env.local must be the database connection string (postgresql://…), not the project URL.\n" +
        "Supabase dashboard → Connect → Session pooler → copy the URI and put your database password in place of [YOUR-PASSWORD].",
    );
    process.exit(1);
  }
  const sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : "require", max: 1, onnotice: () => {} });
  try {
    await sql`create schema if not exists app_private`;
    await sql`create table if not exists app_private.migrations (name text primary key, sha256 text, applied_at timestamptz not null default now())`;

    const files = readdirSync(DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from app_private.migrations`).map((r) => r.name));

    const baseline = arg("baseline=")?.split("=")[1];
    if (baseline) {
      const upto = files.filter((f) => f.split("_")[0] <= baseline && !applied.has(f));
      for (const f of upto) await sql`insert into app_private.migrations (name, sha256) values (${f}, ${hash(f)})`;
      console.log(`baseline: recorded ${upto.length} migration(s) up to ${baseline} as applied (not run)`);
      upto.forEach((f) => applied.add(f));
    }

    const pending = files.filter((f) => !applied.has(f));
    console.log(`applied: ${applied.size}   pending: ${pending.length ? pending.join(", ") : "none"}`);
    if (!arg("apply") || !pending.length) return;

    for (const f of pending) {
      const body = readFileSync(join(DIR, f), "utf8");
      if (DESTRUCTIVE.test(body) && !arg("allow-destructive")) {
        console.error(`STOP ${f}: it deletes data (${body.match(DESTRUCTIVE)?.[0]}). Review it, then rerun with --allow-destructive.`);
        process.exit(1);
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into app_private.migrations (name, sha256) values (${f}, ${hash(f)})`;
      });
      console.log(`applied ${f}`);
    }
    // PostgREST caches the schema; ask it to reload so new tables are visible to the app at once
    await sql`notify pgrst, 'reload schema'`;
  } finally {
    await sql.end();
  }
}

const hash = (f: string) => createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex");

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
