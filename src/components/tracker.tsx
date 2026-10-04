"use client";
/**
 * Client event log. Every meaningful action calls track(type, props).
 * Events are batched and sent every 5 s, and on tab hide via sendBeacon.
 * A heartbeat every 30 s while the tab is visible and the learner was active
 * in the last 2 minutes gives honest "minutes studied".
 */
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

type Ev = { type: string; props: Record<string, unknown>; path: string; ts: string; session_id: string };

const queue: Ev[] = [];
let sessionId = "";
let lastActivity = Date.now();

function sid() {
  if (!sessionId) {
    try {
      sessionId = sessionStorage.getItem("sh_sid") ?? "";
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem("sh_sid", sessionId);
      }
    } catch {
      sessionId = Math.random().toString(36).slice(2);
    }
  }
  return sessionId;
}

export function track(type: string, props: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  queue.push({ type, props, path: location.pathname, ts: new Date().toISOString(), session_id: sid() });
  if (queue.length >= 40) flush();
}

function flush(useBeacon = false) {
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ events: batch });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {
      queue.unshift(...batch); // retry next tick
    });
  }
}

/** Real page speed as she experiences it (stable reference, so each metric is reported once). */
function reportVital(m: { name: string; value: number; rating?: string; navigationType?: string }) {
  if (!["TTFB", "FCP", "LCP", "INP", "CLS"].includes(m.name)) return;
  track("perf.vital", { name: m.name, value: m.name === "CLS" ? Math.round(m.value * 1000) / 1000 : Math.round(m.value), rating: m.rating, nav: m.navigationType });
}

export function Tracker() {
  const path = usePathname();
  useReportWebVitals(reportVital);

  useEffect(() => {
    track("page.view", { path });
  }, [path]);

  useEffect(() => {
    const mark = () => (lastActivity = Date.now());
    const evs = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const flushTimer = setInterval(() => flush(), 5000);
    const beat = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity < 120_000) track("activity.heartbeat");
    }, 30_000);
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(flushTimer);
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
