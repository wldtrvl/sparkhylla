/**
 * Route handlers with a fake session and a fake database that records every query.
 * Checks auth, validation and what each route writes; no network, no Supabase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data?: unknown; error?: { message: string } | null; count?: number };
type Call = { table: string; ops: [string, unknown[]][] };

/** A chainable stand-in for the Supabase query builder: every call is recorded, awaiting returns the next queued result. */
function fakeDb(queue: Record<string, Result[]>) {
  const calls: Call[] = [];
  const db = {
    calls,
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const chain = new Proxy(builder, {
        get(_t, prop: string) {
          if (prop === "then") {
            const r = queue[table]?.shift() ?? { data: null, error: null };
            return (resolve: (v: Result) => void) => resolve({ error: null, ...r });
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return db;
}

const USER = "11111111-1111-1111-1111-111111111111";
const state: { session: unknown } = { session: null };
const logged: { type: string; props: Record<string, unknown> }[] = [];

vi.mock("@/lib/session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSession: async () => state.session ?? NextResponse.json({ error: "Войдите заново." }, { status: 401 }),
    isResponse: (x: unknown) => x instanceof NextResponse,
    logEvent: (_s: unknown, type: string, props: Record<string, unknown> = {}) => void logged.push({ type, props }),
  };
});

function session(role: "learner" | "coach", db: ReturnType<typeof fakeDb>) {
  return {
    supabase: db,
    user: { id: USER, email: null },
    profile: { user_id: USER, display_name: "", role, ui_lang: "ru", active_lang: "no", levels: { no: { reading: "B1", speaking: "B1", writing: "B1" } }, settings: {} },
  };
}

const post = (body: unknown, method = "POST") => new Request("http://test/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const inserted = (db: ReturnType<typeof fakeDb>, table: string, op = "insert") => db.calls.find((c) => c.table === table && c.ops.some(([o]) => o === op))?.ops.find(([o]) => o === op)?.[1][0] as Record<string, unknown>;

beforeEach(() => {
  state.session = null;
  logged.length = 0;
});

describe("POST /api/words", async () => {
  const { POST, PATCH } = await import("@/app/api/words/route");

  it("asks to sign in again without a session", async () => {
    const r = await POST(post({ lang: "no", term: "hus" }));
    expect(r.status).toBe(401);
  });

  it("rejects invalid input", async () => {
    state.session = session("learner", fakeDb({}));
    expect((await POST(post({ lang: "de", term: "Haus" }))).status).toBe(400);
  });

  it("saves a new word to learn with a review card due now", async () => {
    const db = fakeDb({ words: [{ data: null }, { data: { id: "w1" } }] });
    state.session = session("learner", db);
    const r = await POST(post({ lang: "no", term: "fjord", translation: "фьорд", status: "learning" }));
    expect(r.status).toBe(200);
    const row = inserted(db, "words");
    expect(row).toMatchObject({ user_id: USER, term: "fjord", status: "learning" });
    expect(row.fsrs).toBeTruthy();
    expect(row.due).toBeTruthy();
    expect(logged.map((l) => l.type)).toEqual(["word.save"]);
  });

  it("marks a word known without a review card", async () => {
    const db = fakeDb({ words: [{ data: null }, { data: { id: "w2" } }] });
    state.session = session("learner", db);
    await POST(post({ lang: "no", term: "hus", status: "known" }));
    expect(inserted(db, "words")).toMatchObject({ status: "known", fsrs: null, due: null });
    expect(logged[0].type).toBe("word.mark_known");
  });

  it("keeps the review schedule when a word she is learning is saved again", async () => {
    const db = fakeDb({ words: [{ data: { id: "w3", status: "learning" } }, { data: { id: "w3" } }] });
    state.session = session("learner", db);
    await POST(post({ lang: "no", term: "fjord", status: "learning" }));
    const row = inserted(db, "words", "update");
    expect(row).not.toHaveProperty("fsrs");
    expect(row).not.toHaveProperty("due");
  });

  it("PATCH: back to learning gets a fresh card; known leaves review", async () => {
    let db = fakeDb({ words: [{ data: { id: "w4", status: "known" } }, {}] });
    state.session = session("learner", db);
    await PATCH(post({ id: "00000000-0000-4000-8000-000000000004", status: "learning", translation: "дом" }, "PATCH"));
    expect(inserted(db, "words", "update")).toMatchObject({ status: "learning", translation: "дом" });
    expect(inserted(db, "words", "update").fsrs).toBeTruthy();

    db = fakeDb({ words: [{ data: { id: "w5", status: "learning" } }, {}] });
    state.session = session("learner", db);
    await PATCH(post({ id: "00000000-0000-4000-8000-000000000005", status: "known" }, "PATCH"));
    expect(inserted(db, "words", "update")).toMatchObject({ status: "known", fsrs: null, due: null });
    expect(logged.at(-1)).toMatchObject({ type: "word.edit", props: { from: "learning", to: "known" } });
  });

  it("PATCH: a word that is not hers is not found", async () => {
    state.session = session("learner", fakeDb({ words: [{ data: null }] }));
    expect((await PATCH(post({ id: "00000000-0000-4000-8000-000000000006", note: "x" }, "PATCH"))).status).toBe(404);
  });
});

describe("POST /api/review", async () => {
  const { POST } = await import("@/app/api/review/route");
  const { newCard } = await import("@/lib/learning/srs");

  it("counts a lapse when she forgot, and stores the answer check", async () => {
    const db = fakeDb({ words: [{ data: { id: "w1", term: "fjord", fsrs: newCard(new Date("2026-10-01")), reps: 3, lapses: 1 } }, {}], reviews: [{}] });
    state.session = session("learner", db);
    const r = await POST(post({ wordId: "00000000-0000-4000-8000-000000000001", answer: "forgot", mode: "typed", given: "fjor" }));
    expect(r.status).toBe(200);
    expect(inserted(db, "words", "update")).toMatchObject({ reps: 4, lapses: 2 });
    expect(inserted(db, "reviews")).toMatchObject({ word_id: "w1", mode: "typed", answer: "fjor", auto_correct: true });
  });
});

describe("POST /api/events", async () => {
  const { POST } = await import("@/app/api/events/route");

  it("rejects event names that do not follow area.action", async () => {
    state.session = session("learner", fakeDb({}));
    expect((await POST(post({ events: [{ type: "Click!" }] }))).status).toBe(400);
  });

  it("keeps a plausible client time and replaces one older than a day", async () => {
    const db = fakeDb({ events: [{}] });
    state.session = session("learner", db);
    const recent = new Date(Date.now() - 60_000).toISOString();
    await POST(post({ events: [{ type: "word.tap", ts: recent }, { type: "word.tap", ts: "2020-01-01T00:00:00.000Z" }] }));
    const rows = db.calls.find((c) => c.table === "events")!.ops[0][1][0] as { created_at: string; user_id: string }[];
    expect(rows[0].created_at).toBe(recent);
    expect(Date.parse(rows[1].created_at)).toBeGreaterThan(Date.now() - 60_000);
    expect(rows.every((r) => r.user_id === USER)).toBe(true);
  });
});

describe("POST /api/import/save", async () => {
  const { POST } = await import("@/app/api/import/save/route");
  const body = { source: "file", title: "T", author: "A", year: "", lang: "no", kind: "story", body: "Det var en gang en mann som bodde i skogen. ".repeat(3), sourceUrl: "", license: "public domain", rights: "check", confirmed: false, estLevel: null, authorNote: "" };

  it("is for the coach only", async () => {
    state.session = session("learner", fakeDb({}));
    expect((await POST(post(body))).status).toBe(403);
  });

  it("needs the coach to confirm the rights of an unverified text", async () => {
    const db = fakeDb({});
    state.session = session("coach", db);
    expect((await POST(post(body))).status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it("cannot be sent a blocked text", async () => {
    state.session = session("coach", fakeDb({}));
    expect((await POST(post({ ...body, rights: "blocked", confirmed: true }))).status).toBe(400);
  });
});
