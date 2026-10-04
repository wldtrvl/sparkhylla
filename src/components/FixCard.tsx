"use client";
import { useState } from "react";
import { speak } from "./audio";

export interface FixItem {
  id: number;
  said: string;
  hint: string;
  correction: string;
  rule_label: string | null;
  status: "open" | "self_fixed" | "revealed";
}

/** Hint first, answer on request — she gets the chance to find the fix herself. */
export function FixCard({ item, lang }: { item: FixItem; lang: "no" | "en" }) {
  const [status, setStatus] = useState(item.status);
  const [failed, setFailed] = useState(false);
  const langAttr = lang === "no" ? "nb" : "en";
  async function mark(s: "self_fixed" | "revealed") {
    setStatus(s);
    setFailed(false);
    const r = await fetch("/api/feedback", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status: s }) }).catch(() => null);
    if (!r?.ok) {
      setStatus("open");
      setFailed(true);
    }
  }
  return (
    <div className="card">
      {item.rule_label && <span className="chip brass" style={{ alignSelf: "flex-start" }}>{item.rule_label}</span>}
      <span className="small muted">Вы сказали</span>
      <span lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 19 }}>
        {item.said}
      </span>
      <span>
        <b>Подсказка:</b> {item.hint}
      </span>
      {failed && <span className="error">Не сохранилось — проверьте интернет и нажмите ещё раз.</span>}
      {status === "open" ? (
        <div className="row">
          <button type="button" className="btn" onClick={() => mark("self_fixed")}>
            Я поняла, как правильно
          </button>
          <button type="button" className="btn ghost" onClick={() => mark("revealed")}>
            Показать ответ
          </button>
        </div>
      ) : (
        <div className="row" style={{ background: "var(--ok-soft)", borderRadius: 12, padding: "10px 14px" }}>
          <span lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 19, color: "var(--ok)" }}>
            {item.correction}
          </span>
          <button type="button" className="btn soft small" style={{ marginLeft: "auto" }} onClick={() => speak(item.correction, lang, { rate: 0.85 })}>
            Слушать и повторить
          </button>
        </div>
      )}
    </div>
  );
}
