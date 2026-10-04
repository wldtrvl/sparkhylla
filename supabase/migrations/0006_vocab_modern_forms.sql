-- Older spellings (riksmål: sig, kunde, efter…) count as known when her modern form is known.
-- text_vocab.alt holds today's spelling; rank already falls back to it at build time.
-- After running this, rebuild vocabularies: npm run vocab:build -- --all

alter table public.text_vocab add column if not exists alt text;

create or replace function public.text_fit(p_lang text, p_band int, p_own text[])
returns table (text_id uuid, known_tokens bigint, total_tokens int)
language sql stable security invoker set search_path = public as $$
  with own as (select distinct f as form from unnest(p_own) as f)
  select t.id,
         coalesce(t.proper_tokens, 0) + coalesce(sum(v.n) filter (where
              v.rank <= p_band
           or v.form in (select form from own)
           or v.alt in (select form from own)
           or (v.parts is not null and not exists (
                 select 1 from unnest(v.parts, v.part_ranks) as x(part, r)
                 where not (coalesce(x.r <= p_band, false) or x.part in (select form from own))))
         ), 0)::bigint,
         t.token_count
  from public.texts t
  join public.text_vocab v on v.text_id = t.id
  where t.lang = p_lang and t.active and t.token_count is not null
  group by t.id, t.proper_tokens, t.token_count;
$$;
