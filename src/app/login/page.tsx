"use client";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { track } from "@/components/tracker";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in by email link that works in any browser.
 *
 * @supabase/ssr always uses PKCE, where the link only works in the browser that asked for it.
 * On a phone the mail app often opens links elsewhere, so the link failed. The request is sent
 * with the implicit flow instead: Supabase returns the session in the URL fragment (never sent
 * to a server), this page stores it in the cookie-based client and clears the fragment.
 * Works with Supabase's default email template, so no custom template (Pro plan) is needed.
 */
function sendLink(email: string) {
  const implicit = createPlainClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // existing accounts only: sign-ups are closed (migration 0012 also blocks them in the database)
  return implicit.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/login`, shouldCreateUser: false } });
}

function LoginForm() {
  const router = useRouter();
  const errorParam = useSearchParams().get("error");
  const linkFailed = errorParam === "link";
  const devFailed = errorParam === "dev";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "signing_in" | "error">("idle");
  const [error, setError] = useState("");

  // Landing from the email link: #access_token=…&refresh_token=… or #error_code=otp_expired
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (!hash.has("access_token") && !hash.has("error_code")) return;
    history.replaceState(null, "", window.location.pathname);
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    Promise.resolve().then(async () => {
      if (!access_token || !refresh_token) {
        setError(hash.get("error_code") === "otp_expired" ? "Ссылка уже использована или устарела. Запросите новое письмо." : "Ссылка не сработала. Запросите новое письмо.");
        setState("error");
        return;
      }
      setState("signing_in");
      const { error } = await createClient().auth.setSession({ access_token, refresh_token });
      if (error) {
        setError("Не получилось войти по ссылке. Запросите новое письмо.");
        setState("error");
        return;
      }
      track("auth.sign_in", { method: "link" });
      router.replace("/");
      router.refresh();
    });
  }, [router]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const { error } = await sendLink(email.trim());
    if (error) {
      const closed = /signups? not allowed|otp_disabled|sign-ups are closed/i.test(`${error.code ?? ""} ${error.message}`);
      track("auth.link_failed", { closed });
      setError(closed ? "Этот адрес здесь не зарегистрирован. Приложение семейное: войти можно только с адресом, для которого уже есть вход." : `Не получилось отправить письмо: ${error.message}`);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="center-screen">
      <div className="card" style={{ width: "100%", maxWidth: 440, padding: 32, gap: 18 }}>
        <div className="stack gap-4">
          <span className="display">Språkhylla</span>
          <span className="muted">домашняя языковая библиотека</span>
        </div>
        {linkFailed && state === "idle" && <p className="notice">Ссылка из письма уже использована или устарела. Запросите новое письмо.</p>}
        {state === "signing_in" ? (
          <p>Вхожу…</p>
        ) : state === "sent" ? (
          <div className="stack gap-14">
            <p>
              Мы отправили ссылку на <b>{email}</b>. Откройте письмо и нажмите на ссылку — пароль не нужен. Ссылка действует один раз.
            </p>
            <button type="button" className="btn soft small" onClick={() => setState("idle")}>
              Другой e-mail или новое письмо
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="stack gap-14">
            <div className="field">
              <label htmlFor="email">Ваш e-mail</label>
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Отправляю…" : "Получить ссылку для входа"}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
        {process.env.NODE_ENV === "development" && (
          <form method="post" action="/auth/dev" className="stack" style={{ gap: 8, borderTop: "1px dashed var(--line)", paddingTop: 16 }}>
            {devFailed && <p className="error">Вход для разработки не сработал. Проверьте DEV_LOGIN_EMAIL в .env.local и лог сервера.</p>}
            <button className="btn soft small" type="submit">
              Войти без письма (только локально)
            </button>
            <span className="small muted">Входит под DEV_LOGIN_EMAIL из .env.local. В продакшене этой кнопки нет.</span>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
