-- Server errors (Next.js onRequestError), so the coach sees what broke without an outside service.
-- Written only by the server with the service role; read by coaches.
create table if not exists public.app_errors (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  path        text,
  method      text,
  message     text not null,
  digest      text,
  route_type  text,          -- render, route, action, proxy
  route_path  text           -- the route file, e.g. /read/[id]
);
create index if not exists app_errors_time on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;
create policy "coaches read errors" on public.app_errors for select using (public.is_coach());
