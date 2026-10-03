"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { speak, stopAudio, useRecorder } from "./audio";
import { track } from "./tracker";

interface Props {
  scenario: { id: string; title: string; lang: "no" | "en"; level: string; persona: string; goals: { id: string; ru: string }[] };
  serverStt: boolean;
}
type Line = { role: "tutor" | "learner"; text: string; notes?: number };

export function Conversation({ scenario, serverStt }: Props) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "start" | "turn" | "help" | "finish">("start");
  const [err, setErr] = useState("");
  const [help, setHelp] = useState<{ phrase: string; translation: string } | null>(null);
  const [typed, setTyped] = useState("");
  const rec = useRecorder();
  const started = useRef(false);
  const langAttr = scenario.lang === "no" ? "nb" : "en";
  const who = scenario.persona.split(",")[0];

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await fetch("/api/talk/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: scenario.id }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setConvId(d.conversationId);
        setLines([{ role: "tutor", text: d.reply }]);
        speak(d.reply, scenario.lang, { url: d.audioUrl });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Не удалось начать разговор.");
      } finally {
        setBusy("");
      }
    })();
  }, [scenario.id, scenario.lang]);

  const sendTurn = useCallback(
    async (payload: { audio?: Blob; durationMs?: number; text?: string }) => {
      if (!convId) return;
      setBusy("turn");
      setErr("");
      setHelp(null);
      const fd = new FormData();
      fd.append("conversationId", convId);
      if (payload.audio) {
        fd.append("audio", payload.audio, "speech");
        fd.append("durationMs", String(payload.durationMs ?? 0));
      }
      if (payload.text) fd.append("text", payload.text);
      try {
        const r = await fetch("/api/talk/turn", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setLines((l) => [...l, { role: "learner", text: d.learnerText, notes: d.noteCount }, { role: "tutor", text: d.reply }]);
        setGoals(d.goalsDone);
        speak(d.reply, scenario.lang, { url: d.audioUrl });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusy("");
      }
    },
    [convId, scenario.lang],
  );

  const toggleMic = useCallback(async () => {
    if (busy) return;
    if (rec.recording) {
      const r = await rec.stop();
      if (!r) return setErr("Я ничего не услышала. Нажмите и скажите ещё раз.");
      sendTurn({ audio: r.blob, durationMs: r.durationMs });
    } else {
      stopAudio();
      await rec.start();
    }
  }, [busy, rec, sendTurn]);

  // Desktop: hold Space to talk (not while typing in a field)
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isField(e.target) && !rec.recording && !busy && serverStt) {
        e.preventDefault();
        stopAudio();
        rec.start();
      }
    };
    const up = async (e: KeyboardEvent) => {
      if (e.code === "Space" && rec.recording && !isField(e.target)) {
        e.preventDefault();
        const r = await rec.stop();
        if (r) sendTurn({ audio: r.blob, durationMs: r.durationMs });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [rec, busy, serverStt, sendTurn]);

  async function askHelp() {
    if (!convId) return;
    setBusy("help");
    try {
      const r = await fetch("/api/talk/help", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: convId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setHelp({ phrase: d.phrase, translation: d.translation });
      speak(d.phrase, scenario.lang, { url: d.audioUrl, rate: 0.8 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  }

  async function finish() {
    if (!convId) return router.push("/talk");
    stopAudio();
    setBusy("finish");
    try {
      const r = await fetch("/api/talk/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: convId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push(d.empty ? "/talk" : `/talk/review/${convId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setBusy("");
    }
  }

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Ролевая игра · {scenario.level}</span>
          <h1 className="display" style={{ fontSize: "clamp(30px,3.4vw,42px)" }}>
            {scenario.title}
          </h1>
        </div>
        <button type="button" className="btn ghost" style={{ marginLeft: "auto" }} onClick={finish} disabled={busy === "finish"}>
          {busy === "finish" ? "Готовлю разбор…" : "Закончить и разобрать"}
        </button>
      </div>

      <div className="split">
        <section className="wide card" style={{ gap: 14, padding: 24 }}>
          {lines.map((l, i) => (
            <div key={i} className={`bubble ${l.role}`} lang={langAttr}>
              {l.role === "tutor" && <div className="who">{who}</div>}
              {l.text}
              {l.role === "tutor" && (
                <div>
                  <button type="button" className="btn soft small" style={{ marginTop: 8 }} onClick={() => speak(l.text, scenario.lang, { rate: 0.75 })}>
                    Повторить медленнее
                  </button>
                </div>
              )}
              {l.role === "learner" && !!l.notes && (
                <div className="who" style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brass)" }} />
                  заметка — разберём после разговора
                </div>
              )}
            </div>
          ))}
          {busy === "start" && <p className="muted">Собеседник подключается…</p>}
          {busy === "turn" && <p className="muted">Слушаю и отвечаю…</p>}
          {err && <p className="error">{err}</p>}
          {rec.error && <p className="error">{rec.error}</p>}

          <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 18, gap: 18 }}>
            {serverStt ? (
              <>
                <button type="button" className={`mic${rec.recording ? " rec" : ""}`} onClick={toggleMic} disabled={!!busy || !convId} aria-label={rec.recording ? "Закончить фразу" : "Говорить"}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
                <div className="stack" style={{ gap: 4 }}>
                  <b>{rec.recording ? "Говорите… нажмите ещё раз, когда закончите" : "Нажмите на микрофон и говорите"}</b>
                  <span className="small muted">
                    Или удерживайте <kbd>Пробел</kbd>, пока говорите
                  </span>
                </div>
              </>
            ) : (
              <span className="small muted">Голос не настроен на сервере — можно писать.</span>
            )}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) {
                sendTurn({ text: typed.trim() });
                setTyped("");
              }
            }}
          >
            <label htmlFor="typed" className="small muted" style={{ width: "100%" }}>
              …или напишите
            </label>
            <input id="typed" className="input" style={{ flex: 1, minWidth: 200 }} lang={langAttr} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn soft" type="submit" disabled={!!busy || !typed.trim()}>
              Отправить
            </button>
          </form>
        </section>

        <aside className="side">
          <div className="card">
            <span className="eyebrow">Ваши цели</span>
            {scenario.goals.map((g) => (
              <div key={g.id} className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                <span
                  aria-hidden="true"
                  style={{ width: 20, height: 20, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 12, color: "var(--paper)", background: goals.includes(g.id) ? "var(--ok)" : "transparent", border: goals.includes(g.id) ? 0 : "2px solid #9b8b74" }}
                >
                  {goals.includes(g.id) ? "✓" : ""}
                </span>
                <span>{g.ru}</span>
                <span className="sr-only" style={{ position: "absolute", left: -9999 }}>
                  {goals.includes(g.id) ? "выполнено" : "ещё нет"}
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <span className="eyebrow">Если не знаете, как сказать</span>
            <button type="button" className="btn ghost" onClick={() => (track("talk.help_click"), askHelp())} disabled={!!busy || !convId}>
              {busy === "help" ? "Думаю…" : "Помоги сказать"}
            </button>
            {help && (
              <div className="stack" style={{ gap: 4 }}>
                <b lang={langAttr} style={{ fontFamily: "var(--f-read)", fontSize: 18 }}>
                  {help.phrase}
                </b>
                <span className="small muted">{help.translation}</span>
                <span className="small">Повторите эту фразу вслух.</span>
              </div>
            )}
            <span className="small muted">Можно сказать фразу по-русски — собеседник подскажет, как это звучит, и вы повторите.</span>
          </div>
          <Link href="/talk" className="small muted">
            ← Все разговоры
          </Link>
        </aside>
      </div>
    </>
  );
}
