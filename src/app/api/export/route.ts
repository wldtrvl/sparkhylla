import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { apiSession, isResponse } from "@/lib/session";

const TABLES: Record<string, string> = {
  events: "created_at,type,session_id,path,props",
  llm_calls: "created_at,task,prompt_id,prompt_version,provider,model,variant,input_tokens,output_tokens,cost_usd,latency_ms,ok,error,attempt",
  reviews: "created_at,word_id,rating,mode,answer,auto_correct,elapsed_ms",
  feedback_items: "created_at,conversation_id,lang,rule_key,status,said,correction",
  speech_calls: "created_at,kind,provider,model,lang,units,cost_usd,latency_ms,ok,cached",
};

function csvCell(v: unknown) {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export for analysis in a spreadsheet or notebook. RLS limits rows to self or coached learners. */
export async function GET(req: NextRequest) {
  const s = await apiSession();
  if (isResponse(s)) return s;
  const table = req.nextUrl.searchParams.get("table") ?? "events";
  const uid = req.nextUrl.searchParams.get("u") ?? s.user.id;
  const cols = TABLES[table];
  if (!cols) return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    // the table name comes from TABLES above; the typed client cannot express a table chosen at run time
    const db = s.supabase as unknown as SupabaseClient;
    const { data, error } = await db.from(table).select(cols).eq("user_id", uid).order("created_at").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  const header = cols.split(",");
  const body = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n");
  return new NextResponse(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
