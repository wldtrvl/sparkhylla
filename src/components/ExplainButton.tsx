"use client";
import { useState } from "react";

export function ExplainButton({ topicKey }: { topicKey: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: topicKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setText(d.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!text && (
        <button type="button" className="btn ghost small" onClick={go} disabled={busy} style={{ alignSelf: "flex-start" }}>
          {busy ? "Готовлю объяснение…" : "Объяснить подробнее и дать упражнение"}
        </button>
      )}
      {err && <span className="error">{err}</span>}
      {text && <div style={{ whiteSpace: "pre-wrap", background: "var(--paper-2)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.6 }}>{text}</div>}
    </>
  );
}
