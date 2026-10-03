# Språkhylla

A home language library for one learner (Norwegian B1→B2, English A1–A2), built desktop-first and usable on a phone.

- **Library of originals**: real texts, never simplified. Books are ordered by how many of their words she already knows (target 95–98%).
- **Reader**: unknown words highlighted; tap for a gloss in context; save to review or mark as known; listen to any paragraph.
- **Companion mode** for copyrighted books read in the library or Bokhylla: paste a page, get the same help. The page itself is not stored.
- **Words**: FSRS spaced repetition, answered by voice or typing, with each word shown in its original sentence.
- **Conversation**: voice role-plays. No corrections during the talk; afterwards at most two fixes, hint first, answer on request. New phrases go into review automatically.
- **Grammar**: topics linked to the mistakes she actually makes.
- **Quote of the day**: alternates Norwegian and world figures, with honest attribution status.
- **Coach dashboard**: minutes, recall, recurring mistakes, AI spend, model comparison, and CSV export.
- **Everything is logged**: every action goes to `events`, every AI call to `llm_calls`, every speech call to `speech_calls`.

## Architecture

```
Next.js 16 (App Router, TypeScript)  ──  Supabase (Postgres + Auth + Storage, RLS on every table)
        │
        ├─ src/lib/ai/        provider-neutral AI layer
        │    providers.ts     Anthropic · Google Gemini · OpenAI over plain HTTP (no SDK lock-in)
        │    routing.ts       task → model routes with weights (A/B), fallbacks across providers
        │    execute.ts       JSON parse + schema validation + one repair, per-attempt logs
        │    run.ts           server wrapper: DB route overrides + llm_calls logging
        │    prompts.ts       every prompt, versioned, with its output schema
        │    pricing.ts       USD/MTok table → cost per call
        ├─ src/lib/speech/    STT (OpenAI, Gemini) and TTS (Google Cloud, OpenAI) with storage cache
        ├─ src/lib/learning/  coverage (text fit), FSRS scheduling, answer checking, quotes, grammar map
        └─ scripts/           eval-models (offline model comparison), book importers
```

**Defaults:** Claude (Haiku 4.5 for lookups, Sonnet 5.5 for conversation) when `ANTHROPIC_API_KEY` is set; otherwise Gemini (3.1 Flash-Lite for lookups, 3.8 Flash for conversation and feedback). Speech-to-text uses OpenAI if keyed, else Gemini (`GEMINI_STT_MODEL`).

**Changing models without a deploy:** insert rows into `model_routes`:

```sql
-- 50/50 test of two models on word glosses
insert into model_routes (task, provider, model, weight) values
  ('gloss', 'anthropic', 'claude-haiku-4-5-20251001', 1),
  ('gloss', 'google',    'gemini-3.1-flash-lite',     1);
```

Tasks are `gloss`, `talk_open`, `tutor_turn`, `talk_help`, `talk_feedback` and `explain`. Each call is assigned by weight and recorded in `llm_calls.variant`; the view `v_model_comparison` and the coach page compare latency, cost and error rate. Routes are re-read every 60 s. Set `active = false` to stop a route.

## Setup (about 30 minutes)

1. **Supabase**: create a project at supabase.com and open the SQL editor.
   - Run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
   - Under Authentication → URL configuration, set Site URL to your domain (or `http://localhost:3000`) and add `<domain>/auth/callback` to redirect URLs.
2. **Keys**: `cp .env.example .env.local` and fill in the Supabase URL and anon key, the service-role key, at least one AI key, and optionally speech keys.
   - Without STT she can type in conversations.
   - Without TTS the browser's own voice is used. Norwegian quality varies; Google Cloud TTS sounds much better.
3. **Run locally**: `npm install`, then `npm run dev`, then open http://localhost:3000 and sign in with a magic link.
4. **Add books**:
   ```bash
   npm run import:gutenberg -- 14838 en "The Tale of Peter Rabbit" "Beatrix Potter" 1902 story "Английская писательница и художница (1866–1943)."
   npm run import:gutenberg -- 19994 en "The Aesop for Children" "Aesop (ed. 1919)" 1919 fable "Басни Эзопа в издании для детей 1919 года."
   # Norwegian public-domain text downloaded as UTF-8 .txt from bokselskap.no or runeberg.org:
   npm run import:text -- eventyr.txt no "Norske folkeeventyr" "Asbjørnsen og Moe" "1841" "https://www.bokselskap.no/" "public domain" tale
   ```
   Modern books are added as `availability = 'external'` rows with a link (see seed.sql); she reads them in the library or Bokhylla and uses companion mode.
5. **Link coach and learner** after both have signed in once:
   ```sql
   update profiles set role = 'coach', display_name = 'Сын' where user_id = (select id from auth.users where email = 'you@…');
   update profiles set display_name = 'мама' where user_id = (select id from auth.users where email = 'mom@…');
   insert into coach_links (coach_id, learner_id)
   select c.id, l.id from auth.users c, auth.users l where c.email = 'you@…' and l.email = 'mom@…';
   ```
6. **Deploy to Vercel**: import the repo, add the same environment variables, deploy. Then update the Supabase Site URL to the Vercel domain.

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # unit tests: coverage, FSRS, answers, quotes, routing, JSON repair, fallbacks
npm run lint
npm run eval        # compare models on fixed test cases (needs API keys) → eval-results/*.md
```

## Analysing the data

Useful starting points:

- `events`: `page.view`, `word.tap`, `word.save`, `word.mark_known`, `review.grade`, `read.page`, `read.finish`, `read.listen`, `talk.start`, `talk.turn`, `talk.finish`, `talk.help`, `feedback.self_fixed`, `feedback.revealed`, `activity.heartbeat` (every 30 s of real activity), and `decision.*`, which records what the app chose and why: the daily plan, feedback selection and level changes.
- `reviews`: FSRS state before and after each answer, with response time and voice/typed mode.
- `llm_calls`: prompt id and version, model, tokens, cost, latency, and full input and output (unless `LOG_AI_PAYLOADS=false`).
- Views: `v_daily_activity` (minutes per day) and `v_model_comparison`.
- The coach page exports CSV for events and AI calls.

When you change a prompt, bump its `version` in `prompts.ts`. You can then compare outcomes (self-fixed rate, recall, latency) before and after.

## Running costs (one learner, ~30 min/day, October 2026 prices)

| Item | Estimate |
|---|---|
| Vercel Hobby | $0 (personal, non-commercial use) |
| Supabase Free | $0. Pauses after 7 days without activity and has no backups; Pro is $25/month for daily backups |
| AI (Claude Haiku 4.5 + Sonnet 5.5 defaults) | roughly $5–10/month |
| AI on Gemini (3.1 Flash-Lite for lookups, 3.8 Flash for conversation) | roughly $2–5/month; 3.8 Flash doubles in price on 1 Jan 2027 |
| Speech-to-text (gpt-4o-mini-transcribe, $0.003/min) | well under $1/month |
| Text-to-speech (Google WaveNet; free tier 4M characters/month) | usually $0; cached audio is reused |

The AI numbers are estimates. Check real spend on the coach page after the first week.

## Privacy

Her texts, voice transcripts and AI conversations are stored in your Supabase project. Audio is not stored: it is transcribed and discarded. Pasted pages from copyrighted books are analysed in memory and not saved. Set `LOG_AI_PAYLOADS=false` to keep only metadata for AI calls.

## Not built yet

- Video lessons with synced transcripts.
- A placement test.
- Automatic level updates from the data.
- A pronunciation practice screen.
- Daily reminders (Telegram or web push).
- Photo of a letter → words.
