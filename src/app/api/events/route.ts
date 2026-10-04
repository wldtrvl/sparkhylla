import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { toJson } from "@/lib/db-json";
import { apiSession, isResponse } from "@/lib/session";

const Body = z.object({
  events: z
    .array(
      z.object({
        type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/).max(60),
        props: z.record(z.string(), z.unknown()).default({}),
        path: z.string().max(300).optional(),
        ts: z.string().datetime().optional(),
        session_id: z.string().max(64).optional(),
      }),
    )
    .max(100),
});

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const body = await parseBody(req, Body);
  if (isResponse(body)) return body;
  const now = Date.now();
  const rows = body.events.map((e) => {
    // accept the client's timestamp if it is plausible (offline batches), else server time
    const t = e.ts ? Date.parse(e.ts) : NaN;
    const created = Number.isFinite(t) && Math.abs(now - t) < 86_400_000 ? new Date(t).toISOString() : new Date(now).toISOString();
    return {
      user_id: s.user.id,
      type: e.type,
      props: toJson(e.props),
      path: e.path ?? null,
      session_id: e.session_id ?? null,
      app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      created_at: created,
    };
  });
  if (!rows.length) return NextResponse.json({ ok: true });
  const { error } = await s.supabase.from("events").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n: rows.length });
}
