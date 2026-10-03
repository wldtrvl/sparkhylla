"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function PageNav({ textId, page, total, coverage }: { textId: string; page: number; total: number; coverage: number }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ textId, page, coverage }) }).catch(() => {});
  }, [textId, page, coverage]);

  const go = (p: number) => {
    router.push(`/read/${textId}?page=${p}`);
    window.scrollTo({ top: 0 });
  };

  async function finish() {
    await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ textId, page, finished: true, coverage }) });
    setDone(true);
  }

  return (
    <div className="row num" style={{ borderTop: "1px solid var(--line)", paddingTop: 14, justifyContent: "space-between" }}>
      <button type="button" className="btn soft small" disabled={page === 0} onClick={() => go(page - 1)}>
        ← Назад
      </button>
      <span className="small muted">
        Страница {page + 1} из {total}
      </span>
      {page < total - 1 ? (
        <button type="button" className="btn small" onClick={() => go(page + 1)}>
          Дальше →
        </button>
      ) : (
        <button type="button" className="btn small" disabled={done} onClick={finish}>
          {done ? "Прочитано. Молодец!" : "Я дочитала"}
        </button>
      )}
    </div>
  );
}
