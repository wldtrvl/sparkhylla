"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "./tracker";

export function LevelUpButton({ lang, to }: { lang: "no" | "en"; to: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="row gap-8">
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          track("path.level_up_click", { lang, to });
          const r = await fetch("/api/path/level-up", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang }) }).catch(() => null);
          setBusy(false);
          if (!r?.ok) return setErr("Не получилось. Попробуйте ещё раз.");
          router.refresh();
        }}
      >
        Перейти на {to}
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
