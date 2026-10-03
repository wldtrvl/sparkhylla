-- Språkhylla: initial schema
-- Principles:
--  * every learner action is an append-only row in `events`
--  * every AI call is a row in `llm_calls` (provider, model, tokens, cost, latency, I/O)
--  * learners see only their own rows; a coach sees rows of learners linked to them
--  * shared content (texts, quotes, scenarios) is readable by any signed-in user, writable by coaches

create extension if not exists pgcrypto;

-- ---------- people ----------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'learner' check (role in ('learner','coach')),
  ui_lang      text not null default 'ru' check (ui_lang in ('ru','uk')),
  active_lang  text not null default 'no' check (active_lang in ('no','en')),
  -- per language, per skill CEFR estimate: {"no":{"reading":"B1","speaking":"B1"},"en":{...}}
  levels       jsonb not null default '{"no":{"reading":"B1","speaking":"B1","writing":"A2"},"en":{"reading":"A2","speaking":"A1","writing":"A1"}}',
  settings     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table public.coach_links (
  coach_id   uuid not null references auth.users(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, learner_id)
);

-- true when the current user may read data of `target`
create or replace function public.can_read_user(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or exists (select 1 from public.coach_links c where c.coach_id = auth.uid() and c.learner_id = target);
$$;

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'coach');
$$;

-- create a profile automatically on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- shared content ----------
create table public.texts (
  id          uuid primary key default gen_random_uuid(),
  lang        text not null check (lang in ('no','en')),
  title       text not null,
  author      text not null,
  author_note text,                       -- short bio shown in the reader
  year        text,
  kind        text not null default 'story' check (kind in ('novel','story','tale','fable','article','other')),
  -- in_app: public-domain / openly licensed text stored in `body`
  -- external: copyrighted original read elsewhere (library, Bokhylla); app acts as companion
  availability text not null default 'in_app' check (availability in ('in_app','external')),
  body        text,                       -- paragraphs separated by blank lines (in_app only)
  source_url  text,
  license     text,                       -- e.g. 'public domain', 'CC BY 4.0'
  est_level   text,                       -- editor's estimate (used for external texts)
  word_count  int,
  tags        text[] not null default '{}',
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint in_app_has_body check (availability = 'external' or body is not null)
);

create table public.quotes (
  id          serial primary key,
  text        text not null,          -- original wording
  text_lang   text not null,          -- 'no','en','de',...
  translation_ru text not null,
  translation_uk text,
  author      text not null,
  author_note text,
  origin      text not null default 'world' check (origin in ('norway','world')),
  -- sourced: verified source; attributed: widely attributed, source uncertain; proverb
  status      text not null check (status in ('sourced','attributed','proverb')),
  source      text,
  active      boolean not null default true
);

create table public.scenarios (
  id        text primary key,
  lang      text not null check (lang in ('no','en')),
  level     text not null,
  title_ru  text not null,
  setting   text not null,       -- instructions for the tutor persona (English)
  persona   text not null,       -- e.g. 'Kari, receptionist at the doctor''s office'
  goals     jsonb not null,      -- [{"id":"greet","ru":"Поздороваться"}...]
  active    boolean not null default true,
  sort      int not null default 0
);

-- AI routing overrides (code has defaults; rows here win when active)
create table public.model_routes (
  id        serial primary key,
  task      text not null,
  provider  text not null check (provider in ('anthropic','google','openai')),
  model     text not null,
  weight    int not null default 1 check (weight >= 0),
  active    boolean not null default true,
  note      text,
  created_at timestamptz not null default now()
);

-- ---------- learner data ----------
create table public.words (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  lang          text not null check (lang in ('no','en')),
  term          text not null,
  lemma         text,
  translation   text,
  note          text,
  kind          text not null default 'word' check (kind in ('word','phrase')),
  -- learning: in spaced review; known: counts as known, not reviewed; ignored: proper noun etc.
  status        text not null default 'learning' check (status in ('learning','known','ignored')),
  context       text,                 -- sentence where it was met
  source        text,                 -- 'text:<id>' | 'talk:<id>' | 'manual' | 'photo'
  fsrs          jsonb,                -- ts-fsrs Card serialised
  due           timestamptz,
  reps          int not null default 0,
  lapses        int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index words_user_lang_term on public.words (user_id, lang, lower(term));
create index words_due on public.words (user_id, lang, status, due);

create table public.reviews (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  word_id     uuid not null references public.words(id) on delete cascade,
  rating      smallint not null,          -- ts-fsrs Rating: 1 Again, 2 Hard, 3 Good, 4 Easy
  mode        text not null,              -- voice | typed | button
  answer      text,
  auto_correct boolean,                   -- app's judgement of the answer
  elapsed_ms  int,
  state_before jsonb,
  state_after  jsonb,
  created_at  timestamptz not null default now()
);

create table public.reading_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  text_id     uuid not null references public.texts(id) on delete cascade,
  page        int not null default 0,
  coverage    numeric,                    -- known-word share when last opened
  finished_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, text_id)
);

create table public.gloss_cache (
  id          bigserial primary key,
  lang        text not null,
  ui_lang     text not null,
  term        text not null,
  context_hash text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (lang, ui_lang, term, context_hash)
);

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scenario_id text references public.scenarios(id),
  lang        text not null,
  level       text not null,
  goals_done  text[] not null default '{}',
  summary     jsonb,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table public.conversation_turns (
  id              bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('learner','tutor')),
  text            text not null,
  notes           jsonb,          -- tutor's silent notes about learner errors
  stt_provider    text,
  created_at      timestamptz not null default now()
);

create table public.feedback_items (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  lang            text not null,
  said            text not null,
  hint            text not null,
  correction      text not null,
  rule_key        text,            -- stable id for grouping, e.g. 'no.subclause_adverb'
  rule_label      text,
  status          text not null default 'open' check (status in ('open','self_fixed','revealed')),
  created_at      timestamptz not null default now()
);

-- ---------- analytics ----------
create table public.events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  text,
  type        text not null,      -- e.g. 'page.view', 'word.tap', 'review.grade', 'decision.recommend_text'
  props       jsonb not null default '{}',
  path        text,
  app_version text,
  created_at  timestamptz not null default now()
);
create index events_user_time on public.events (user_id, created_at desc);
create index events_type_time on public.events (type, created_at desc);

create table public.llm_calls (
  id            bigserial primary key,
  user_id       uuid references auth.users(id) on delete set null,
  task          text not null,
  prompt_id     text not null,
  prompt_version int not null,
  provider      text not null,
  model         text not null,
  variant       text,              -- routing bucket label for A/B
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(12,6),
  latency_ms    int,
  ok            boolean not null,
  error         text,
  attempt       int not null default 1,
  request       jsonb,             -- messages sent (for offline analysis)
  response      text,
  created_at    timestamptz not null default now()
);
create index llm_calls_task_model on public.llm_calls (task, provider, model, created_at desc);

create table public.speech_calls (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('stt','tts')),
  provider    text not null,
  model       text,
  lang        text,
  units       numeric,             -- seconds of audio (stt) or characters (tts)
  cost_usd    numeric(12,6),
  latency_ms  int,
  ok          boolean not null,
  error       text,
  cached      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles          enable row level security;
alter table public.coach_links       enable row level security;
alter table public.texts             enable row level security;
alter table public.quotes            enable row level security;
alter table public.scenarios         enable row level security;
alter table public.model_routes      enable row level security;
alter table public.words             enable row level security;
alter table public.reviews           enable row level security;
alter table public.reading_progress  enable row level security;
alter table public.gloss_cache       enable row level security;
alter table public.conversations     enable row level security;
alter table public.conversation_turns enable row level security;
alter table public.feedback_items    enable row level security;
alter table public.events            enable row level security;
alter table public.llm_calls         enable row level security;
alter table public.speech_calls      enable row level security;

-- profiles
create policy "read own or linked profile" on public.profiles for select using (public.can_read_user(user_id));
create policy "update own profile" on public.profiles for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = (select p.role from public.profiles p where p.user_id = auth.uid()));
create policy "read own coach links" on public.coach_links for select using (coach_id = auth.uid() or learner_id = auth.uid());

-- shared content
create policy "signed-in read texts" on public.texts for select using (auth.uid() is not null);
create policy "coach writes texts" on public.texts for all using (public.is_coach()) with check (public.is_coach());
create policy "signed-in read quotes" on public.quotes for select using (auth.uid() is not null);
create policy "coach writes quotes" on public.quotes for all using (public.is_coach()) with check (public.is_coach());
create policy "signed-in read scenarios" on public.scenarios for select using (auth.uid() is not null);
create policy "coach writes scenarios" on public.scenarios for all using (public.is_coach()) with check (public.is_coach());
create policy "coach manages routes" on public.model_routes for all using (public.is_coach()) with check (public.is_coach());
create policy "signed-in read gloss cache" on public.gloss_cache for select using (auth.uid() is not null);

-- per-learner tables: owner writes, owner or linked coach reads
do $$
declare t text;
begin
  foreach t in array array['words','reviews','reading_progress','conversations','conversation_turns','feedback_items','events'] loop
    execute format('create policy "read own or coached" on public.%I for select using (public.can_read_user(user_id))', t);
    execute format('create policy "insert own" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "update own" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
create policy "delete own words" on public.words for delete using (user_id = auth.uid());

-- AI and speech logs are written by the server (service role) and read by the owner or coach
create policy "read own or coached llm calls" on public.llm_calls for select using (user_id is not null and public.can_read_user(user_id));
create policy "read own or coached speech calls" on public.speech_calls for select using (user_id is not null and public.can_read_user(user_id));

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('tts', 'tts', true) on conflict do nothing;

-- ---------- convenience views for analysis ----------
create or replace view public.v_model_comparison with (security_invoker = true) as
select task, provider, model, variant,
       count(*)                                   as calls,
       round(avg(latency_ms))                     as avg_latency_ms,
       percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,
       round(sum(cost_usd)::numeric, 4)           as cost_usd,
       round(avg(input_tokens))                   as avg_in,
       round(avg(output_tokens))                  as avg_out,
       round(100.0 * avg(case when ok then 0 else 1 end), 1) as error_pct
from public.llm_calls
group by task, provider, model, variant;

create or replace view public.v_daily_activity with (security_invoker = true) as
select user_id, (created_at at time zone 'Europe/Oslo')::date as day,
       count(*) filter (where type = 'activity.heartbeat') / 2.0 as minutes,   -- heartbeat every 30 s
       count(*) filter (where type = 'review.grade')            as reviews,
       count(*) filter (where type = 'word.save')               as words_saved,
       count(*) filter (where type = 'talk.turn')               as talk_turns,
       count(*) filter (where type = 'word.tap')                as word_taps
from public.events
group by user_id, day;
