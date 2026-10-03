"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: "100%", maxWidth: 440, padding: 32, gap: 18 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="display">Språkhylla</span>
          <span className="muted">домашняя языковая библиотека</span>
        </div>
        {state === "sent" ? (
          <p>
            Мы отправили ссылку на <b>{email}</b>. Откройте письмо и нажмите на ссылку — пароль не нужен.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">Ваш e-mail</label>
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Отправляю…" : "Получить ссылку для входа"}
            </button>
            {state === "error" && <p className="error">Не получилось отправить письмо: {error}</p>}
          </>
        )}
      </form>
    </main>
  );
}
