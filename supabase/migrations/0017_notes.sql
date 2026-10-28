-- «Мои заметки»: grammar rules and sentence patterns she keeps to come back to, with her own comment.
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  lang       text not null check (lang in ('no', 'en')),
  kind       text not null check (kind in ('rule', 'pattern')),
  ref        text not null,                 -- grammar key or pattern key
  body       text not null default '',      -- her own words
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.notes enable row level security;
create policy "read own or coached" on public.notes for select using (public.can_read_user(user_id));
create policy "insert own" on public.notes for insert with check (user_id = auth.uid());
create policy "update own" on public.notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on public.notes for delete using (user_id = auth.uid());
