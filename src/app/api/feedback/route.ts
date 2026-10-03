import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { apiSession, isResponse, logEvent } from "@/lib/session";

const Body = z.object({ id: z.number().int(), status: z.enum(["self_fixed", "revealed"]) });

/** She either fixed the mistake herself after the hint, or asked to see the answer. Both are logged. */
export async function PATCH(req: Request) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const b = await parseBody(req, Body);
  if (isResponse(b)) return b;
  const { error } = await s.supabase.from("feedback_items").update({ status: b.status }).eq("id", b.id).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logEvent(s, `feedback.${b.status}`, { id: b.id });
  return NextResponse.json({ ok: true });
}
