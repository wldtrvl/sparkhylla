-- 0002: start profiles without a name (the e-mail prefix looked odd in the greeting);
-- the learner sets her name in Settings.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, '')
  on conflict do nothing;
  return new;
end $$;

-- clear names that were only copied from the e-mail address
update public.profiles p
set display_name = ''
from auth.users u
where u.id = p.user_id and p.display_name = split_part(u.email, '@', 1);
