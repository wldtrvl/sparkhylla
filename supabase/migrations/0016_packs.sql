-- «Набор дня»: one theme, 15/30/45 minutes, a few steps (warm-up review, a video, its key words, a
-- conversation, a rule) and a result at the end. Progress is derived from what she does (reviews, «Я дочитала»,
-- word marks, the finished conversation); `progress` only keeps steps that leave no other trace (the rule).
-- Words she saves during a pack and its conversation point back to it, so the basket and «сказали вслух» are exact.

create table public.packs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  lang        text not null check (lang in ('no', 'en')),
  day         date not null,                       -- Oslo day it was started
  theme       text not null,
  minutes     int not null check (minutes in (15, 30, 45)),
  plan        jsonb not null,                      -- the chosen steps and what each one uses
  progress    jsonb not null default '{}',
  results     jsonb,                               -- what she learnt, saved when she finishes
  status      text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index packs_user_day on public.packs (user_id, day desc);

alter table public.packs enable row level security;
create policy "read own or coached" on public.packs for select using (public.can_read_user(user_id));
create policy "insert own" on public.packs for insert with check (user_id = auth.uid());
create policy "update own" on public.packs for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- the basket and the pack's conversation (a deleted pack leaves her words and conversations alone)
alter table public.words add column if not exists pack_id uuid references public.packs(id) on delete set null;
create index if not exists words_pack on public.words (pack_id) where pack_id is not null;
alter table public.conversations add column if not exists pack_id uuid references public.packs(id) on delete set null;
-- goals a pack adds to a scenario, e.g. «use three words from the pack»
alter table public.conversations add column if not exists extra_goals jsonb not null default '[]';

-- themes for packs: tag the videos by the topic they were imported for (only where nothing is tagged yet)
update public.texts set tags = array[
  case substring(author_note from 'Тема: ([^.]+)\.')
    when 'работа' then 'work'
    when 'здоровье' then 'health'
    when 'здоровье и уход' then 'care'
    when 'забота о пожилых' then 'care'
    when 'семья' then 'home'
    when 'еда' then 'home'
    when 'общество' then 'society'
    when 'деньги' then 'society'
    when 'природа' then 'nature'
    when 'путешествия' then 'nature'
    when 'культура' then 'culture'
    when 'история' then 'culture'
    when 'язык' then 'culture'
    when 'новости и СМИ' then 'media'
    when 'общение' then 'media'
    else 'other'
  end]
where author = 'NDLA' and kind = 'video' and tags = '{}' and author_note like '%Тема: %';

update public.texts set tags = array[
  case
    when author_note like '%English in a Minute%' then 'expressions'
    when author_note like '%News Words%' then 'news'
    else 'everyday'
  end]
where author = 'VOA Learning English' and kind = 'video' and tags = '{}';
