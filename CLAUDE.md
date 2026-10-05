@AGENTS.md

# Språkhylla: guide for Claude Code

A home language library for one learner: a 51-year-old Ukrainian/Russian speaker in Norway, Norwegian B1→B2, English A1–A2. The UI is Russian. Her son is the coach and analyses the data. Read `README.md` for features, setup and costs.

## Commands

```bash
npm run dev         # http://localhost:3000 (needs .env.local, copy from .env.example)
npm run typecheck   # next typegen && tsc --noEmit; run after deleting .next too
npm test            # vitest: learning, ai, import, routes, sql (all migrations run in PGlite)
npm run e2e         # Playwright smoke at 1280 px and phone size; local only (dev sign-in, real Supabase from .env.local)
npm run db:types    # regenerate src/lib/supabase/database.types.ts from the migrations (Docker); CI fails if it is stale
npm run lint
npm run eval        # offline model comparison → eval-results/*.md (needs AI keys)
npm run import:gutenberg -- <id> <lang> "<title>" "<author>" <year> <kind> "<note in Russian>"
npm run import:text -- <file.txt> <lang> "<title>" "<author>" "<year>" "<source url>" "<license>" <kind>
npm run vocab:build # (re)build text_vocab for in-app books; needed after editing a body by hand
npm run updates:add -- <feature|content|fix> "<title>" "<text>" [/link]   # post to «Что нового» after a user-visible change ships
```

Before every commit: `npm run typecheck && npm test && npm run lint`. After a migration also `npm run db:types`. CI (.github/workflows/ci.yml) runs the same on every push.

## Where things live

- `src/app/(app)/`: signed-in pages (desk, library, read/[id], words, talk, grammar, coach, settings). `src/app/api/*`: route handlers.
- `src/proxy.ts`: Next 16 replacement for middleware. It refreshes the Supabase session and redirects signed-out users to /login.
- `src/lib/ai/`: provider-neutral AI layer.
  - `prompts.ts`: prompts plus their zod schemas.
  - `routing.ts`: default task → model routes.
  - `providers.ts`: Anthropic, Gemini and OpenAI over plain HTTP.
  - `execute.ts`: attempts, JSON repair and fallbacks.
  - `run.ts`: server entry point. It reads `model_routes` and logs every attempt to `llm_calls`.
  - `pricing.ts`: USD per 1M tokens.
- `src/lib/learning/`: coverage (text fit; `buildVocab` + SQL `text_fit()` for the library, kept identical by `tests/sql.test.ts`), FSRS (`srs.ts`), answer checking, quotes, grammar map (`RULE_KEYS`).
- `src/lib/import/`: coach book import (`/coach/import`). `sources.ts` fetches Gutenberg, Wikisource (incl. collections), Wikipedia and SNL from an allowlist of hosts and decides `rights` (ok / check / blocked; Norway: author died 70+ years ago); `file.ts` reads .txt/.epub; `analyze.ts` flags old spelling. Saving builds the vocabulary via `src/lib/vocab.ts`.
- `src/lib/text-format.ts`: book body format (blank-line paragraphs, `## ` headings) and `paginate()`.
- `src/lib/speech/`: STT (OpenAI or Gemini) and TTS (Google or OpenAI, cached in the `tts` bucket).
- `src/lib/session.ts`: `requireSession` for pages (cached per request), `apiSession` and `logEvent` for API routes. `src/components/tracker.tsx` holds the client `track()`.
- `src/lib/log.ts`: `insertLater()` writes `events`, `llm_calls` and `speech_calls` rows in `after()`, so logging never delays a response. Don't `await` log writes in request code.
- `src/app/auth/dev/route.ts`: local sign-in without email (`DEV_LOGIN_EMAIL` in `.env.local`, `next dev` only).
- `supabase/migrations/NNNN_*.sql` hold the schema, and `supabase/seed.sql` holds quotes, scenarios and external books.

## Rules for changes

1. **Log everything.** Each new user action calls `track("area.action", {...})` on the client. Each choice the app makes for her (what to show, what to correct, level changes) calls `logEvent(..., "decision.*", {reason, ...})` on the server. The data is the point of the project.
2. **AI calls go through `runTask(task, prompt, Schema)`**, never through a provider directly. Each new task needs an entry in `types.ts`, a default route in `routing.ts`, and a zod schema in `prompts.ts`.
3. **Prompts are versioned.** Changing wording means bumping `version` in `prompts.ts`. Outcomes are compared by `prompt_id`/`prompt_version` in `llm_calls`.
4. **Schema changes** go in a new numbered migration. Then run `npm run db:types` and use the typed client; jsonb and check-constrained columns are narrowed in `src/lib/db-json.ts`. Put it in a new file (`0009_...sql`); never edit an old one. Each new table gets RLS: learners see their own rows, and coaches see linked learners via `can_read_user()`. After writing a migration, tell the user to run it in the Supabase SQL Editor.
5. **Secrets stay server-side.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may reach the browser. `adminClient()` (service role) is used only in server code that already checked the session.
6. **Original texts only.** Never simplify or generate stories. Copyrighted books are `availability = 'external'` with a link, and companion mode does not store pasted pages.
7. **Pedagogy.** No corrections during a conversation. Afterwards give at most 2 fixes, with a hint (where to look) before the answer. Praise specifically. New phrases go to FSRS review. Reading fit (`fitGroup`): ≥90% known words is «подходит», 85–90% «чуть сложнее» — she reads with word lookup and «Перевод рядом»; 95–98% is the research target for reading without help. Norwegian compounds count as known when all parts are (`wordParts`).
8. **UI text is Russian** (Ukrainian optional through `ui_lang`). Keep the book-like palette in `globals.css` (paper, cloth, brass, oxblood). Design desktop-first, and check at 390 px wide.
9. **Tell her what is new.** Every user-visible change gets a «Что нового» entry (`app_updates`, page `/updates`, badge in the menu, banner on the desk), written in simple Russian for her: post it with `npm run updates:add` once the change is deployed. Import scripts post their own entry when they add texts (`newTexts()` in `scripts/lib.ts`; `--quiet` skips it).
10. **Sign-ups are closed** (migration 0012). A new person needs a row in `signup_allowlist` (SQL Editor) first; the login page only sends links to existing accounts.
11. **Next.js 16**: read `node_modules/next/dist/docs/` before using an unfamiliar API. `PageProps`/`LayoutProps` are generated by `next typegen`. Keep `Date.now()` out of server components (lint `react-hooks/purity`); use `requestClock()` from `src/lib/time.ts`.

## Evaluating models

- Offline: `npm run eval` runs fixed cases per task on every default model that has a key and scores them with a judge model. To choose models: `EVAL_MODELS='[{"provider":"google","model":"gemini-3.8-flash"}]' npm run eval`.
- Live A/B: insert weighted rows into `model_routes` (see README). The coach page and the `v_model_comparison` view compare latency, cost and errors. Learning outcomes come from `feedback_items` (self-fixed rate) and `reviews`.
- Gemini 3.x: thinking uses `thinkingConfig.thinkingLevel`, not `thinkingBudget`. See `geminiThinking()` in `providers.ts`.

## Testing locally against Supabase

`.env.local` can point at the production Supabase project, which holds real learner data, so be careful with writes. A safer setup is a second free Supabase project for development, with migrations and seed run there. For local Postgres-only checks of SQL and RLS, `initdb` into `/var/tmp` and apply the migrations with a stub `auth` schema.
