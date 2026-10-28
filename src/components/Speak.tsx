"use client";
import { speak } from "./audio";
import { track } from "./tracker";

/** A small ▶ button that reads a sentence aloud. */
export function Speak({ text, lang }: { text: string; lang: "no" | "en" }) {
  return (
    <button type="button" className="para-listen speak-inline" aria-label={`Слушать: ${text}`} onClick={() => (track("grammar.listen", { text: text.slice(0, 60) }), speak(text, lang, { rate: 0.85 }))}>
      ▶
    </button>
  );
}
