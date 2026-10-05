"use client";
/**
 * A video with its transcript: the video plays in its source's own player (NDLA's Brightcove player, or a plain
 * <video> for public-domain MP4s), the transcript is the normal reader (word lookup, «Перевод рядом»), the
 * paragraph being spoken is highlighted, and every paragraph has a button that jumps the video there.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { activeParagraph, type VideoInfo } from "@/lib/video";
import { stopAudio } from "./audio";
import { Reader } from "./Reader";
import { track } from "./tracker";

interface Controls {
  seek(t: number): void;
}

interface VjsPlayer {
  currentTime(t?: number): number;
  play(): Promise<void> | void;
  on(ev: string, fn: () => void): void;
  ready(fn: () => void): void;
  dispose(): void;
}
declare global {
  interface Window {
    bc?: (el: Element) => VjsPlayer;
    videojs?: { getPlayer(el: Element): VjsPlayer | undefined };
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

function usePlayerEvents(textId: string, onTime: (t: number) => void) {
  const last = useRef(0);
  return {
    time: (t: number) => {
      last.current = t;
      onTime(t);
    },
    play: () => track("video.play", { textId, at: Math.round(last.current) }),
    pause: () => track("video.pause", { textId, at: Math.round(last.current) }),
    ended: () => track("video.ended", { textId }),
  };
}

function BrightcovePlayer({ v, textId, onTime, controlsRef }: { v: Extract<VideoInfo, { provider: "brightcove" }>; textId: string; onTime: (t: number) => void; controlsRef: React.RefObject<Controls | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const ev = usePlayerEvents(textId, onTime);
  const evRef = useRef(ev);
  useEffect(() => {
    evRef.current = ev;
  });

  useEffect(() => {
    const el = document.createElement("video-js");
    el.setAttribute("data-account", v.account);
    el.setAttribute("data-player", v.player);
    el.setAttribute("data-embed", "default");
    el.setAttribute("data-video-id", v.id);
    el.setAttribute("controls", "");
    el.setAttribute("playsinline", "");
    el.className = "video-js vjs-fluid";
    box.current?.appendChild(el);
    let player: VjsPlayer | undefined;
    let gone = false;
    loadScript(`https://players.brightcove.net/${v.account}/${v.player}_default/index.min.js`)
      .then(() => {
        if (gone) return;
        player = window.videojs?.getPlayer(el) ?? window.bc?.(el);
        if (!player) throw new Error("player did not start");
        const p = player;
        p.ready(() => {
          p.on("timeupdate", () => evRef.current.time(p.currentTime()));
          p.on("play", () => evRef.current.play());
          p.on("pause", () => evRef.current.pause());
          p.on("ended", () => evRef.current.ended());
        });
        controlsRef.current = {
          seek: (t) => {
            p.currentTime(t);
            void p.play();
          },
        };
      })
      .catch(() => {
        setFailed(true);
        track("video.failed", { textId, provider: "brightcove" });
      });
    return () => {
      gone = true;
      controlsRef.current = null;
      player?.dispose();
      el.remove();
    };
  }, [v.account, v.player, v.id, textId, controlsRef]);

  return (
    <>
      <div ref={box} className="video-box" />
      {failed && <p className="small error">Видео не загрузилось. Обновите страницу или откройте источник ниже.</p>}
    </>
  );
}

function FilePlayer({ v, textId, onTime, controlsRef }: { v: Extract<VideoInfo, { provider: "mp4" }>; textId: string; onTime: (t: number) => void; controlsRef: React.RefObject<Controls | null> }) {
  const ref = useRef<HTMLVideoElement>(null);
  const ev = usePlayerEvents(textId, onTime);
  useEffect(() => {
    controlsRef.current = {
      seek: (t) => {
        if (!ref.current) return;
        ref.current.currentTime = t;
        void ref.current.play();
      },
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef]);
  return (
    <div className="video-box">
      <video ref={ref} src={v.src} controls playsInline preload="metadata" onTimeUpdate={(e) => ev.time(e.currentTarget.currentTime)} onPlay={ev.play} onPause={ev.pause} onEnded={ev.ended} />
    </div>
  );
}

export function VideoReader(props: { video: VideoInfo; lang: "no" | "en"; textId: string; source: string; paragraphs: string[]; unknown: string[]; learning: string[] }) {
  const controlsRef = useRef<Controls | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const times = props.video.paras && props.video.paras.length === props.paragraphs.length ? props.video.paras : null;
  const onTime = useCallback((t: number) => setActive(times ? activeParagraph(times, t) : null), [times]);

  const onSeek = (i: number) => {
    if (!times) return;
    stopAudio(); // a word being read aloud should not talk over the video
    track("video.seek_paragraph", { textId: props.textId, paragraph: i, at: Math.round(times[i][0]) });
    controlsRef.current?.seek(Math.max(0, times[i][0] - 0.3));
  };

  return (
    <>
      <div className="video-sticky">
        {props.video.provider === "brightcove" ? (
          <BrightcovePlayer v={props.video} textId={props.textId} onTime={onTime} controlsRef={controlsRef} />
        ) : (
          <FilePlayer v={props.video} textId={props.textId} onTime={onTime} controlsRef={controlsRef} />
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {times ? "Текст ниже — это то, что говорят в видео. Сейчас звучит выделенный абзац; кнопка со временем перематывает видео к нему. " : "Текст ниже — то, что говорят в видео. "}
        Нажмите на слово — появится перевод.
      </p>
      <Reader
        lang={props.lang}
        textId={props.textId}
        source={props.source}
        paragraphs={props.paragraphs}
        unknown={props.unknown}
        learning={props.learning}
        video={{ starts: times ? times.map((x) => x[0]) : [], active, onSeek }}
      />
    </>
  );
}
