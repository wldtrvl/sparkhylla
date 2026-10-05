-- Sign-ups are closed: the learner and the coach already have accounts, nobody else gets one.
-- Existing accounts sign in as before. To let a new person in, add their email in the SQL Editor:
--   insert into public.signup_allowlist (email) values ('name@example.com');
-- (Also switch off Authentication → Sign In / Providers → «Allow new users to sign up» in the dashboard.)

create table public.signup_allowlist (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security; -- no policies: only the SQL Editor / service role

create or replace function public.block_new_signups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.signup_allowlist a where lower(a.email) = lower(new.email)) then
    return new;
  end if;
  raise exception 'Sign-ups are closed for this app';
end;
$$;

create trigger block_new_signups before insert on auth.users
  for each row execute function public.block_new_signups();
