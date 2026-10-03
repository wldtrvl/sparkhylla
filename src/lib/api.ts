import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { NoRouteError } from "@/lib/ai/execute";

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Пустой или неверный запрос." }, { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) return NextResponse.json({ error: "Неверные данные запроса.", details: r.error.issues.slice(0, 5) }, { status: 400 });
  return r.data;
}

/** Turns an AI/speech failure into a message the learner can act on. */
export function aiFailure(e: unknown) {
  console.error(e);
  if (e instanceof NoRouteError) return NextResponse.json({ error: "AI не настроен: добавьте ключ API в настройках сервера." }, { status: 503 });
  return NextResponse.json({ error: "AI сейчас не ответил. Попробуйте ещё раз через минуту." }, { status: 502 });
}
