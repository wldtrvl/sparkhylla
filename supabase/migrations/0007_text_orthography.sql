-- Spelling era of a text, shown as a badge in the library ("старая орфография").
-- Set by the importers and by `npm run vocab:build -- --all` for existing texts.
alter table public.texts
  add column if not exists orthography text not null default 'modern' check (orthography in ('modern', 'old'));
