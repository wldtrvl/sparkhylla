import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ textId: z.string().uuid(), page: z.number().int().min(0), finished: z.boolean().optional(), coverage: z.number().min(0).max(1).optional() });

export async function POST(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const { error } = await s.supabase.from("reading_progress").upsert(
    {
      user_id: s.user.id,
      text_id: b.textId,
      page: b.page,
      coverage: b.coverage ?? null,
      updated_at: new Date().toISOString(),
      ...(b.finished ? { finished_at: new Date().toISOString() } : {}),
    },
    { onConflict: "user_id,text_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logEvent(s, b.finished ? "read.finish" : "read.page", { textId: b.textId, page: b.page });
  return NextResponse.json({ ok: true });
}
