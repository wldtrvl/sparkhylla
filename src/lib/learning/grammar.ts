/**
 * Grammar topics. `key` is the same rule key the tutor uses when it notes a mistake,
 * so the grammar map can show "this came up N times in your conversations".
 */
export interface GrammarTopic {
  key: string;
  lang: "no" | "en";
  level: string;
  title: string;
  body: string;
  examples: [string, string][];
  bridge?: string; // for English: comparison with Norwegian
}

export const GRAMMAR: GrammarTopic[] = [
  { key: "no.v2_inversion", lang: "no", level: "A2", title: "Глагол на 2-м месте (V2)", body: "В главном предложении глагол всегда стоит на втором месте. Если предложение начинается не с подлежащего (с времени, места, «поэтому»), подлежащее переходит за глагол — это инверсия.", examples: [["I dag jobber jeg hjemme.", "Сегодня я работаю дома."], ["Om kvelden ser vi på TV.", "По вечерам мы смотрим телевизор."]] },
  { key: "no.definite_form", lang: "no", level: "A2", title: "Определённая форма", body: "Артикль присоединяется к концу слова: en bil → bilen, ei bok → boka, et hus → huset. Множественное число: biler → bilene, hus → husene.", examples: [["Bilen er ny.", "Машина новая."], ["Husene er røde.", "Дома красные."]] },
  { key: "no.gender_article", lang: "no", level: "A2", title: "Род: en / ei / et", body: "Род существительного нужно учить вместе со словом: en stol, ei dør, et bord. От рода зависят артикль, определённая форма и прилагательное.", examples: [["en stol – stolen", "стул – этот стул"], ["et bord – bordet", "стол – этот стол"]] },
  { key: "no.past_tense", lang: "no", level: "A2", title: "Прошедшее время (preteritum)", body: "Слабые глаголы: -et, -te, -de, -dde (jobbet, spiste, levde, bodde). Сильные меняются целиком, их запоминают: gå – gikk, se – så, ta – tok, være – var.", examples: [["I går spiste vi fisk.", "Вчера мы ели рыбу."], ["Hun gikk til butikken.", "Она пошла в магазин."]] },
  { key: "no.preposition_time", lang: "no", level: "A2", title: "Предлоги времени: på, i, om, for … siden", body: "på + день недели (på mandag), i + месяц/год (i mai), om + через (om to dager), for … siden = … назад (for to år siden).", examples: [["Kan jeg komme på mandag?", "Можно прийти в понедельник?"], ["Jeg kom til Norge for tre år siden.", "Я приехала в Норвегию три года назад."]] },
  { key: "no.perfect_tense", lang: "no", level: "B1", title: "Perfektum: har + причастие", body: "Когда важен результат или опыт, а не точное время. Часто с «i … år» (уже … лет) и в вопросах «Har du noen gang…?».", examples: [["Jeg har bodd i Norge i fem år.", "Я живу в Норвегии уже пять лет."], ["Har du vært i Bergen?", "Ты была в Бергене?"]] },
  { key: "no.subclause_adverb", lang: "no", level: "B1", title: "ikke в придаточных", body: "После at, fordi, når, hvis, som, om короткие наречия (ikke, aldri, alltid, også) стоят ПЕРЕД глаголом. В главном предложении — после.", examples: [["…fordi jeg ikke jobber på mandag.", "…потому что я не работаю в понедельник."], ["Jeg vet at han ikke kommer.", "Я знаю, что он не придёт."]] },
  { key: "no.adjective_agreement", lang: "no", level: "B1", title: "Согласование прилагательных", body: "en stor bil, et stort hus, store biler. В определённой форме прилагательное получает -e: den store bilen, det store huset.", examples: [["Vi har et stort hus.", "У нас большой дом."], ["Den gamle mannen smiler.", "Старик улыбается."]] },
  { key: "no.possessive_sin", lang: "no", level: "B1", title: "sin / si / sitt / sine", body: "Когда предмет принадлежит подлежащему этого же предложения — sin/si/sitt/sine («свой»). hans/hennes — «его/её» (чужой).", examples: [["Hun ringte til mannen sin.", "Она позвонила своему мужу."], ["Hun ringte til mannen hennes.", "Она позвонила её (другой женщины) мужу."]] },
  { key: "no.passive", lang: "no", level: "B2", title: "Пассив: -s и bli", body: "s-пассив — для правил и инструкций (Døren låses kl. 22). bli + причастие — для конкретного события (Huset ble bygget i 1950).", examples: [["Skjemaet må fylles ut.", "Бланк нужно заполнить."], ["Hun ble invitert til møtet.", "Её пригласили на встречу."]] },
  { key: "no.connectors", lang: "no", level: "B2", title: "Связки для письма", body: "derfor (поэтому), likevel (всё же), dessuten (кроме того), på den ene siden … på den andre siden. После derfor и likevel в начале — инверсия.", examples: [["Derfor flyttet vi til Bergen.", "Поэтому мы переехали в Берген."], ["Dessuten er det billigere.", "Кроме того, это дешевле."]] },
  { key: "en.to_be", lang: "en", level: "A1", title: "Глагол to be", body: "Три формы: I am, you/we/they are, he/she/it is.", examples: [["I am tired.", "Я устала."], ["She is a teacher.", "Она учительница."]], bridge: "В норвежском одна форма «er» для всех. В английском — am / is / are." },
  { key: "en.third_person_s", lang: "en", level: "A1", title: "Present Simple и -s", body: "С he/she/it добавляется -s: I work → she works.", examples: [["I drink coffee every day.", "Я пью кофе каждый день."], ["He lives in Oslo.", "Он живёт в Осло."]], bridge: "В норвежском «jobber» одинаково для всех. В английском не забывайте -s: she works." },
  { key: "en.do_questions", lang: "en", level: "A1", title: "Вопросы с do / does", body: "Вопросы в Present Simple строятся с do (does для he/she/it); глагол остаётся без -s.", examples: [["Do you like tea?", "Ты любишь чай?"], ["Does she work here?", "Она здесь работает?"]], bridge: "В норвежском меняем порядок: Liker du te? В английском нужен помощник do." },
  { key: "en.articles", lang: "en", level: "A1", title: "Артикли a / the", body: "a (an перед гласным звуком) — «какой-то, один»; the — «тот самый».", examples: [["I have a car.", "У меня есть машина."], ["The car is red.", "(Эта) машина красная."]], bridge: "en bil = a car, bilen = the car. В английском артикль всегда ПЕРЕД словом." },
  { key: "en.word_order", lang: "en", level: "A2", title: "Порядок слов: без инверсии", body: "Подлежащее почти всегда стоит перед глаголом, даже если предложение начинается со времени или места.", examples: [["Today I work at home.", "Сегодня я работаю дома."], ["In the evening we watch TV.", "Вечером мы смотрим телевизор."]], bridge: "Главная ловушка: I dag jobber jeg → Today I work (не «Today work I»)." },
  { key: "en.past_simple", lang: "en", level: "A2", title: "Past Simple", body: "Правильные глаголы: -ed (worked, visited). Неправильные запоминаются: go – went, buy – bought, see – saw.", examples: [["We visited Bergen.", "Мы ездили в Берген."], ["She bought a book.", "Она купила книгу."]], bridge: "Как preteritum: jobbet → worked, gikk → went, kjøpte → bought." },
  { key: "en.prepositions", lang: "en", level: "A2", title: "Предлоги in / on / at", body: "at + точное время (at 5), on + день (on Monday), in + месяц/год (in May).", examples: [["See you on Monday.", "Увидимся в понедельник."], ["The shop opens at nine.", "Магазин открывается в девять."]], bridge: "på mandag = on Monday, i mai = in May, klokka ni = at nine." },
];

export const RULE_KEYS = [...GRAMMAR.map((g) => g.key), "no.word_choice", "en.word_choice", "other"];

export const ruleLabel = (key: string | null | undefined): string =>
  GRAMMAR.find((g) => g.key === key)?.title ?? (key?.endsWith("word_choice") ? "Выбор слова" : "Другое");
