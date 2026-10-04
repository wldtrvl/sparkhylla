"use client";

/** Recording indicator: elapsed time and a level bar, so she can see the microphone hears her. */
export function RecLevel({ level, seconds }: { level: number; seconds: number }) {
  return (
    <span className="rec-level" role="status" aria-label={`Идёт запись, ${seconds} с`}>
      <span className="num">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>
      <span className="rec-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.max(0.04, level)})` }} />
      </span>
    </span>
  );
}
