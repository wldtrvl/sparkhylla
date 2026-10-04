"use client";
import { useRef, useState } from "react";
import { track } from "./tracker";

/** A real recording of the text (e.g. VOA news): play, back 5 seconds, slower or faster. */
export function AudioBar({ src, textId }: { src: string; textId?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const setSpeed = (r: number) => {
    if (ref.current) ref.current.playbackRate = r;
    setRate(r);
    track("read.audio_rate", { textId, rate: r });
  };
  return (
    <div className="audio-bar">
      <span className="eyebrow">Запись диктора</span>
      <audio
        ref={ref}
        src={src}
        controls
        preload="metadata"
        onPlay={(e) => track("read.audio_play", { textId, at: Math.round(e.currentTarget.currentTime) })}
        onPause={(e) => track("read.audio_pause", { textId, at: Math.round(e.currentTarget.currentTime) })}
        onEnded={() => track("read.audio_end", { textId })}
      />
      <div className="row gap-6">
        <button
          type="button"
          className="btn soft small"
          onClick={() => {
            if (!ref.current) return;
            ref.current.currentTime = Math.max(0, ref.current.currentTime - 5);
            track("read.audio_back", { textId });
          }}
        >
          −5 с
        </button>
        {[0.75, 1, 1.25].map((r) => (
          <button key={r} type="button" className="btn soft small" aria-pressed={rate === r} onClick={() => setSpeed(r)}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
