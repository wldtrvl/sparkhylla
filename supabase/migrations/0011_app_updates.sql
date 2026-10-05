-- «Что нового»: a dated log of what changed in the app, shown to the learner on /updates.
-- Entries are written by the coach (RLS) and by the import scripts (service role) when they add texts.
-- What the learner has already seen lives in profiles.settings.updates_seen_at (no column needed).

create table public.app_updates (
  id           bigserial primary key,
  published_at timestamptz not null default now(),
  kind         text not null default 'feature' check (kind in ('feature', 'content', 'fix')),
  title        text not null,
  body         text not null default '',
  link         text,                 -- in-app path, e.g. /library?q=Saki
  created_at   timestamptz not null default now()
);
create index app_updates_published on public.app_updates (published_at desc);

alter table public.app_updates enable row level security;
create policy "signed-in users read updates" on public.app_updates for select using (auth.uid() is not null);
create policy "coach writes updates" on public.app_updates for all using (public.is_coach()) with check (public.is_coach());

-- what has happened so far, written for her
insert into public.app_updates (published_at, kind, title, body, link) values
  ('2026-10-03 15:07+02', 'feature', 'Språkhylla открылась',
   'Домашняя библиотека: оригинальные тексты на норвежском и английском, перевод слова по нажатию, свои слова с повторением и разговоры голосом.', '/'),
  ('2026-10-04 12:28+02', 'fix', 'Страницы открываются в 3–4 раза быстрее',
   'Стол, библиотека и книги грузятся заметно быстрее. Повторение слов стало удобнее на телефоне.', null),
  ('2026-10-04 17:26+02', 'feature', 'Удобнее на телефоне',
   'Меню внизу экрана, перевод слова в нижней панели, фразу можно выделить пальцем, у каждого абзаца есть кнопка «Слушать», а свои слова можно исправлять.', '/words'),
  ('2026-10-04 18:49+02', 'content', '155 английских рассказов',
   'Беатрикс Поттер, О. Генри, Шерлок Холмс, «Просто сказки» Киплинга, сказки братьев Гримм и Оскара Уайльда, Чехов, Джек Лондон.', '/library'),
  ('2026-10-04 18:52+02', 'feature', '«Перевод рядом»',
   'В книге можно включить перевод каждого предложения рядом с текстом. Кнопка с глазом прячет перевод — сначала попробуйте перевести сами.', '/library'),
  ('2026-10-04 19:12+02', 'feature', '«Мой путь» и состав слова',
   'В меню появился «Мой путь»: что делать дальше и сколько уже пройдено. У сложного слова теперь видно, из каких слов оно состоит, и больше примеров, в том числе вопрос.', '/path'),
  ('2026-10-04 19:20+02', 'content', '41 статья о жизни в Норвегии',
   'Из норвежской Википедии: 17 мая, брюност, дугнад, норвежская дача (hytte), северное сияние, Хуртигрутен, Мунк, Ибсен, Нансен и другие.', '/library?kind=article'),
  ('2026-10-04 19:57+02', 'content', 'Английские новости с голосом диктора',
   'Статьи «Голоса Америки» для изучающих английский: можно слушать запись диктора и читать текст. Английский голос в приложении теперь американский — чётче и понятнее.', '/library?kind=news'),
  ('2026-10-04 22:32+02', 'content', '48 норвежских книг и рассказов',
   'Ханс Аанрюд, Диккен Цвильгмейер, Регине Норманн, Сигрид Унсет, Сигрид Бу, Оскар Бротен, Стейн Ривертон. Старое написание (paa, havde) теперь тоже считается знакомым.', '/library'),
  ('2026-10-04 22:38+02', 'content', '127 рассказов Саки и Уэллса',
   'Саки — короткие остроумные истории с неожиданным концом. Герберт Уэллс — странные и удивительные истории, например «Страна слепых» и «Волшебная лавка».', '/library?q=Saki'),
  ('2026-10-04 22:39+02', 'feature', '«Понравилось?»',
   'Когда вы дочитали текст, приложение спросит, понравился ли он. Так будет легче подбирать следующие тексты.', null),
  (now(), 'feature', '«Что нового»',
   'Эта страница. Здесь появляется всё новое в приложении, а на столе и в меню — отметка, когда есть что посмотреть.', null);
