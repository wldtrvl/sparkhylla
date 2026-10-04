-- Per-book vocabulary: the library computes "% of words you know" in SQL from distinct word forms,
-- instead of downloading every book's full text on each visit.
-- Filled by `npm run vocab:build` (and by the importers). Mirrors coverageFromVocab() in src/lib/learning/coverage.ts.

alter table public.texts
  add column if not exists token_count    int,          -- all word tokens; null = vocabulary not built yet
  add column if not exists proper_tokens  int,          -- capitalised mid-sentence (names, places): always known
  add column if not exists vocab_built_at timestamptz;

create table if not exists public.text_vocab (
  text_id    uuid not null references public.texts(id) on delete cascade,
  form       text not null,          -- lowercased word form as it appears
  n          int  not null,          -- occurrences in the text
  rank       int,                    -- 1-based rank in the language's frequency list; null if not listed
  parts      text[],                 -- hyphenated compounds: parts ...
  part_ranks int[],                  -- ... and their ranks (known if every part is known)
  primary key (text_id, form)
);

alter table public.text_vocab enable row level security;
create policy "signed-in read text vocab" on public.text_vocab for select using (auth.uid() is not null);
create policy "coach writes text vocab" on public.text_vocab for all using (public.is_coach()) with check (public.is_coach());

-- Editing a body by hand makes its vocabulary stale: clear it so the library falls back to the
-- editor's level until `npm run vocab:build` runs again.
create or replace function public.texts_body_changed() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    new.token_count := null;
    new.proper_tokens := null;
    new.vocab_built_at := null;
  end if;
  return new;
end $$;

drop trigger if exists texts_body_changed on public.texts;
create trigger texts_body_changed before update of body on public.texts
  for each row execute function public.texts_body_changed();

-- Known tokens per book for one learner: forms in her frequency band (rank <= p_band), forms she has
-- saved or marked known (p_own, built by knownSets() in the app), compounds whose parts are all known,
-- plus proper nouns. Runs with the caller's rights (RLS applies).
create or replace function public.text_fit(p_lang text, p_band int, p_own text[])
returns table (text_id uuid, known_tokens bigint, total_tokens int)
language sql stable security invoker set search_path = public as $$
  with own as (select distinct f as form from unnest(p_own) as f)
  select t.id,
         coalesce(t.proper_tokens, 0) + coalesce(sum(v.n) filter (where
              v.rank <= p_band
           or v.form in (select form from own)
           or (v.parts is not null and not exists (
                 select 1 from unnest(v.parts, v.part_ranks) as x(part, r)
                 where not (coalesce(x.r <= p_band, false) or x.part in (select form from own))))
         ), 0)::bigint,
         t.token_count
  from public.texts t
  join public.text_vocab v on v.text_id = t.id
  where t.lang = p_lang and t.active and t.token_count is not null
  group by t.id, t.proper_tokens, t.token_count;
$$;
