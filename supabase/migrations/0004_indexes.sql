-- Indexes for the per-learner, time-ordered queries the pages and the coach dashboard run.
create index if not exists reviews_user_time        on public.reviews (user_id, created_at desc);
create index if not exists conversations_user_lang  on public.conversations (user_id, lang, started_at desc);
create index if not exists feedback_user_lang_time  on public.feedback_items (user_id, lang, created_at desc);
create index if not exists feedback_conversation    on public.feedback_items (conversation_id);
create index if not exists turns_conversation       on public.conversation_turns (conversation_id, id);
create index if not exists llm_calls_user_time      on public.llm_calls (user_id, created_at desc);
create index if not exists speech_calls_user_time   on public.speech_calls (user_id, created_at desc);
