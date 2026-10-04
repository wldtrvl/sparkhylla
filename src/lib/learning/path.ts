/**
 * The learning path: for her current level in a language, five tracks with targets, the next step,
 * and whether she is ready for the next level. Pure, so the page, the desk and tests share it.
 * Targets are cumulative (all her saved words, finished texts, finished conversations so far).
 */
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

const TARGETS: Record<Level, { words: number; texts: number; talks: number; days: number }> = {
  A1: { words: 150, texts: 3, talks: 3, days: 6 },
  A2: { words: 400, texts: 8, talks: 6, days: 8 },
  B1: { words: 900, texts: 15, talks: 10, days: 9 },
  B2: { words: 1800, texts: 25, talks: 15, days: 10 },
  C1: { words: 3000, texts: 40, talks: 20, days: 10 },
  C2: { words: 5000, texts: 60, talks: 25, days: 10 },
};

export interface PathInput {
  level: string; // her reading level in this language, e.g. "B1"
  words: number; // saved words (learning + known)
  due: number; // words waiting for review today
  textsFinished: number;
  reading: { id: string; title: string } | null; // a book she has started
  suggested: { id: string; title: string } | null; // the best-fitting book she has not started
  talks: number; // finished conversations
  scenario: { id: string; title: string } | null;
  grammarDone: string[]; // topic keys she has studied (grammar.explain)
  grammarTopics: { key: string; title: string; level: string }[]; // topics in this language
  activeDays: number; // days with at least a minute of study in the last 14
}

export interface Track {
  key: "words" | "reading" | "talk" | "grammar" | "days";
  title: string;
  done: number;
  target: number;
  hint: string; // what to do, in Russian
  href: string;
}

export interface PathState {
  level: Level;
  next: Level | null;
  tracks: Track[];
  progress: number; // 0..1, average of the tracks
  ready: boolean; // every track complete: offer the next level
  step: { title: string; href: string; why: string };
}

export function normalizeLevel(l: string): Level {
  const x = l.replace("+", "").toUpperCase();
  return (LEVELS as readonly string[]).includes(x) ? (x as Level) : "B1";
}

export function computePath(i: PathInput): PathState {
  const level = normalizeLevel(i.level);
  const next = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
  const t = TARGETS[level];
  const levelTopics = i.grammarTopics.filter((g) => LEVELS.indexOf(normalizeLevel(g.level)) <= LEVELS.indexOf(level));
  const topicsDone = levelTopics.filter((g) => i.grammarDone.includes(g.key));
  const nextTopic = levelTopics.find((g) => !i.grammarDone.includes(g.key));
  const tracks: Track[] = [
    { key: "words", title: "Слова", done: i.words, target: t.words, hint: "Сохраняйте новые слова при чтении и повторяйте их", href: "/words" },
    { key: "reading", title: "Чтение", done: i.textsFinished, target: t.texts, hint: "Дочитывайте тексты до конца", href: i.reading ? `/read/${i.reading.id}` : "/library" },
    { key: "talk", title: "Разговор", done: i.talks, target: t.talks, hint: "Завершайте ролевые разговоры", href: i.scenario ? `/talk/${i.scenario.id}` : "/talk" },
    {
      key: "grammar",
      title: "Грамматика",
      done: topicsDone.length,
      target: Math.max(1, levelTopics.length),
      hint: nextTopic ? `Тема: ${nextTopic.title}` : "Все темы уровня пройдены",
      href: nextTopic ? `/grammar#${nextTopic.key}` : "/grammar",
    },
    { key: "days", title: "Регулярность", done: i.activeDays, target: t.days, hint: "Занимайтесь хотя бы 10 минут в день", href: "/" },
  ];
  const progress = tracks.reduce((s, x) => s + Math.min(1, x.done / x.target), 0) / tracks.length;
  const ready = !!next && tracks.every((x) => x.done >= x.target);

  // one clear next step: what is due first, then the weakest track
  let step: PathState["step"];
  if (i.due > 0) step = { title: `Повторить слова: ${i.due}`, href: "/words", why: "Повторение в срок закрепляет слова лучше всего." };
  else if (i.reading) step = { title: `Продолжить «${i.reading.title}»`, href: `/read/${i.reading.id}`, why: "Начатую книгу легче дочитать, пока сюжет свежий." };
  else {
    const weakest = [...tracks].filter((x) => x.key !== "days").sort((a, b) => a.done / a.target - b.done / b.target)[0];
    if (weakest.key === "talk" && i.scenario) step = { title: `Разговор: ${i.scenario.title}`, href: `/talk/${i.scenario.id}`, why: "Разговоров пока меньше всего." };
    else if (weakest.key === "grammar" && nextTopic) step = { title: `Грамматика: ${nextTopic.title}`, href: `/grammar#${nextTopic.key}`, why: "Эта тема входит в ваш уровень." };
    else if (i.suggested) step = { title: `Начать «${i.suggested.title}»`, href: `/read/${i.suggested.id}`, why: "Эта книга лучше всего подходит по словам." };
    else step = { title: "Открыть библиотеку", href: "/library", why: "Выберите текст по силам." };
  }
  return { level, next, tracks, progress, ready, step };
}
