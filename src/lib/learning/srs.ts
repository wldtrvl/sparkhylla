/**
 * Spaced repetition with FSRS (ts-fsrs). Cards are stored as JSON in words.fsrs;
 * dates are ISO strings, which ts-fsrs accepts as input.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export type StoredCard = Omit<Card, "due" | "last_review"> & { due: string; last_review?: string | null };

export function newCard(now = new Date()): StoredCard {
  return toStored(createEmptyCard(now));
}

function toStored(c: Card): StoredCard {
  return { ...c, due: c.due.toISOString(), last_review: c.last_review ? c.last_review.toISOString() : null };
}

/** Our three buttons map to FSRS grades: forgot → Again, hard → Hard, remembered → Good. */
export type Answer = "forgot" | "hard" | "good";
export const answerToRating: Record<Answer, Grade> = { forgot: Rating.Again, hard: Rating.Hard, good: Rating.Good };

export function schedule(card: StoredCard | null, answer: Answer, now = new Date()) {
  const current = card ?? newCard(now);
  const { card: next } = scheduler.next(current, now, answerToRating[answer]);
  return { before: current, after: toStored(next), due: next.due, rating: answerToRating[answer] };
}
