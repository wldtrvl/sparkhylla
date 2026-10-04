-- Sentence translations for «Перевод рядом» in the reader. One row per sentence, language pair and prompt
-- version, so a page is translated once and re-pagination does not matter. Only texts stored in the app
-- (public domain / open licence) are cached; pasted pages from copyrighted books are never stored.
create table if not exists public.translation_cache (
  key            text primary key,       -- sha1 of lang|ui_lang|prompt_version|sentence
  lang           text not null,
  ui_lang        text not null,
  prompt_version int  not null,
  sentence       text not null,
  translation    text not null,
  created_at     timestamptz not null default now()
);

alter table public.translation_cache enable row level security;
create policy "signed-in read translations" on public.translation_cache for select using (auth.uid() is not null);
-- written by the server with the service role only
