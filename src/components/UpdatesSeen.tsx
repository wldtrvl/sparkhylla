"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { track } from "./tracker";

/** Opening «Что нового» marks everything up to the newest entry as seen, then refreshes the menu badge. */
export function UpdatesSeen({ latest, unseen }: { latest: string | null; unseen: number }) {
  const router = useRouter();
  useEffect(() => {
    track("updates.view", { unseen });
    if (!latest || !unseen) return;
    fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: { updates_seen_at: latest } }) })
      .then((r) => r.ok && router.refresh())
      .catch(() => {});
  }, [latest, unseen, router]);
  return null;
}

/** Desk banner while there is something she has not opened yet. */
export function UpdateBanner({ count, title }: { count: number; title: string }) {
  return (
    <Link href="/updates" className="update-banner" onClick={() => track("updates.banner_open", { count })}>
      <span className="chip new-chip">{count > 1 ? `новое: ${count}` : "новое"}</span>
      <span>
        <b>{title}</b>
        {count > 1 ? " и не только" : ""}
      </span>
      <span className="ml-auto strong">Что нового →</span>
    </Link>
  );
}

export function UpdateLink({ id, href, children }: { id: number; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="btn soft small" onClick={() => track("updates.open", { id, href })}>
      {children}
    </Link>
  );
}
