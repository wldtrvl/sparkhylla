"use client";
import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/components/tracker";

/** Calm fallback when a page fails to load (usually the connection or the database). */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    track("app.error", { digest: error.digest ?? null, message: error.message.slice(0, 200) });
  }, [error]);

  return (
    <div className="card" style={{ maxWidth: 560, padding: 32, gap: 16 }} role="alert">
      <span className="eyebrow">Не получилось открыть страницу</span>
      <h1 className="display" style={{ fontSize: 36 }}>
        Что-то пошло не так
      </h1>
      <p className="muted">Скорее всего, пропала связь. Ваши слова и прогресс сохранены — попробуйте ещё раз.</p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            track("app.error_retry", { digest: error.digest ?? null });
            retry();
          }}
        >
          Попробовать ещё раз
        </button>
        <Link className="btn ghost" href="/">
          На мой стол
        </Link>
      </div>
    </div>
  );
}
