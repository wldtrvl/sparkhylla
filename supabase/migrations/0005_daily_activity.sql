-- Daily activity for one learner since a date. Same numbers as v_daily_activity, but filters events by
-- time before grouping (uses events_user_time), instead of grouping her whole history on every desk visit.
-- Runs with the caller's rights: learners see themselves, coaches their linked learners.
create or replace function public.daily_activity(p_user uuid, p_since date)
returns table (day date, minutes numeric, reviews bigint, words_saved bigint, talk_turns bigint, word_taps bigint)
language sql stable security invoker set search_path = public as $$
  select (created_at at time zone 'Europe/Oslo')::date as day,
         count(*) filter (where type = 'activity.heartbeat') / 2.0,   -- heartbeat every 30 s
         count(*) filter (where type = 'review.grade'),
         count(*) filter (where type = 'word.save'),
         count(*) filter (where type = 'talk.turn'),
         count(*) filter (where type = 'word.tap')
  from public.events
  where user_id = p_user
    and created_at >= (p_since::timestamp at time zone 'Europe/Oslo')
  group by 1
  order by 1;
$$;
