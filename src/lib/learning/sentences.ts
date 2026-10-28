/**
 * «Как строить предложения»: notes on sentence building. Each pattern takes one sentence through its variations
 * (statement, negation, question, time first, inside a subordinate clause …), split into parts by role, so the
 * page can colour the parts and the builder can shuffle them for «Собери сама». Content is written by hand.
 */
export type Role = "S" | "V" | "V2" | "NEG" | "O" | "T" | "P" | "Q" | "C" | "X";
export const ROLE_LABEL: Record<Role, string> = {
  S: "подлежащее",
  V: "глагол",
  V2: "второй глагол",
  NEG: "ikke / not",
  O: "дополнение",
  T: "время",
  P: "место",
  Q: "вопрос. слово",
  C: "союз",
  X: "другое",
};

export interface Variation {
  label: string;
  parts: [string, Role][];
  ru: string;
  note?: string;
}

export interface SentencePattern {
  key: string;
  lang: "no" | "en";
  level: string;
  title: string;
  /** the idea in one or two sentences */
  idea: string;
  /** the formula, in roles */
  formula: Role[];
  variations: Variation[];
  tips: string[];
  /** grammar rules this pattern practises */
  rules: string[];
}

/** The sentence of a variation as text: parts joined, final punctuation kept with the last part. */
export const sentenceOf = (v: Variation) => v.parts.map(([t]) => t).join(" ").replace(/\s+([,.?!])/g, "$1");

export const PATTERNS: SentencePattern[] = [
  // ---------- Norwegian ----------
  {
    key: "no.p.basic",
    lang: "no",
    level: "A1",
    title: "Простое предложение",
    idea: "Норвежское предложение держится на глаголе: он всегда второй. Сначала кто, потом что делает, потом остальное: что, где, когда.",
    formula: ["S", "V", "NEG", "O", "P", "T"],
    variations: [
      { label: "Утверждение", parts: [["Jeg", "S"], ["jobber", "V"], ["i Oslo", "P"], ["i dag.", "T"]], ru: "Я работаю в Осло сегодня." },
      { label: "Отрицание", parts: [["Jeg", "S"], ["jobber", "V"], ["ikke", "NEG"], ["i Oslo", "P"], ["i dag.", "T"]], ru: "Я не работаю в Осло сегодня.", note: "ikke — сразу после глагола." },
      { label: "Вопрос «да/нет»", parts: [["Jobber", "V"], ["du", "S"], ["i Oslo", "P"], ["i dag?", "T"]], ru: "Ты работаешь в Осло сегодня?", note: "Глагол встаёт первым." },
      { label: "Вопрос со словом", parts: [["Hvor", "Q"], ["jobber", "V"], ["du", "S"], ["i dag?", "T"]], ru: "Где ты работаешь сегодня?" },
      { label: "Время первым", parts: [["I dag", "T"], ["jobber", "V"], ["jeg", "S"], ["i Oslo.", "P"]], ru: "Сегодня я работаю в Осло.", note: "Глагол всё равно второй — подлежащее уходит за него." },
      { label: "Внутри «fordi»", parts: [["…fordi", "C"], ["jeg", "S"], ["ikke", "NEG"], ["jobber", "V"], ["i Oslo", "P"], ["i dag.", "T"]], ru: "…потому что я не работаю в Осло сегодня.", note: "В придаточном ikke перед глаголом." },
    ],
    tips: ["Сначала место, потом время: i Oslo i dag.", "Глагол на 2-м месте — это «место», а не «второе слово»: «I dag» — одна часть."],
    rules: ["no.v2_inversion", "no.negation_ikke", "no.questions", "no.subclause_adverb"],
  },
  {
    key: "no.p.questions",
    lang: "no",
    level: "A1",
    title: "Как задать вопрос",
    idea: "Два типа вопросов: без вопросительного слова (глагол первым) и с ним (слово, потом глагол, потом подлежащее).",
    formula: ["Q", "V", "S", "O"],
    variations: [
      { label: "Да/нет", parts: [["Kommer", "V"], ["du", "S"], ["i morgen?", "T"]], ru: "Ты придёшь завтра?" },
      { label: "Когда", parts: [["Når", "Q"], ["kommer", "V"], ["du?", "S"]], ru: "Когда ты придёшь?" },
      { label: "Почему не", parts: [["Hvorfor", "Q"], ["kommer", "V"], ["du", "S"], ["ikke?", "NEG"]], ru: "Почему ты не приходишь?", note: "ikke после подлежащего, когда оно короткое." },
      { label: "Что", parts: [["Hva", "Q"], ["spiser", "V"], ["dere", "S"], ["til middag?", "O"]], ru: "Что вы едите на ужин?" },
      { label: "Кто (подлежащее)", parts: [["Hvem", "Q"], ["kommer", "V"], ["i kveld?", "T"]], ru: "Кто придёт вечером?", note: "Hvem — само подлежащее, поэтому второго подлежащего нет." },
      { label: "Вежливая просьба", parts: [["Kan", "V"], ["du", "S"], ["hjelpe", "V2"], ["meg?", "O"]], ru: "Ты можешь мне помочь?" },
    ],
    tips: ["Hvordan — как, hvor — где, hvor mye — сколько (о деньгах), hvor mange — сколько (штук), hvor lenge — как долго."],
    rules: ["no.questions"],
  },
  {
    key: "no.p.time_first",
    lang: "no",
    level: "A2",
    title: "Начать со времени или места (инверсия)",
    idea: "Если первым стоит не подлежащее, а время, место или «поэтому», глагол остаётся вторым, а подлежащее встаёт после него.",
    formula: ["T", "V", "S", "O", "P"],
    variations: [
      { label: "Обычный порядок", parts: [["Vi", "S"], ["spiste", "V"], ["fisk", "O"], ["i går.", "T"]], ru: "Мы ели рыбу вчера." },
      { label: "Время первым", parts: [["I går", "T"], ["spiste", "V"], ["vi", "S"], ["fisk.", "O"]], ru: "Вчера мы ели рыбу." },
      { label: "Место первым", parts: [["Hjemme", "P"], ["snakker", "V"], ["vi", "S"], ["russisk.", "O"]], ru: "Дома мы говорим по-русски." },
      { label: "«Поэтому» первым", parts: [["Derfor", "X"], ["kom", "V"], ["jeg", "S"], ["for sent.", "X"]], ru: "Поэтому я опоздала." },
      { label: "С отрицанием", parts: [["I morgen", "T"], ["jobber", "V"], ["jeg", "S"], ["ikke.", "NEG"]], ru: "Завтра я не работаю.", note: "ikke после подлежащего." },
      { label: "С двумя глаголами", parts: [["Om sommeren", "T"], ["vil", "V"], ["vi", "S"], ["reise", "V2"], ["til Ukraina.", "P"]], ru: "Летом мы хотим поехать в Украину." },
    ],
    tips: ["Проверка: найдите глагол — перед ним ровно одна часть.", "Самая частая ошибка: «I går jeg jobbet» → правильно «I går jobbet jeg»."],
    rules: ["no.v2_inversion"],
  },
  {
    key: "no.p.modal",
    lang: "no",
    level: "A2",
    title: "Два глагола: kan, må, vil, skal + инфинитив",
    idea: "Первый глагол (модальный) стоит на 2-м месте, второй — инфинитив без å — уходит дальше. ikke — между ними.",
    formula: ["S", "V", "NEG", "V2", "O"],
    variations: [
      { label: "Утверждение", parts: [["Jeg", "S"], ["kan", "V"], ["snakke", "V2"], ["norsk.", "O"]], ru: "Я умею говорить по-норвежски." },
      { label: "Отрицание", parts: [["Jeg", "S"], ["kan", "V"], ["ikke", "NEG"], ["snakke", "V2"], ["norsk.", "O"]], ru: "Я не умею говорить по-норвежски." },
      { label: "Вопрос", parts: [["Kan", "V"], ["du", "S"], ["snakke", "V2"], ["norsk?", "O"]], ru: "Ты говоришь по-норвежски?" },
      { label: "Время первым", parts: [["Nå", "T"], ["må", "V"], ["jeg", "S"], ["gå.", "V2"]], ru: "Теперь мне нужно идти." },
      { label: "В придаточном", parts: [["…at", "C"], ["hun", "S"], ["ikke", "NEG"], ["kan", "V"], ["komme.", "V2"]], ru: "…что она не может прийти." },
    ],
    tips: ["После kan, må, vil, skal, bør — без å.", "Hun kan komme, hun kan ikke komme — ikke никогда не после второго глагола."],
    rules: ["no.modal_verbs", "no.infinitive_aa"],
  },
  {
    key: "no.p.perfect",
    lang: "no",
    level: "B1",
    title: "Perfektum: har + причастие",
    idea: "har стоит на 2-м месте как обычный глагол, причастие уходит дальше. ikke — между har и причастием.",
    formula: ["S", "V", "NEG", "V2", "P", "T"],
    variations: [
      { label: "Утверждение", parts: [["Jeg", "S"], ["har", "V"], ["bodd", "V2"], ["i Norge", "P"], ["i tre år.", "T"]], ru: "Я живу в Норвегии уже три года." },
      { label: "Отрицание", parts: [["Jeg", "S"], ["har", "V"], ["ikke", "NEG"], ["vært", "V2"], ["i Bergen.", "P"]], ru: "Я не была в Бергене." },
      { label: "Вопрос", parts: [["Har", "V"], ["du", "S"], ["vært", "V2"], ["i Bergen?", "P"]], ru: "Ты была в Бергене?" },
      { label: "Как долго", parts: [["Hvor lenge", "Q"], ["har", "V"], ["du", "S"], ["bodd", "V2"], ["her?", "P"]], ru: "Как долго ты здесь живёшь?" },
      { label: "В придаточном", parts: [["…fordi", "C"], ["jeg", "S"], ["ikke", "NEG"], ["har", "V"], ["hatt", "V2"], ["tid.", "O"]], ru: "…потому что у меня не было времени." },
    ],
    tips: ["Опыт и «уже столько-то» — perfektum; конкретное «вчера», «в 2020 году» — preteritum."],
    rules: ["no.perfect_tense", "no.subclause_adverb"],
  },
  {
    key: "no.p.future",
    lang: "no",
    level: "A2",
    title: "О будущем: skal, kommer til å",
    idea: "skal — план, kommer til å — прогноз. Оба работают как модальный глагол: на 2-м месте, инфинитив дальше.",
    formula: ["S", "V", "NEG", "V2", "T"],
    variations: [
      { label: "План", parts: [["Jeg", "S"], ["skal", "V"], ["begynne", "V2"], ["på kurs", "O"], ["i morgen.", "T"]], ru: "Завтра я начинаю курс." },
      { label: "Не планирую", parts: [["Jeg", "S"], ["skal", "V"], ["ikke", "NEG"], ["jobbe", "V2"], ["på lørdag.", "T"]], ru: "В субботу я не работаю." },
      { label: "Вопрос о планах", parts: [["Skal", "V"], ["du", "S"], ["reise", "V2"], ["i sommer?", "T"]], ru: "Ты поедешь куда-нибудь летом?" },
      { label: "Прогноз", parts: [["Det", "S"], ["kommer til å", "V"], ["regne.", "V2"]], ru: "Будет дождь." },
      { label: "Время первым", parts: [["Neste uke", "T"], ["skal", "V"], ["vi", "S"], ["flytte.", "V2"]], ru: "На следующей неделе мы переезжаем." },
    ],
    tips: ["Можно и просто настоящим временем + слово времени: Jeg reiser i morgen."],
    rules: ["no.future", "no.modal_verbs"],
  },
  {
    key: "no.p.subclause",
    lang: "no",
    level: "B1",
    title: "Придаточные: at, fordi, når, hvis, om",
    idea: "В придаточном порядок «прямой»: союз, подлежащее, (ikke), глагол. Если придаточное стоит первым, в главной части сразу глагол.",
    formula: ["C", "S", "NEG", "V", "O"],
    variations: [
      { label: "at — что", parts: [["Jeg tror", "X"], ["at", "C"], ["hun", "S"], ["kommer.", "V"]], ru: "Я думаю, что она придёт." },
      { label: "at + ikke", parts: [["Jeg tror", "X"], ["at", "C"], ["hun", "S"], ["ikke", "NEG"], ["kommer.", "V"]], ru: "Я думаю, что она не придёт." },
      { label: "fordi — потому что", parts: [["Jeg er sliten", "X"], ["fordi", "C"], ["jeg", "S"], ["har jobbet", "V"], ["mye.", "X"]], ru: "Я устала, потому что много работала." },
      { label: "når — когда (первым)", parts: [["Når", "C"], ["jeg", "S"], ["kommer", "V"], ["hjem,", "P"], ["lager", "V"], ["jeg", "S"], ["middag.", "O"]], ru: "Когда я прихожу домой, я готовлю ужин.", note: "Придаточное первым = одна часть, поэтому дальше сразу глагол." },
      { label: "hvis — если", parts: [["Hvis", "C"], ["det", "S"], ["regner,", "V"], ["blir", "V"], ["vi", "S"], ["hjemme.", "P"]], ru: "Если будет дождь, мы останемся дома." },
    ],
    tips: ["ikke, aldri, alltid, også — перед глаголом в придаточном.", "fordi — объяснение причины; for — тоже «потому что», но с порядком главного предложения."],
    rules: ["no.subclause_adverb", "no.v2_inversion"],
  },
  {
    key: "no.p.coordination",
    lang: "no",
    level: "A2",
    title: "Два предложения: og, men, eller, så, for",
    idea: "og, men, eller, så и for соединяют два главных предложения — порядок в обоих обычный, инверсии после союза нет.",
    formula: ["S", "V", "C", "S", "V"],
    variations: [
      { label: "og — и", parts: [["Jeg", "S"], ["jobber,", "V"], ["og", "C"], ["mannen min", "S"], ["studerer.", "V"]], ru: "Я работаю, а мой муж учится." },
      { label: "men — но", parts: [["Jeg", "S"], ["vil gjerne", "V"], ["komme,", "V2"], ["men", "C"], ["jeg", "S"], ["har", "V"], ["ikke", "NEG"], ["tid.", "O"]], ru: "Я бы с удовольствием пришла, но у меня нет времени." },
      { label: "så — поэтому", parts: [["Det", "S"], ["regnet,", "V"], ["så", "C"], ["vi", "S"], ["ble", "V"], ["hjemme.", "P"]], ru: "Шёл дождь, поэтому мы остались дома.", note: "После «så» — обычный порядок, а после «derfor» — инверсия." },
      { label: "for — ведь", parts: [["Vi", "S"], ["blir", "V"], ["hjemme,", "P"], ["for", "C"], ["det", "S"], ["regner.", "V"]], ru: "Мы остаёмся дома, ведь идёт дождь." },
    ],
    tips: ["Сравните: «…, så vi ble hjemme» и «Derfor ble vi hjemme»."],
    rules: ["no.connectors", "no.v2_inversion"],
  },
  {
    key: "no.p.indirect",
    lang: "no",
    level: "B1",
    title: "Вопрос внутри предложения",
    idea: "«Я не знаю, где…», «Мне интересно, придёт ли…» — вопрос становится придаточным: прямой порядок слов, ikke перед глаголом.",
    formula: ["X", "Q", "S", "NEG", "V"],
    variations: [
      { label: "ли = om", parts: [["Jeg lurer på", "X"], ["om", "C"], ["du", "S"], ["kan", "V"], ["hjelpe meg.", "V2"]], ru: "Мне интересно, можешь ли ты мне помочь." },
      { label: "где", parts: [["Vet du", "X"], ["hvor", "Q"], ["stasjonen", "S"], ["er?", "V"]], ru: "Ты знаешь, где вокзал?", note: "Не «hvor er stasjonen» — это прямой вопрос." },
      { label: "что (дополнение)", parts: [["Kan du si", "X"], ["hva", "Q"], ["klokka", "S"], ["er?", "V"]], ru: "Можешь сказать, который час?" },
      { label: "что (подлежащее)", parts: [["Jeg vet ikke", "X"], ["hva", "Q"], ["som", "C"], ["skjedde.", "V"]], ru: "Я не знаю, что случилось.", note: "Если hva/hvem — подлежащее, добавляется som." },
      { label: "ли + не", parts: [["Jeg vet ikke", "X"], ["om", "C"], ["han", "S"], ["ikke", "NEG"], ["vil.", "V"]], ru: "Я не знаю, не хочет ли он." },
    ],
    tips: ["Прямой вопрос: Hvor bor hun? Косвенный: Vet du hvor hun bor?"],
    rules: ["no.indirect_question", "no.subclause_adverb"],
  },
  {
    key: "no.p.relative",
    lang: "no",
    level: "B1",
    title: "«Который»: som",
    idea: "som присоединяет описание к человеку или вещи. Внутри — порядок придаточного: ikke перед глаголом.",
    formula: ["S", "C", "V", "X", "V"],
    variations: [
      { label: "som — подлежащее", parts: [["Kvinnen", "S"], ["som", "C"], ["bor", "V"], ["ved siden av,", "P"], ["er", "V"], ["lege.", "O"]], ru: "Женщина, которая живёт по соседству, — врач." },
      { label: "som — дополнение", parts: [["Boka", "S"], ["som", "C"], ["jeg", "S"], ["leser,", "V"], ["er", "V"], ["spennende.", "O"]], ru: "Книга, которую я читаю, интересная." },
      { label: "без som", parts: [["Boka", "S"], ["jeg", "S"], ["leser,", "V"], ["er", "V"], ["spennende.", "O"]], ru: "Книга, которую я читаю, интересная.", note: "Если som — дополнение, его можно опустить." },
      { label: "с ikke", parts: [["Det er en film", "X"], ["som", "C"], ["jeg", "S"], ["ikke", "NEG"], ["har sett.", "V"]], ru: "Это фильм, который я не видела." },
    ],
    tips: ["som никогда не опускают, когда оно само подлежащее: «kvinnen som bor her»."],
    rules: ["no.relative_som"],
  },
  {
    key: "no.p.passive",
    lang: "no",
    level: "B2",
    title: "Пассив: что делается, а не кто делает",
    idea: "s-пассив — правила, инструкции, привычное (åpnes, selges). bli + причастие — конкретное событие (ble bygget).",
    formula: ["S", "V", "V2", "T"],
    variations: [
      { label: "s-пассив", parts: [["Butikken", "S"], ["åpnes", "V"], ["klokka ni.", "T"]], ru: "Магазин открывается в девять." },
      { label: "с модальным", parts: [["Skjemaet", "S"], ["må", "V"], ["fylles ut.", "V2"]], ru: "Бланк нужно заполнить." },
      { label: "bli — событие", parts: [["Huset", "S"], ["ble", "V"], ["bygget", "V2"], ["i 1950.", "T"]], ru: "Дом построили в 1950 году." },
      { label: "кем", parts: [["Hun", "S"], ["ble", "V"], ["invitert", "V2"], ["av sjefen.", "X"]], ru: "Её пригласил начальник." },
    ],
    tips: ["«Здесь говорят по-норвежски» — Det snakkes norsk her."],
    rules: ["no.passive"],
  },
  {
    key: "no.p.imperative",
    lang: "no",
    level: "A2",
    title: "Просьбы и указания",
    idea: "Повелительная форма — основа глагола: kom, ring, ta. Запрет — ikke перед глаголом. Вежливее — вопросом с kan.",
    formula: ["V", "O"],
    variations: [
      { label: "Просьба", parts: [["Ring", "V"], ["meg", "O"], ["i kveld.", "T"]], ru: "Позвони мне вечером." },
      { label: "Запрет", parts: [["Ikke", "NEG"], ["vær", "V"], ["redd.", "X"]], ru: "Не бойся." },
      { label: "Вежливо", parts: [["Kan", "V"], ["du", "S"], ["lukke", "V2"], ["døra?", "O"]], ru: "Можешь закрыть дверь?" },
      { label: "Очень вежливо", parts: [["Vær så snill og", "X"], ["lukk", "V"], ["døra.", "O"]], ru: "Пожалуйста, закрой дверь." },
    ],
    tips: ["Норвежцы чаще просят вопросом: «Kan du…?», «Gidder du…?» (неформально)."],
    rules: ["no.imperative"],
  },
  {
    key: "no.p.conditional",
    lang: "no",
    level: "B2",
    title: "Если бы…: условие",
    idea: "Реальное условие — настоящее время в обеих частях. Нереальное — hadde в условии, ville в результате. Условие первым → в главной части сразу глагол.",
    formula: ["C", "S", "V", "V", "S"],
    variations: [
      { label: "Реальное", parts: [["Hvis", "C"], ["jeg", "S"], ["får", "V"], ["jobben,", "O"], ["kjøper", "V"], ["jeg", "S"], ["bil.", "O"]], ru: "Если я получу работу, я куплю машину." },
      { label: "Нереальное", parts: [["Hvis", "C"], ["jeg", "S"], ["hadde", "V"], ["tid,", "O"], ["ville", "V"], ["jeg", "S"], ["reist", "V2"], ["mer.", "X"]], ru: "Если бы у меня было время, я бы больше путешествовала." },
      { label: "Результат первым", parts: [["Jeg", "S"], ["ville", "V"], ["hjulpet", "V2"], ["deg", "O"], ["hvis", "C"], ["jeg", "S"], ["kunne.", "V"]], ru: "Я бы тебе помогла, если бы могла." },
    ],
    tips: ["«ville + причастие» (ville reist) звучит естественнее в разговоре, чем «ville ha reist»."],
    rules: ["no.conditional", "no.v2_inversion"],
  },
  // ---------- English ----------
  {
    key: "en.p.basic",
    lang: "en",
    level: "A1",
    title: "Простое предложение",
    idea: "Английский держится на порядке: подлежащее, глагол, остальное. Он не меняется, даже если начать со времени. Вопросы и отрицания — с помощником do.",
    formula: ["S", "V", "O", "P", "T"],
    variations: [
      { label: "Утверждение", parts: [["I", "S"], ["work", "V"], ["in Oslo", "P"], ["today.", "T"]], ru: "Я работаю в Осло сегодня." },
      { label: "Отрицание", parts: [["I", "S"], ["don't", "NEG"], ["work", "V"], ["in Oslo.", "P"]], ru: "Я не работаю в Осло." },
      { label: "Вопрос", parts: [["Do", "V"], ["you", "S"], ["work", "V2"], ["in Oslo?", "P"]], ru: "Ты работаешь в Осло?" },
      { label: "Вопрос со словом", parts: [["Where", "Q"], ["do", "V"], ["you", "S"], ["work?", "V2"]], ru: "Где ты работаешь?" },
      { label: "Время первым", parts: [["Today", "T"], ["I", "S"], ["work", "V"], ["at home.", "P"]], ru: "Сегодня я работаю дома.", note: "Без инверсии — в отличие от норвежского «I dag jobber jeg»." },
      { label: "he / she", parts: [["She", "S"], ["works", "V"], ["at a hospital.", "P"]], ru: "Она работает в больнице.", note: "С he/she/it глагол получает -s." },
    ],
    tips: ["does для he/she/it: Does she work here? She doesn't work here."],
    rules: ["en.word_order", "en.do_questions", "en.third_person_s"],
  },
  {
    key: "en.p.to_be",
    lang: "en",
    level: "A1",
    title: "Предложения с to be",
    idea: "С am / is / are помощник do не нужен: в вопросе глагол сам встаёт вперёд, not — сразу после него.",
    formula: ["S", "V", "NEG", "X"],
    variations: [
      { label: "Утверждение", parts: [["I", "S"], ["am", "V"], ["tired.", "X"]], ru: "Я устала." },
      { label: "Отрицание", parts: [["She", "S"], ["isn't", "V"], ["at home.", "P"]], ru: "Её нет дома." },
      { label: "Вопрос", parts: [["Are", "V"], ["you", "S"], ["ready?", "X"]], ru: "Ты готова?" },
      { label: "Вопрос со словом", parts: [["Where", "Q"], ["is", "V"], ["the station?", "S"]], ru: "Где вокзал?" },
    ],
    tips: ["Не «I tired» — без am нельзя: I am tired."],
    rules: ["en.to_be"],
  },
  {
    key: "en.p.continuous",
    lang: "en",
    level: "A1",
    title: "Что происходит сейчас: am + -ing",
    idea: "am / is / are + глагол с -ing — действие прямо сейчас. Вопрос и отрицание — как с to be.",
    formula: ["S", "V", "V2", "O"],
    variations: [
      { label: "Сейчас", parts: [["I", "S"], ["am", "V"], ["cooking", "V2"], ["dinner.", "O"]], ru: "Я готовлю ужин." },
      { label: "Не сейчас", parts: [["She", "S"], ["isn't", "V"], ["working", "V2"], ["today.", "T"]], ru: "Сегодня она не работает." },
      { label: "Вопрос", parts: [["Are", "V"], ["you", "S"], ["listening?", "V2"]], ru: "Ты слушаешь?" },
      { label: "Что ты делаешь", parts: [["What", "Q"], ["are", "V"], ["you", "S"], ["doing?", "V2"]], ru: "Что ты делаешь?" },
    ],
    tips: ["Обычно, всегда — Present Simple (I cook every day); сейчас — Continuous (I'm cooking now)."],
    rules: ["en.present_continuous"],
  },
  {
    key: "en.p.past",
    lang: "en",
    level: "A2",
    title: "О прошлом: Past Simple и did",
    idea: "В утверждении — прошедшая форма (worked, went). В вопросе и отрицании — did, а глагол возвращается в обычную форму.",
    formula: ["S", "V", "O", "T"],
    variations: [
      { label: "Утверждение", parts: [["We", "S"], ["visited", "V"], ["Bergen", "O"], ["last year.", "T"]], ru: "Мы ездили в Берген в прошлом году." },
      { label: "Неправильный глагол", parts: [["I", "S"], ["went", "V"], ["home", "P"], ["early.", "T"]], ru: "Я рано ушла домой." },
      { label: "Отрицание", parts: [["I", "S"], ["didn't", "NEG"], ["see", "V"], ["him.", "O"]], ru: "Я его не видела.", note: "didn't + see, не «didn't saw»." },
      { label: "Вопрос", parts: [["Did", "V"], ["you", "S"], ["sleep", "V2"], ["well?", "X"]], ru: "Ты хорошо спала?" },
      { label: "Где / когда", parts: [["Where", "Q"], ["did", "V"], ["you", "S"], ["buy", "V2"], ["it?", "O"]], ru: "Где ты это купила?" },
    ],
    tips: ["Самые нужные неправильные: go–went, see–saw, buy–bought, have–had, make–made, take–took, come–came."],
    rules: ["en.past_simple", "en.past_questions"],
  },
  {
    key: "en.p.modal",
    lang: "en",
    level: "A1",
    title: "can, must, should + глагол",
    idea: "После can, must, should, will — глагол без to. Вопрос — модальный глагол вперёд, отрицание — not после него.",
    formula: ["S", "V", "NEG", "V2", "O"],
    variations: [
      { label: "Утверждение", parts: [["I", "S"], ["can", "V"], ["speak", "V2"], ["Norwegian.", "O"]], ru: "Я говорю по-норвежски." },
      { label: "Отрицание", parts: [["She", "S"], ["can't", "V"], ["come", "V2"], ["today.", "T"]], ru: "Она не может прийти сегодня." },
      { label: "Вопрос", parts: [["Can", "V"], ["you", "S"], ["help", "V2"], ["me?", "O"]], ru: "Ты можешь мне помочь?" },
      { label: "Совет", parts: [["You", "S"], ["should", "V"], ["rest.", "V2"]], ru: "Тебе стоит отдохнуть." },
    ],
    tips: ["Как в норвежском: kan, må, bør + глагол без å/to."],
    rules: ["en.can_modal"],
  },
  {
    key: "en.p.future",
    lang: "en",
    level: "A2",
    title: "О будущем: going to и will",
    idea: "going to — план, will — решение сейчас, обещание, прогноз.",
    formula: ["S", "V", "V2", "O", "T"],
    variations: [
      { label: "План", parts: [["I'm", "S"], ["going to", "V"], ["visit", "V2"], ["my sister", "O"], ["in May.", "T"]], ru: "В мае я собираюсь навестить сестру." },
      { label: "Решение сейчас", parts: [["I'll", "S"], ["call", "V2"], ["you", "O"], ["later.", "T"]], ru: "Я тебе позвоню позже." },
      { label: "Отрицание", parts: [["We", "S"], ["aren't", "V"], ["going to", "V"], ["travel", "V2"], ["this year.", "T"]], ru: "В этом году мы не поедем." },
      { label: "Вопрос", parts: [["Will", "V"], ["it", "S"], ["rain", "V2"], ["tomorrow?", "T"]], ru: "Завтра будет дождь?" },
    ],
    tips: ["skal ≈ going to, kommer til å ≈ will."],
    rules: ["en.future"],
  },
  {
    key: "en.p.there_is",
    lang: "en",
    level: "A1",
    title: "Есть / находится: there is / there are",
    idea: "«Где-то есть что-то» — there is (один), there are (несколько). Вопрос — Is there…? Are there…?",
    formula: ["X", "V", "O", "P"],
    variations: [
      { label: "Один", parts: [["There", "X"], ["is", "V"], ["a shop", "O"], ["near my house.", "P"]], ru: "Рядом с моим домом есть магазин." },
      { label: "Несколько", parts: [["There", "X"], ["are", "V"], ["two bedrooms.", "O"]], ru: "Там две спальни." },
      { label: "Нет", parts: [["There", "X"], ["isn't", "V"], ["any milk.", "O"]], ru: "Молока нет." },
      { label: "Вопрос", parts: [["Is", "V"], ["there", "X"], ["a bus", "O"], ["to the airport?", "P"]], ru: "Есть автобус до аэропорта?" },
    ],
    tips: ["Как «det er / det finnes»: Det er en butikk her."],
    rules: ["en.there_is", "en.countable"],
  },
  {
    key: "en.p.subclause",
    lang: "en",
    level: "A2",
    title: "because, when, if: два предложения в одном",
    idea: "После союза — обычный порядок. Если придаточное первое, ставится запятая, а дальше тоже обычный порядок, без инверсии.",
    formula: ["C", "S", "V", "S", "V"],
    variations: [
      { label: "because", parts: [["I", "S"], ["stay", "V"], ["at home", "P"], ["because", "C"], ["I", "S"], ["am", "V"], ["ill.", "X"]], ru: "Я дома, потому что болею." },
      { label: "when первым", parts: [["When", "C"], ["I", "S"], ["come", "V"], ["home,", "P"], ["I", "S"], ["cook", "V"], ["dinner.", "O"]], ru: "Когда я прихожу домой, я готовлю ужин.", note: "Норвежское «lager jeg» → английское «I cook»." },
      { label: "if", parts: [["If", "C"], ["it", "S"], ["rains,", "V"], ["we", "S"], ["will stay", "V"], ["inside.", "P"]], ru: "Если пойдёт дождь, мы останемся дома." },
      { label: "that", parts: [["I", "S"], ["think", "V"], ["that", "C"], ["she", "S"], ["is", "V"], ["right.", "X"]], ru: "Я думаю, что она права." },
    ],
    tips: ["После if о будущем — настоящее время: If it rains (не «if it will rain»)."],
    rules: ["en.subclauses", "en.word_order"],
  },
  {
    key: "en.p.perfect",
    lang: "en",
    level: "B1",
    title: "Present Perfect: опыт и «уже столько-то»",
    idea: "have / has + третья форма. Опыт (Have you ever…?) и то, что длится до сих пор (for, since).",
    formula: ["S", "V", "NEG", "V2", "P", "T"],
    variations: [
      { label: "До сих пор", parts: [["I", "S"], ["have", "V"], ["lived", "V2"], ["in Norway", "P"], ["for three years.", "T"]], ru: "Я живу в Норвегии уже три года." },
      { label: "Опыт", parts: [["Have", "V"], ["you", "S"], ["ever", "X"], ["been", "V2"], ["to London?", "P"]], ru: "Ты когда-нибудь была в Лондоне?" },
      { label: "Ещё нет", parts: [["She", "S"], ["hasn't", "V"], ["finished", "V2"], ["yet.", "T"]], ru: "Она ещё не закончила." },
      { label: "Как долго", parts: [["How long", "Q"], ["have", "V"], ["you", "S"], ["worked", "V2"], ["here?", "P"]], ru: "Как долго ты здесь работаешь?" },
    ],
    tips: ["for + период (for two years), since + начало (since 2020).", "Как perfektum: Jeg har bodd her i tre år."],
    rules: ["en.present_perfect"],
  },
];

export const patternOf = (key: string) => PATTERNS.find((p) => p.key === key);
