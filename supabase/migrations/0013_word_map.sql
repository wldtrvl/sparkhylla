-- «Карта слов»: the frequent words of each language as a tree, from basic words (gjøre, ta, stor)
-- to the more advanced words that branch from them, each with a level, a theme and other ways to say it.
-- Built offline by `npm run wordmap:build` (AI tags, cached here); the learner's own status comes from `words`.

create table public.word_map (
  lang           text not null check (lang in ('no', 'en')),
  lemma          text not null,                   -- normalised: lower case, no article, no «å» / «to»
  display        text not null,                   -- dictionary form to show: «å gå», «en bil», «go»
  pos            text not null default 'other',   -- verb, noun, adj, adv, pron, prep, conj, num, interj, other
  forms          text[] not null default '{}',    -- frequency-list forms that belong to it (går, gikk, gått)
  rank           int not null,                    -- best frequency rank among its forms (1 = most frequent)
  level          text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  skip           boolean not null default false,  -- names, fragments, noise: kept so the build does not redo them
  theme          text,
  translation_ru text,
  analogues      jsonb not null default '[]',     -- [{text, level, note}]: other ways to say it
  root           text,                            -- lemma of the basic word this one branches from
  linked         boolean not null default false,  -- the build has decided its root (possibly none)
  tag_version    int,
  updated_at     timestamptz not null default now(),
  primary key (lang, lemma)
);
create index word_map_theme on public.word_map (lang, theme) where not skip;
create index word_map_root on public.word_map (lang, root) where not skip;

alter table public.word_map enable row level security;
create policy "signed-in users read the word map" on public.word_map for select using (auth.uid() is not null);
create policy "coach writes the word map" on public.word_map for all using (public.is_coach()) with check (public.is_coach());
