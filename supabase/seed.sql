-- Starter content. Safe to re-run: uses ON CONFLICT / NOT EXISTS guards.

-- ---------- quotes of the day ----------
-- status: sourced = checked against the original work; attributed = widely attributed, original source uncertain (shown as "приписывается")
insert into public.quotes (text, text_lang, translation_ru, author, author_note, origin, status, source)
select * from (values
 ('The difficult is what takes a little time; the impossible is what takes a little longer.', 'en',
  'Трудное — это то, что требует немного времени; невозможное — то, что требует чуть больше.',
  'Fridtjof Nansen', 'полярный исследователь, лауреат Нобелевской премии мира (1922)', 'norway', 'attributed', null),
 ('Victory awaits him who has everything in order — luck, people call it.', 'en',
  'Победа ждёт того, у кого всё в порядке, — люди называют это удачей.',
  'Roald Amundsen', 'первым достиг Южного полюса (1911)', 'norway', 'sourced', 'The South Pole (1912)'),
 ('Borders? I have never seen one. But I have heard they exist in the minds of some people.', 'en',
  'Границы? Я ни одной не видел. Но слышал, что они существуют в головах некоторых людей.',
  'Thor Heyerdahl', 'путешественник, экспедиция «Кон-Тики» (1947)', 'norway', 'attributed', null),
 ('Det finnes ikke dårlig vær, bare dårlige klær.', 'no',
  'Не бывает плохой погоды — бывает неподходящая одежда.',
  'Норвежская пословица', null, 'norway', 'proverb', null),
 ('Ut på tur, aldri sur.', 'no',
  'Отправился на прогулку — и никакой хандры.',
  'Норвежская поговорка', null, 'norway', 'proverb', null),
 ('Øvelse gjør mester.', 'no',
  'Упражнение делает мастером. (Повторение — мать учения.)',
  'Норвежская пословица', null, 'norway', 'proverb', null),
 ('Bedre sent enn aldri.', 'no',
  'Лучше поздно, чем никогда.',
  'Норвежская пословица', null, 'norway', 'proverb', null),
 ('Den som intet våger, intet vinner.', 'no',
  'Кто ничем не рискует, тот ничего не выигрывает.',
  'Норвежская пословица', null, 'norway', 'proverb', null),
 ('The strongest man in the world is he who stands most alone.', 'en',
  'Самый сильный человек на свете — тот, кто стоит один.',
  'Henrik Ibsen', 'драматург, «Враг народа» (1882)', 'norway', 'sourced', 'An Enemy of the People, Act V (English translation)'),
 ('The limits of my language mean the limits of my world.', 'en',
  'Границы моего языка означают границы моего мира.',
  'Ludwig Wittgenstein', 'философ', 'world', 'sourced', 'Tractatus Logico-Philosophicus, 5.6 (English translation)'),
 ('Wer fremde Sprachen nicht kennt, weiß nichts von seiner eigenen.', 'de',
  'Кто не знает чужих языков, ничего не знает о своём собственном.',
  'Johann Wolfgang von Goethe', 'поэт и мыслитель', 'world', 'sourced', 'Maximen und Reflexionen'),
 ('Homines, dum docent, discunt.', 'la',
  'Люди, обучая, учатся сами.',
  'Seneca', 'римский философ', 'world', 'sourced', 'Epistulae morales ad Lucilium, 7.8'),
 ('A journey of a thousand miles begins with a single step.', 'en',
  'Путь в тысячу ли начинается с первого шага.',
  'Laozi', 'древнекитайский философ', 'world', 'sourced', 'Tao Te Ching, ch. 64 (English translation)'),
 ('It does not matter how slowly you go as long as you do not stop.', 'en',
  'Неважно, как медленно ты идёшь, — главное не останавливаться.',
  'Confucius', 'древнекитайский философ', 'world', 'attributed', null),
 ('If you talk to a man in a language he understands, that goes to his head. If you talk to him in his language, that goes to his heart.', 'en',
  'Если говорить с человеком на языке, который он понимает, — это доходит до его головы. Если на его родном языке — до его сердца.',
  'Nelson Mandela', 'президент ЮАР, лауреат Нобелевской премии мира', 'world', 'attributed', null),
 ('Nothing in life is to be feared, it is only to be understood.', 'en',
  'В жизни нечего бояться — есть только то, что нужно понять.',
  'Marie Curie', 'физик и химик, дважды лауреат Нобелевской премии', 'world', 'attributed', null)
) as v(text, text_lang, translation_ru, author, author_note, origin, status, source)
where not exists (select 1 from public.quotes);

-- ---------- conversation scenarios ----------
insert into public.scenarios (id, lang, level, title_ru, setting, persona, goals, sort) values
 ('no-doctor', 'no', 'B1', 'У врача: перенести приём',
  'Phone call to a GP office (legekontor) in Norway. The learner has an appointment on Thursday and needs to move it. Offer realistic alternatives; ask for date of birth politely if natural.',
  'Kari, receptionist at legekontoret, friendly and calm',
  '[{"id":"greet","ru":"Поздороваться и представиться"},{"id":"reason","ru":"Объяснить, почему не можете прийти"},{"id":"new_time","ru":"Договориться о новом времени"}]', 10),
 ('no-neighbour', 'no', 'B1', 'Разговор с соседкой',
  'Small talk in the stairwell with a neighbour. Topics: weather, the weekend, the building''s dugnad on Saturday.',
  'Ingrid, retired neighbour, talkative and warm',
  '[{"id":"greet","ru":"Поздороваться"},{"id":"weekend","ru":"Рассказать о своих выходных"},{"id":"dugnad","ru":"Договориться прийти на дугнад"}]', 20),
 ('no-coffee', 'no', 'B1', 'Кофе-брейк на работе',
  'Coffee break at work with a colleague. Talk about how the day is going and plans for the summer holiday.',
  'Marit, colleague of the same age',
  '[{"id":"day","ru":"Рассказать, как проходит день"},{"id":"ask","ru":"Задать вопрос коллеге"},{"id":"plans","ru":"Рассказать о планах на отпуск"}]', 30),
 ('no-shop', 'no', 'B1', 'Вернуть покупку в магазин',
  'Returning a sweater that is the wrong size at a clothing shop. The learner has the receipt. The clerk offers exchange or refund.',
  'Jonas, shop assistant, helpful',
  '[{"id":"explain","ru":"Объяснить проблему"},{"id":"choose","ru":"Выбрать обмен или возврат денег"},{"id":"thank","ru":"Вежливо попрощаться"}]', 40),
 ('en-cafe', 'en', 'A1', 'В кафе: сделать заказ',
  'Ordering at a small café in London. Keep sentences very short and slow; A1 level.',
  'Tom, a friendly waiter',
  '[{"id":"greet","ru":"Поздороваться"},{"id":"order","ru":"Заказать напиток и еду"},{"id":"pay","ru":"Спросить цену и заплатить"}]', 10),
 ('en-hotel', 'en', 'A2', 'Заселение в отель',
  'Checking in at a hotel reception. The learner has a booking for two nights.',
  'Sarah, hotel receptionist',
  '[{"id":"booking","ru":"Назвать бронь"},{"id":"breakfast","ru":"Спросить про завтрак"},{"id":"wifi","ru":"Спросить пароль от Wi-Fi"}]', 20),
 ('en-directions', 'en', 'A2', 'Спросить дорогу',
  'Asking a passer-by for directions to the train station in a British town.',
  'a helpful local, David',
  '[{"id":"ask","ru":"Вежливо обратиться"},{"id":"understand","ru":"Понять маршрут"},{"id":"repeat","ru":"Переспросить, если непонятно"}]', 30)
on conflict (id) do nothing;

-- ---------- library: external originals (read via library / Bokhylla, app is the companion) ----------
insert into public.texts (lang, title, author, author_note, year, kind, availability, source_url, license, est_level, tags)
select * from (values
 ('no', 'Naiv. Super.', 'Erlend Loe', 'Норвежский писатель (род. 1969). Пишет короткими простыми фразами о больших вопросах, с мягким юмором.', '1996', 'novel', 'external', 'https://www.nb.no/search?q=Naiv.%20Super.%20Erlend%20Loe', 'copyrighted — read via library or Bokhylla', 'B1', array['роман','юмор']),
 ('no', 'Folk og røvere i Kardemomme by', 'Thorbjørn Egner', 'Писатель и художник (1912–1990). Его книги знает каждый норвежец с детства.', '1955', 'novel', 'external', 'https://www.nb.no/search?q=Folk%20og%20r%C3%B8vere%20i%20Kardemomme%20by', 'copyrighted — read via library or Bokhylla', 'B1', array['классика','семейное']),
 ('no', 'Åtte små, to store og en lastebil', 'Anne-Cath. Vestly', 'Детская писательница (1920–2008), тёплые истории о большой семье.', '1959', 'novel', 'external', 'https://www.nb.no/search?q=%C3%85tte%20sm%C3%A5%2C%20to%20store%20og%20en%20lastebil', 'copyrighted — read via library or Bokhylla', 'B1', array['семейное']),
 ('no', 'Sofies verden', 'Jostein Gaarder', 'Писатель (род. 1952). Роман-путешествие по истории философии.', '1991', 'novel', 'external', 'https://www.nb.no/search?q=Sofies%20verden', 'copyrighted — read via library or Bokhylla', 'B2', array['роман','философия']),
 ('no', 'Norske folkeeventyr', 'Peter Chr. Asbjørnsen og Jørgen Moe', 'Собиратели норвежских народных сказок (1840-е). Старое правописание.', '1841–1844', 'tale', 'external', 'https://www.bokselskap.no/', 'public domain', 'B2', array['сказки','классика'])
) as v(lang, title, author, author_note, year, kind, availability, source_url, license, est_level, tags)
where not exists (select 1 from public.texts where availability = 'external');

-- In-app public-domain texts are imported with:
--   npm run import:gutenberg -- 14838 en "The Tale of Peter Rabbit" "Beatrix Potter" 1902
--   npm run import:gutenberg -- 19994 en "The Aesop for Children" "Aesop (Milo Winter ed.)" 1919
-- See README → "Adding books".
