/**
 * Runs every migration in PGlite (Postgres in WebAssembly) with small stand-ins for Supabase's
 * auth and storage schemas, then checks the SQL functions against the app's own logic.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";
import { bandSize, buildVocab, coverage, coverageFromVocab, frequencyBand } from "@/lib/learning/coverage";

const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
`;

const MIGRATIONS = join(__dirname, "../supabase/migrations");

// Original sample text: sentence starts, names mid-sentence, a hyphenated compound, repeated words.
const SAMPLE = `Kari bor i en liten by ved fjorden. Hver morgen går hun til bakeriet, der Ola selger brød og sjokolade-kake.

«Hva vil du ha i dag?» spør han. Kari smiler. Hun vil ha det samme som i går: et grovt brød og en kopp kaffe.

Etterpå sykler hun langs vannet til jobben i Bergen-avdelingen. Det regner, men hun synes det er fint likevel. Kollegaene hennes sier at Kari alltid kommer blid på jobb.`;

let db: PGlite;
const USER = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(`insert into auth.users (id, email) values ('${USER}', 'learner@example.com')`);
}, 30_000);

async function insertText(body: string, lang: "no" | "en") {
  const { rows } = await db.query<{ id: string }>(`insert into texts (lang, title, author, body) values ($1, 'T', 'A', $2) returning id`, [lang, body]);
  const id = rows[0].id;
  const v = buildVocab(body, lang);
  for (const e of v.entries) {
    await db.query(`insert into text_vocab (text_id, form, n, rank, parts, part_ranks) values ($1, $2, $3, $4, $5, $6)`, [id, e.form, e.n, e.rank, e.parts, e.part_ranks]);
  }
  await db.query(`update texts set token_count = $2, proper_tokens = $3, vocab_built_at = now() where id = $1`, [id, v.tokens, v.proper]);
  return { id, v };
}

async function sqlCoverage(id: string, lang: string, band: number, own: string[]) {
  const { rows } = await db.query<{ text_id: string; known_tokens: number; total_tokens: number }>(`select * from text_fit($1, $2, $3)`, [lang, band, own]);
  const r = rows.find((x) => x.text_id === id)!;
  return Number(r.known_tokens) / r.total_tokens;
}

describe("migrations and SQL functions", () => {
  it("text_fit matches the app's coverage() for every level and her own words", async () => {
    const { id, v } = await insertText(SAMPLE, "no");
    expect(v.entries.some((e) => e.parts?.join("-") === "sjokolade-kake")).toBe(true);
    const ownCases = [
      new Set<string>(),
      new Set(["fjorden", "bakeriet", "sjokolade", "kollegaene"]),
      new Set(["kake", "avdelingen", "likevel", "blid"]),
      new Set(["sjokolade", "kake", "grovt", "etterpå"]), // compound known only through both parts
    ];
    const seen = new Set<number>();
    for (const level of ["A1", "A2", "B1", "B2"]) {
      for (const own of ownCases) {
        const expected = coverage(SAMPLE, { band: frequencyBand("no", level), own }).coverage;
        expect(coverageFromVocab(v, own, bandSize(level))).toBeCloseTo(expected, 12);
        expect(await sqlCoverage(id, "no", bandSize(level), [...own])).toBeCloseTo(expected, 12);
        seen.add(Math.round(expected * 1e6));
      }
    }
    expect(seen.size).toBeGreaterThan(8); // levels and own words really change the result
  });

  it("skips texts without a built vocabulary, and editing a body clears it", async () => {
    const { id } = await insertText("Dette er en test. Den er kort.", "no");
    expect((await db.query(`select * from text_fit('no', 3000, '{}')`)).rows.some((r) => (r as { text_id: string }).text_id === id)).toBe(true);
    await db.query(`update texts set body = 'Ny tekst.' where id = $1`, [id]);
    const { rows } = await db.query<{ token_count: number | null }>(`select token_count from texts where id = $1`, [id]);
    expect(rows[0].token_count).toBeNull();
    expect((await db.query(`select * from text_fit('no', 3000, '{}')`)).rows.some((r) => (r as { text_id: string }).text_id === id)).toBe(false);
  });

  it("daily_activity counts only events since the date, by Oslo day", async () => {
    await db.query(
      `insert into events (user_id, type, created_at) values
         ($1, 'activity.heartbeat', '2026-10-01 10:00+00'), ($1, 'activity.heartbeat', '2026-10-01 10:00:30+00'),
         ($1, 'review.grade', '2026-10-01 11:00+00'), ($1, 'word.save', '2026-10-02 22:30+00'),
         ($1, 'activity.heartbeat', '2026-09-20 10:00+00')`,
      [USER],
    );
    const { rows } = await db.query<{ day: Date; minutes: string; reviews: number; words_saved: number }>(`select * from daily_activity($1, '2026-09-30')`, [USER]);
    const byDay = Object.fromEntries(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
    expect(Object.keys(byDay)).toEqual(["2026-10-01", "2026-10-03"]); // 22:30 UTC on 2 Oct is 00:30 on 3 Oct in Oslo
    expect(Number(byDay["2026-10-01"].minutes)).toBe(1);
    expect(Number(byDay["2026-10-01"].reviews)).toBe(1);
    expect(Number(byDay["2026-10-03"].words_saved)).toBe(1);
  });
});
