import { NextResponse, type NextRequest } from "next/server";
import { finishPack, getPack } from "@/lib/packs-data";
import { apiSession, isResponse, logEvent } from "@/lib/session";

/**
 * Pack actions: `rule` marks the rule step done (the only step that leaves no other trace), `finish` works out
 * and saves the results, `cancel` drops the pack (her words and conversations stay).
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/packs/[id]/[action]">) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const { id, action } = await ctx.params;
  const pack = await getPack(s, id);
  if (!pack) return NextResponse.json({ error: "Набор не найден." }, { status: 404 });
  if (pack.status !== "active") return NextResponse.json({ error: "Этот набор уже завершён." }, { status: 409 });
  const now = Date.now();
  if (action === "rule") {
    const { error } = await s.supabase.from("packs").update({ progress: { ...pack.progress, rule: new Date(now).toISOString() } }).eq("id", id).eq("user_id", s.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logEvent(s, "pack.step", { packId: id, step: "rule" });
    return NextResponse.json({ ok: true });
  }
  if (action === "finish") {
    try {
      return NextResponse.json({ results: await finishPack(s, pack, now) });
    } catch (e) {
      console.error("pack: finish failed", e);
      return NextResponse.json({ error: "Не получилось подвести итог. Попробуйте ещё раз." }, { status: 500 });
    }
  }
  if (action === "cancel") {
    const { error } = await s.supabase.from("packs").update({ status: "cancelled" }).eq("id", id).eq("user_id", s.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logEvent(s, "pack.cancel", { packId: id, theme: pack.theme });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Неизвестное действие." }, { status: 400 });
}
