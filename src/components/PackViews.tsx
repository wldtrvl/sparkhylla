/** Server-rendered parts of «Набор дня»: the step list and the result card (used on the desk, the pack page and «Мои наборы»). */
import Link from "next/link";
import { STEP_LABEL, themeOf } from "@/lib/learning/packs";
import type { PackResults, PackRow, StepState } from "@/lib/packs-data";

export function PackStepList({ steps }: { steps: StepState[] }) {
  return (
    <ol className="pack-steps">
      {steps.map((st) => (
        <li key={st.kind} className={st.done ? "done" : undefined}>
          <span className="pack-check" aria-hidden="true">
            {st.done ? "✓" : ""}
          </span>
          <span>
            <b>{STEP_LABEL[st.kind]}</b>
            {st.detail && <span className="small muted"> · {st.detail}</span>}
          </span>
          <span className="sr-only">{st.done ? "сделано" : "ещё не сделано"}</span>
        </li>
      ))}
    </ol>
  );
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function PackResultCard({ pack, results, compact }: { pack: PackRow; results: PackResults; compact?: boolean }) {
  const theme = themeOf(pack.theme);
  const learnt = results.collected.length + results.keyKnown + results.keyLearning;
  return (
    <div className="pack-result">
      <div className="pack-stats">
        <div>
          <b className="num">{results.minutes}</b>
          <span>мин</span>
        </div>
        <div>
          <b className="num">{results.collected.length}</b>
          <span>слов собрано</span>
        </div>
        <div>
          <b className="num">{results.said.length}</b>
          <span>сказано вслух</span>
        </div>
        <div>
          <b className="num">{results.reviews}</b>
          <span>повторений</span>
        </div>
      </div>
      {!compact && (
        <div className="stack" style={{ gap: 10 }}>
          {results.collected.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Собрали в этом наборе</span>
              <div className="chips">
                {results.collected.map((w) => (
                  <span key={w.term} className={`wm-chip st-${w.status === "known" ? "known" : w.status === "learning" ? "learning" : "new"}`} title={w.translation ?? ""}>
                    {w.term}
                  </span>
                ))}
              </div>
            </div>
          )}
          {results.said.length > 0 && (
            <p style={{ margin: 0 }}>
              <b>Сказали в разговоре:</b> {results.said.join(", ")} — эти слова уже стали вашими.
            </p>
          )}
          <ul className="stack" style={{ gap: 4, margin: 0, paddingLeft: 18 }}>
            {results.watched && <li>Видео досмотрено.</li>}
            {(results.keyKnown > 0 || results.keyLearning > 0) && (
              <li>
                Слова набора: знаю {results.keyKnown}, учу {results.keyLearning}.
              </li>
            )}
            {results.goals && (
              <li>
                Разговор: целей {results.goals.done} из {results.goals.total}
                {results.selfFixed ? `, ошибок исправили сами: ${results.selfFixed}` : ""}.
              </li>
            )}
            {results.next && results.next.after != null && results.next.before != null && results.next.after > results.next.before && (
              <li>
                Следующее видео «{results.next.title}»: знакомых слов {pct(results.next.before)} → <b>{pct(results.next.after)}</b>.
              </li>
            )}
          </ul>
        </div>
      )}
      {compact && learnt > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          {theme?.title ?? pack.theme} · <Link href={`/pack/${pack.id}`}>итог набора</Link>
        </p>
      )}
    </div>
  );
}
