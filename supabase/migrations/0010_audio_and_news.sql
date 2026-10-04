-- Listen and read: a text can have a recording (e.g. VOA Learning English news, public domain),
-- played above the text in the reader. Recordings are copied into the public "media" bucket.
alter table public.texts add column if not exists audio_url text;

-- news as its own kind of text in the library
alter table public.texts drop constraint if exists texts_kind_check;
alter table public.texts add constraint texts_kind_check check (kind in ('novel', 'story', 'tale', 'fable', 'article', 'news', 'other'));

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
