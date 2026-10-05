-- Videos with real speakers: a video is a text whose body is its transcript (so the reader, word lookup,
-- «Перевод рядом», reading fit and progress all work), plus the player and when each paragraph is spoken.
--   {"provider": "brightcove", "account": "…", "player": "…", "id": "…", "paras": [[start, end], …]}
--   {"provider": "mp4", "src": "https://…", "paras": [[start, end], …] | null}
alter table public.texts add column if not exists video jsonb;

alter table public.texts drop constraint if exists texts_kind_check;
alter table public.texts add constraint texts_kind_check check (kind in ('novel', 'story', 'tale', 'fable', 'article', 'news', 'video', 'other'));
