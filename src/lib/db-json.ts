/**
 * Shapes of jsonb and check-constrained columns. The generated database types call them Json / string;
 * the app writes them itself (validated by zod where they come in), so these helpers name their shapes.
 */
import type { Lang } from "@/lib/learning/coverage";
import type { Database, Json } from "@/lib/supabase/database.types";

export type Tables = Database["public"]["Tables"];
export type Goal = { id: string; ru: string };
export type TurnNote = { said: string; issue: string; correction: string; rule_key: string };
export type Levels = Record<Lang, { reading: string; speaking: string; writing: string }>;

export const asLang = (s: string): Lang => (s === "en" ? "en" : "no");
export const asGoals = (j: Json): Goal[] => (Array.isArray(j) ? (j as unknown as Goal[]) : []);
export const asNotes = (j: Json | null): TurnNote[] => (Array.isArray(j) ? (j as unknown as TurnNote[]) : []);
export const asLevels = (j: Json): Levels => (j && typeof j === "object" && !Array.isArray(j) ? (j as unknown as Levels) : ({} as Levels));
export const asRecord = (j: Json | null): Record<string, unknown> => (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {});
/** Any app object stored in a jsonb column (event props, FSRS state, prompts). */
export const toJson = (x: unknown): NonNullable<Json> => x as NonNullable<Json>;
