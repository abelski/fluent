"""Seed script: inserts GrammarCaseRule and GrammarSentence rows for the
Lithuanian numbers grammar program (case indices 15–20).

Usage (from repo root):
    python backend/scripts/seed_numbers_grammar.py             # insert
    python backend/scripts/seed_numbers_grammar.py --reset     # delete & reinsert
    python backend/scripts/seed_numbers_grammar.py --dry-run   # count only
"""

import sys, os, argparse
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import GrammarCaseRule, GrammarSentence
from sqlmodel import Session, select


def _utcnow():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Case rules (GrammarCaseRule) for number-specific grammar (indices 15–20)
# ---------------------------------------------------------------------------

CASE_RULES = [
    {
        "case_index": 15,
        "name_ru": "Числительные: Именительный (kiek? yra)",
        "question": "Kiek? (Сколько?)",
        "usage": (
            "Сколько чего есть. Числительные 1–9 согласуются с существительным в роде: "
            "м.р. vienas, du, trys, keturi, penki, šeši, septyni, aštuoni, devyni; "
            "ж.р. viena, dvi, trys, keturios, penkios, šešios, septynios, aštuonios, "
            "devynios. С 2–9 существительное стоит в им. п. мн. ч. (keturi studentai), "
            "с vienas/viena — в ед. ч., от 10 — в род. п. мн. ч. (dešimt studentų)."
        ),
        "endings_sg": "м.р.: -i (keturi, penki, šeši…) / ж.р.: -ios (keturios, penkios, šešios…)",
        "endings_pl": "—",
        "transform": (
            "4–9: м.р. -i → ж.р. -ios (keturi→keturios, penki→penkios, devyni→devynios); "
            "особые формы: vienas→viena, du→dvi, trys — одинаково для обоих родов."
        ),
        "status": "published",
        "article_slug": "numbers-02-nouns-and-prices",
    },
    {
        "case_index": 16,
        "name_ru": "Числительные: Винительный (turiu — у меня есть)",
        "question": "Ką turiu? (Что имею?)",
        "usage": (
            "После turiu/turi (у меня/у него есть) и других переходных глаголов "
            "числительное и существительное стоят в винительном падеже: "
            "м.р. vieną, du, tris, keturis, penkis, šešis, septynis, aštuonis, devynis; "
            "ж.р. vieną, dvi, tris, keturias, penkias, šešias, septynias, aštuonias, "
            "devynias. От 10 существительное — в род. п. мн. ч.: Turiu dešimt knygų."
        ),
        "endings_sg": "м.р.: -is (keturis, penkis, šešis…) / ж.р.: -ias (keturias, penkias, šešias…)",
        "endings_pl": "—",
        "transform": (
            "Vardininkas → Galininkas. 4–9: м.р. -i→-is (keturi→keturis, penki→penkis), "
            "ж.р. -ios→-ias (keturios→keturias, penkios→penkias); trys→tris (оба рода); "
            "du/dvi не изменяются; vienas/viena→vieną."
        ),
        "status": "published",
        "article_slug": "numbers-02-nouns-and-prices",
    },
    {
        "case_index": 17,
        "name_ru": "Порядковые числительные: Творительный (каким автобусом?)",
        "question": "Kaip važiuoji? (Каким автобусом?)",
        "usage": (
            "Номер автобуса или троллейбуса ставится в творительный падеж: Važiuoju pirmu "
            "autobusu. Порядковое числительное склоняется как прилагательное мужского рода "
            "и согласуется с autobusu / troleibusu."
        ),
        "endings_sg": "-u (pirmu, antru, ketvirtu, penktu, šeštu…) / -iu (trečiu)",
        "endings_pl": "—",
        "transform": (
            "Vardininkas → Įnagininkas: -as→-u (pirmas→pirmu, aštuntas→aštuntu), "
            "-ias→-iu (trečias→trečiu). В составных числительных изменяется только "
            "последнее слово: dvidešimt pirmas→dvidešimt pirmu."
        ),
        "status": "published",
        "article_slug": "numbers-04-ordinal",
    },
    {
        "case_index": 18,
        "name_ru": "Порядковые числительные: Местный (на каком этаже? в какой аудитории?)",
        "question": "Kelintame aukšte? Kelintoje auditorijoje?",
        "usage": (
            "Где именно. Этаж (м.р. aukštas): Gyvenu pirmame aukšte. Аудитория или класс "
            "(ж.р. auditorija, klasė): Paskaita pirmoje auditorijoje. Порядковое "
            "числительное согласуется с существительным в роде."
        ),
        "endings_sg": "м.р.: -ame, -iame (pirmame, trečiame…) / ж.р.: -oje, -ioje (pirmoje, trečioje…)",
        "endings_pl": "—",
        "transform": (
            "м.р.: -as→-ame (pirmas→pirmame), -ias→-iame (trečias→trečiame); "
            "ж.р.: -a→-oje (pirma→pirmoje), -ia→-ioje (trečia→trečioje). "
            "В составных изменяется только последнее слово: šimtas pirmoje auditorijoje."
        ),
        "status": "published",
        "article_slug": "numbers-04-ordinal",
    },
    {
        "case_index": 19,
        "name_ru": "Время: Винительный (во сколько? — kelintą valandą?)",
        "question": "Kelintą valandą? (Во сколько?)",
        "usage": (
            "Во сколько? Час ставится в винительный падеж: Susitinkame antrą valandą. "
            "«Половина» — pusę + порядковое в родительном падеже, на час вперёд: "
            "pusę antros (13:30), pusę trečios (14:30). Начало и конец — nuo/iki + "
            "род. п.: nuo aštuntos valandos iki penktos."
        ),
        "endings_sg": "-ą, -ią (pirmą, antrą, trečią…) / pusę + -os, -ios (pirmos, antros, trečios…)",
        "endings_pl": "—",
        "transform": (
            "Vardininkas → Galininkas: -a→-ą (antra valanda→antrą valandą), "
            "-ia→-ią (trečia→trečią). Полчаса — Kilmininkas: -a→-os, -ia→-ios "
            "(pusę antros, pusę trečios)."
        ),
        "status": "published",
        "article_slug": "numbers-03-time",
    },
    {
        "case_index": 20,
        "name_ru": "Собирательные числительные: возраст (kiek metų?)",
        "question": "Kiek tau metų? (Сколько тебе лет?)",
        "usage": (
            "Возраст. Человек называется в дательном падеже (kam?): Kaimynui dvylika metų. "
            "1–9 лет и составные, кончающиеся на 1–9, — собирательное числительное + metai; "
            "от 10 до 19 и круглые десятки — количественное + metų."
        ),
        "endings_sg": (
            "1–9: vieni, dveji, treji, ketveri, penkeri, šešeri, septyneri, aštuoneri, "
            "devyneri + metai | 10+: dvylika, dvidešimt, penkiasdešimt… + metų"
        ),
        "endings_pl": "—",
        "transform": (
            "[кому — дат. п.] + [числительное] + metai/metų: Tetai ketveri metai (1–9 → "
            "собирательное + metai); Kaimynui dvylika metų (10+ → количественное + metų); "
            "Dėdei trisdešimt treji metai (составное на 1–9 → собирательное + metai)."
        ),
        "status": "published",
        "article_slug": "numbers-05-age-dates-years",
    },
]


# ---------------------------------------------------------------------------
# Grammar sentences (GrammarSentence) — fill-in-the-gap exercises
# ---------------------------------------------------------------------------
# Format: (case_index, display, answer_ending, full_word, russian)
# For ordinal sentences: display uses stem+___ pattern (e.g. "treč___")
# For cardinal sentences: display uses ___ for the full number word

SENTENCES = [

    # -----------------------------------------------------------------------
    # CASE 15 — Cardinal nominative (kiek? yra) — gender agreement
    # -----------------------------------------------------------------------
    # Masculine forms
    (15, "Auditorijoje yra ___ studentai.",   "keturi",    "keturi",    "В аудитории четыре студента."),
    (15, "Šeimoje yra ___ vaikai.",                "trys",      "trys",      "В семье трое детей."),
    (15, "___ broliai gyvena Vilniuje.",            "Du",        "Du",        "Два брата живут в Вильнюсе."),
    (15, "Klasėje yra ___ berniukai.",         "penki",     "penki",     "В классе пятеро мальчиков."),
    (15, "___ draugai ateina šiandien.",        "Šeši",      "Šeši",      "Шесть друзей приходят сегодня."),
    (15, "Universitete dirba ___ dėstytojai.", "septyni",   "septyni",   "В университете работают семь преподавателей."),
    (15, "___ studentai studijuoja čia.",       "Aštuoni",   "Aštuoni",   "Здесь учатся восемь студентов."),
    (15, "Autobuse sėdi ___ vyrai.",            "devyni",    "devyni",    "В автобусе сидят девять мужчин."),
    (15, "Lentynoje yra ___ žodynai.",          "du",        "du",        "На полке два словаря."),
    (15, "Gatvėje žaidžia ___ vaikai.",         "šeši",      "šeši",      "На улице играют шесть детей."),
    (15, "___ gydytojai dirba ligoninėje.",     "Aštuoni",   "Aštuoni",   "В больнице работают восемь врачей."),
    (15, "Kambaryje yra ___ langai.",           "keturi",    "keturi",    "В комнате четыре окна."),
    (15, "___ kolegos ateina į susirinkimą.",   "Trys",      "Trys",      "Три коллеги приходят на собрание."),
    (15, "Parke sėdi ___ senukai.",             "penki",     "penki",     "В парке сидят пятеро стариков."),
    (15, "Laukia ___ pacientai.",               "devyni",    "devyni",    "Ждут девять пациентов."),
    # Feminine forms
    (15, "___ seserys gyvena Kaune.",            "Dvi",       "Dvi",       "Две сестры живут в Каунасе."),
    (15, "Klasėje yra ___ mergaitės.",           "keturios",  "keturios",  "В классе четыре девочки."),
    (15, "Šeimoje yra ___ dukterys.",            "trys",      "trys",      "В семье три дочери."),
    (15, "Universitete studijuoja ___ studentės.","penkios",  "penkios",   "В университете учатся пять студенток."),
    (15, "___ tetos atvažiuoja šį savaitgalį.",  "Šešios",    "Šešios",    "Шесть тётей приезжают в эти выходные."),
    (15, "Bibliotekoje dirba ___ moterys.",      "septynios", "septynios", "В библиотеке работают семь женщин."),
    (15, "Renginyje buvo ___ merginos.",         "aštuonios", "aštuonios", "На мероприятии было восемь девушек."),
    (15, "___ pusseserės gyvena užsienyje.",     "Devynios",  "Devynios",  "Девять двоюродных сестёр живут за рубежом."),
    (15, "Kambaryje yra ___ kėdės.",             "keturios",  "keturios",  "В комнате четыре стула."),
    (15, "___ minutės liko iki pamokos.",         "Penkios",   "Penkios",   "До урока осталось пять минут."),
    (15, "Knygoje yra ___ dalys.",                "penkios",   "penkios",   "В книге пять частей."),
    (15, "___ dienos praėjo labai greitai.",      "Trys",      "Trys",      "Три дня прошли очень быстро."),
    (15, "Kambaryje yra ___ lovos.",              "dvi",       "dvi",       "В комнате две кровати."),
    (15, "Parke auga ___ liepos.",                "šešios",    "šešios",    "В парке растут шесть лип."),
    (15, "Ant stalo stovi ___ lėkštės.",           "keturios",  "keturios",  "На столе стоят четыре тарелки."),
    (15, "___ valandos praėjo greitai.",          "Dvi",       "Dvi",       "Два часа прошли быстро."),
    (15, "Miestelyje yra ___ parduotuvės.",       "penkios",   "penkios",   "В городке пять магазинов."),
    (15, "Pakuotėje yra ___ dėžutės.",            "šešios",    "šešios",    "В упаковке шесть коробочек."),
    (15, "___ seserys mokosi vienoje klasėje.",   "Aštuonios", "Aštuonios", "Восемь сестёр учатся в одном классе."),
    (15, "Lentynoje stovi ___ knygos.",           "devynios",  "devynios",  "На полке стоят девять книг."),

    # -----------------------------------------------------------------------
    # CASE 16 — Cardinal accusative (turiu — у меня есть)
    # -----------------------------------------------------------------------
    # Masculine accusative
    (16, "Jis turi ___ brolius.",               "du",        "du",        "У него два брата."),
    (16, "Turiu ___ draugus.",                  "tris",      "tris",      "У меня три друга."),
    (16, "Paulius turi ___ brolius.",            "penkis",    "penkis",    "У Паулюса пять братьев."),
    (16, "Monika turi ___ anūkus.",              "tris",      "tris",      "У Моники три внука."),
    (16, "Jie turi ___ vaikus.",                 "keturis",   "keturis",   "У них четверо детей."),
    (16, "Jonas turi ___ sūnus.",                "du",        "du",        "У Ионаса два сына."),
    (16, "Mes turime ___ bilietus.",             "keturis",   "keturis",   "У нас четыре билета."),
    (16, "Jis turi ___ brolius.",                "devynis",   "devynis",   "У него девять братьев."),
    (16, "Turiu ___ dėdes.",                     "du",        "du",        "У меня два дяди."),
    (16, "Aš turiu ___ brolius.",                "šešis",     "šešis",     "У меня шесть братьев."),
    (16, "Jis turi ___ pusbrolius.",             "aštuonis",  "aštuonis",  "У него восемь двоюродных братьев."),
    (16, "Vaikai turi ___ draugus.",             "penkis",    "penkis",    "У детей пять друзей."),
    (16, "Rūta turi ___ pusbrolius.",            "septynis",  "septynis",  "У Руты семь двоюродных братьев."),
    (16, "Jis turi ___ vaikus.",                 "devynis",   "devynis",   "У него девять детей."),
    (16, "Jie turi ___ namus.",                  "tris",      "tris",      "У них три дома."),
    (16, "Aš turiu ___ brolius.",                "aštuonis",  "aštuonis",  "У меня восемь братьев."),
    (16, "Monika turi ___ šunis.",               "tris",      "tris",      "У Моники три собаки."),
    # Feminine accusative
    (16, "Ji turi ___ seseris.",                 "dvi",       "dvi",       "У неё две сестры."),
    (16, "Rūta turi ___ tetas.",                 "keturias",  "keturias",  "У Руты четыре тёти."),
    (16, "Aš turiu ___ seseris.",                "penkias",   "penkias",   "У меня пять сестёр."),
    (16, "Ji turi ___ dukteris.",                "tris",      "tris",      "У неё три дочери."),
    (16, "Ji turi ___ kates.",                   "šešias",    "šešias",    "У неё шесть кошек."),
    (16, "Aš turiu ___ tetas.",                  "septynias", "septynias", "У меня семь тётей."),
    (16, "Andrius turi ___ knygas.",             "aštuonias", "aštuonias", "У Андрюса восемь книг."),
    (16, "Andrius turi ___ seseris.",            "devynias",  "devynias",  "У Андрюса девять сестёр."),
    (16, "Ar tu turi ___ seseris?",              "keturias",  "keturias",  "У тебя четыре сестры?"),
    (16, "Ji turi ___ pusseseres.",              "šešias",    "šešias",    "У неё шесть двоюродных сестёр."),
    (16, "Tomas turi ___ knygas.",               "šešias",    "šešias",    "У Томаса шесть книг."),
    (16, "Ji turi ___ dukteris.",                "septynias", "septynias", "У неё семь дочерей."),
    (16, "Rūta turi ___ drauges.",               "aštuonias", "aštuonias", "У Руты восемь подруг."),
    (16, "Ji turi ___ kates.",                   "devynias",  "devynias",  "У неё девять кошек."),
    (16, "Andrius turi ___ dukterį.",            "vieną",     "vieną",     "У Андрюса одна дочь."),
    (16, "Laima turi ___ seseris.",              "dvi",       "dvi",       "У Лаймы две сестры."),
    (16, "Ji turi ___ vaikus.",                  "du",        "du",        "У неё двое детей."),
    (16, "Jis turi ___ seseris.",                "keturias",  "keturias",  "У него четыре сестры."),

    # -----------------------------------------------------------------------
    # CASE 17 — Ordinal instrumental (transport — kaip važiuoji?)
    # -----------------------------------------------------------------------
    (17, "Važiuoju pirm___ autobusu.",                  "u",  "pirmu",                  "Я еду на первом автобусе."),
    (17, "Važiuoju antr___ autobusu.",                  "u",  "antru",                  "Я еду на втором автобусе."),
    (17, "Važiuoju treč___ autobusu.",                  "iu", "trečiu",                 "Я еду на третьем автобусе."),
    (17, "Važiuoju ketvirt___ troleibusu.",             "u",  "ketvirtu",               "Я еду на четвёртом троллейбусе."),
    (17, "Pas draugę važiuoju penkt___ autobusu.",      "u",  "penktu",                 "К подруге я еду на пятом автобусе."),
    (17, "Į mokyklą važiuoja šešt___ autobusu.",        "u",  "šeštu",                  "В школу едут на шестом автобусе."),
    (17, "Namo grįžtu septint___ troleibusu.",          "u",  "septintu",               "Домой возвращаюсь на седьмом троллейбусе."),
    (17, "Reikia važiuoti aštunt___ autobusu.",         "u",  "aštuntu",                "Нужно ехать на восьмом автобусе."),
    (17, "Mama važiuoja devint___ troleibusu.",         "u",  "devintu",                "Мама едет на девятом троллейбусе."),
    (17, "Į centrą važiuojame dešimt___ autobusu.",     "u",  "dešimtu",                "В центр мы едем на десятом автобусе."),
    (17, "Pas Lainą važiuosiu vienuolikt___ autobusu.", "u",  "vienuoliktu",            "К Лайне поеду на одиннадцатом автобусе."),
    (17, "Tėvai važiuoja dvylikt___ troleibusu.",       "u",  "dvyliktu",               "Родители едут на двенадцатом троллейбусе."),
    (17, "Grįžtu trylikt___ autobusu.",                 "u",  "tryliktu",               "Возвращаюсь на тринадцатом автобусе."),
    (17, "Važiuojame keturiolikt___ autobusu.",         "u",  "keturioliktu",           "Едем на четырнадцатом автобусе."),
    (17, "Senelis važiuoja penkiolikt___ troleibusu.",  "u",  "penkioliktu",            "Дедушка едет на пятнадцатом троллейбусе."),
    (17, "Į stotį reikia važiuoti šešiolikt___ autobusu.", "u", "šešioliktu",           "До вокзала нужно ехать на шестнадцатом автобусе."),
    (17, "Į universitetą važiuoju septyniolikt___ troleibusu.", "u", "septynioliktu",   "В университет я еду на семнадцатом троллейбусе."),
    (17, "Į ligoninę važiuojame aštuoniolikt___ autobusu.", "u", "aštuonioliktu",       "В больницу едем на восемнадцатом автобусе."),
    (17, "Grįžtu devyniolikt___ troleibusu.",           "u",  "devynioliktu",           "Возвращаюсь на девятнадцатом троллейбусе."),
    (17, "Į turgų reikia važiuoti dvidešimt___ autobusu.", "u", "dvidešimtu",           "На рынок нужно ехать на двадцатом автобусе."),
    (17, "Važiuoju dvidešimt pirm___ autobusu.",        "u",  "dvidešimt pirmu",        "Я еду на двадцать первом автобусе."),
    (17, "Pas draugą važiuojame trisdešimt pirm___ autobusu.", "u", "trisdešimt pirmu", "К другу едем на тридцать первом автобусе."),
    (17, "Reikia važiuoti penkiasdešimt šešt___ autobusu.", "u", "penkiasdešimt šeštu","Нужно ехать на пятьдесят шестом автобусе."),
    (17, "Kaip nuvažiuoti į centrą? — Treč___ autobusu.", "iu", "trečiu",              "Как добраться до центра? — На третьем автобусе."),
    (17, "Antr___ troleibusu važiuoji pas mamą?",       "u",  "antru",                  "Ко маме едешь на втором троллейбусе?"),
    (17, "Aš visada važiuoju šešt___ troleibusu.",      "u",  "šeštu",                  "Я всегда езжу на шестом троллейбусе."),
    (17, "Į mokyklą vaikai važiuoja treč___ autobusu.", "iu", "trečiu",                 "В школу дети едут на третьем автобусе."),
    (17, "Seneliui reikia važiuoti pirm___ troleibusu.","u",  "pirmu",                  "Дедушке нужно ехать на первом троллейбусе."),
    (17, "Pas Tomą važiuojame devint___ autobusu.",     "u",  "devintu",                "К Томасу едем на девятом автобусе."),
    (17, "Važiuok antr___ troleibusu iki galinės stotelės!", "u", "antru",              "Езжай на втором троллейбусе до конечной!"),
    (17, "Kaip nuvažiuoti į turgų? — Ketvirt___ troleibusu.", "u", "ketvirtu",         "Как до рынка? — На четвёртом троллейбусе."),
    (17, "Mes su drauge važiuojame dvylikt___ autobusu.", "u", "dvyliktu",              "Мы с подругой едем на двенадцатом автобусе."),
    (17, "Sūnus į mokyklą važiuoja vienuolikt___ troleibusu.", "u", "vienuoliktu",     "Сын едет в школу на одиннадцатом троллейбусе."),
    (17, "Duktė grįžta šešiolikt___ autobusu.",         "u",  "šešioliktu",            "Дочь возвращается на шестнадцатом автобусе."),
    (17, "Į biblioteką važiuokite trylikt___ autobusu.", "u", "tryliktu",               "В библиотеку езжайте на тринадцатом автобусе."),
    (17, "Greitai atvažiuosiu — važiuoju penkt___ autobusu.", "u", "penktu",           "Скоро приеду — еду на пятом автобусе."),
    (17, "Ar pirm___ autobusu nuvažiuosi į centrą?",    "u",  "pirmu",                  "На первом автобусе доедешь до центра?"),
    (17, "Šiandien važiuojame keturiolikt___ autobusu.", "u", "keturioliktu",           "Сегодня едем на четырнадцатом автобусе."),

    # -----------------------------------------------------------------------
    # CASE 18 — Ordinal locative (floors -ame, rooms -oje)
    # -----------------------------------------------------------------------
    # Masculine locative (aukštas)
    (18, "Gyvenu pirm___ aukšte.",                       "ame",  "pirmame",              "Я живу на первом этаже."),
    (18, "Kavinė yra antr___ aukšte.",                   "ame",  "antrame",              "Кафе на втором этаже."),
    (18, "Kabinetas yra treč___ aukšte.",                "iame", "trečiame",             "Кабинет на третьем этаже."),
    (18, "Mano butas yra ketvirt___ aukšte.",            "ame",  "ketvirtame",           "Моя квартира на четвёртом этаже."),
    (18, "Dirba penkt___ aukšte.",                       "ame",  "penktame",             "Работает на пятом этаже."),
    (18, "Gyvenu šešt___ aukšte.",                       "ame",  "šeštame",              "Я живу на шестом этаже."),
    (18, "Biblioteka yra septint___ aukšte.",             "ame",  "septintame",           "Библиотека на седьмом этаже."),
    (18, "Prezidento kabinetas yra aštunt___ aukšte.",   "ame",  "aštuntame",            "Кабинет президента на восьмом этаже."),
    (18, "Susitinkame devint___ aukšte.",                "ame",  "devintame",            "Встречаемся на девятом этаже."),
    (18, "Restoranas yra dešimt___ aukšte.",             "ame",  "dešimtame",            "Ресторан на десятом этаже."),
    (18, "Kabinetas yra vienuolikt___ aukšte.",          "ame",  "vienuoliktame",        "Кабинет на одиннадцатом этаже."),
    (18, "Jie gyvena dvylikt___ aukšte.",                "ame",  "dvyliktame",           "Они живут на двенадцатом этаже."),
    (18, "Biuras yra dvidešimt pirm___ aukšte.",         "ame",  "dvidešimt pirmame",    "Офис на двадцать первом этаже."),
    (18, "Tėvai gyvena šešt___ aukšte.",                 "ame",  "šeštame",              "Родители живут на шестом этаже."),
    (18, "Kompiuterių klasė yra ketvirt___ aukšte.",     "ame",  "ketvirtame",           "Компьютерный класс на четвёртом этаже."),
    (18, "Parduotuvė yra pirm___ aukšte.",               "ame",  "pirmame",              "Магазин на первом этаже."),
    (18, "Kelintame aukšte gyveni? — Šešt___!",          "ame",  "Šeštame",              "На каком этаже живёшь? — На шестом!"),
    (18, "Susitinkame antr___ aukšte prie lifto.",       "ame",  "antrame",              "Встречаемся на втором этаже у лифта."),
    (18, "Kabinetas yra treč___ aukšte.",                "iame", "trečiame",             "Кабинет на третьем этаже."),
    # Feminine locative (auditorija, klasė)
    (18, "Paskaita bus pirm___ auditorijoje.",           "oje",  "pirmoje",              "Лекция будет в первой аудитории."),
    (18, "Seminaras antr___ auditorijoje.",              "oje",  "antroje",              "Семинар во второй аудитории."),
    (18, "Egzaminas treč___ auditorijoje.",              "ioje", "trečioje",             "Экзамен в третьей аудитории."),
    (18, "Susirinkimas ketvirt___ auditorijoje.",        "oje",  "ketvirtoje",           "Собрание в четвёртой аудитории."),
    (18, "Paskaita penkt___ auditorijoje.",              "oje",  "penktoje",             "Лекция в пятой аудитории."),
    (18, "Egzaminas šešt___ auditorijoje.",             "oje",  "šeštoje",              "Экзамен в шестой аудитории."),
    (18, "Seminaras septint___ auditorijoje.",           "oje",  "septintoje",           "Семинар в седьмой аудитории."),
    (18, "Paskaita aštunt___ auditorijoje.",             "oje",  "aštuntoje",            "Лекция в восьмой аудитории."),
    (18, "Priėmimas devint___ auditorijoje.",            "oje",  "devintoje",            "Приём в девятой аудитории."),
    (18, "Renginys dešimt___ auditorijoje.",             "oje",  "dešimtoje",            "Мероприятие в десятой аудитории."),
    (18, "Paskaita vienuolikt___ auditorijoje.",         "oje",  "vienuoliktoje",        "Лекция в одиннадцатой аудитории."),
    (18, "Seminaras dvylikt___ auditorijoje.",           "oje",  "dvyliktoje",           "Семинар в двенадцатой аудитории."),
    (18, "Egzaminas bus šimtas pirm___ auditorijoje.",  "oje",  "šimtas pirmoje",       "Экзамен в аудитории 101."),
    (18, "Paskaita šimtas trisdešimt___ auditorijoje.", "oje",  "šimtas trisdešimtoje", "Лекция в аудитории 130."),
    (18, "Susirinkimas dvidešimt antr___ auditorijoje.","oje",  "dvidešimt antroje",    "Собрание в аудитории 22."),
    (18, "Paskaita dvidešimt pirm___ auditorijoje.",    "oje",  "dvidešimt pirmoje",    "Лекция в аудитории 21."),
    (18, "Kelintoje auditorijoje seminaras? — Antr___!", "oje", "Antroje",              "В какой аудитории семинар? — Во второй!"),
    (18, "Renginys treč___ klasėje.",                   "ioje", "trečioje",             "Мероприятие в третьем классе."),
    (18, "Egzaminas šimtas penkiasdešimt aštunt___ auditorijoje.", "oje", "šimtas penkiasdešimt aštuntoje", "Экзамен в аудитории 158."),

    # -----------------------------------------------------------------------
    # CASE 19 — Time accusative (kelintą valandą?) and half past (pusę)
    # -----------------------------------------------------------------------
    (19, "Susitinkame pirm___ valandą.",                "ą",   "pirmą",       "Встречаемся в час (13:00)."),
    (19, "Einame į teatrą antr___ valandą.",            "ą",   "antrą",       "Идём в театр в два часа (14:00)."),
    (19, "Paskaita treč___ valandą.",                   "ią",  "trečią",      "Лекция в три часа (15:00)."),
    (19, "Susitinkame ketvirt___ valandą.",             "ą",   "ketvirtą",    "Встречаемся в четыре (16:00)."),
    (19, "Filmas penkt___ valandą.",                    "ą",   "penktą",      "Фильм в пять часов (17:00)."),
    (19, "Eisime į restoraną šešt___ valandą.",         "ą",   "šeštą",       "Пойдём в ресторан в шесть (18:00)."),
    (19, "Autobusas išvyksta septint___ valandą.",      "ą",   "septintą",    "Автобус отправляется в семь (19:00)."),
    (19, "Darbo diena prasideda aštunt___ valandą.",    "ą",   "aštuntą",     "Рабочий день начинается в восемь (8:00)."),
    (19, "Susitinkame devint___ valandą.",              "ą",   "devintą",     "Встречаемся в девять (9:00)."),
    (19, "Paskaita baigiasi dešimt___ valandą.",        "ą",   "dešimtą",     "Лекция заканчивается в десять (10:00)."),
    (19, "Pietaujame vienuolikt___ valandą.",           "ą",   "vienuoliktą", "Обедаем в одиннадцать (11:00)."),
    (19, "Susitinkame dvylikt___ valandą.",             "ą",   "dvyliktą",    "Встречаемся в двенадцать (12:00)."),
    (19, "Traukinys išvyksta trylikt___ valandą.",      "ą",   "tryliktą",    "Поезд отправляется в тринадцать (13:00)."),
    (19, "Paskaita keturiolikt___ valandą.",            "ą",   "keturioliktą","Лекция в четырнадцать (14:00)."),
    (19, "Eisime į kiną penkiolikt___ valandą.",        "ą",   "penkioliktą", "Пойдём в кино в пятнадцать (15:00)."),
    (19, "Susitinkame šešiolikt___ valandą.",           "ą",   "šešioliktą",  "Встречаемся в шестнадцать (16:00)."),
    (19, "Darbas baigiasi septyniolikt___ valandą.",    "ą",   "septynioliktą","Работа заканчивается в семнадцать (17:00)."),
    (19, "Vakarienė aštuoniolikt___ valandą.",          "ą",   "aštuonioliktą","Ужин в восемнадцать (18:00)."),
    (19, "Spektaklis prasideda devyniolikt___ valandą.","ą",   "devynioliktą","Спектакль начинается в девятнадцать (19:00)."),
    (19, "Susitinkame dvidešimt___ valandą.",           "ą",   "dvidešimtą",  "Встречаемся в двадцать (20:00)."),
    (19, "Traukinys atvyksta dvidešimt pirm___ valandą.","ą",  "dvidešimt pirmą","Поезд прибывает в двадцать один (21:00)."),
    # Half past (pusę + genitive)
    (19, "Susitinkame pusę antr___.",                  "os",  "antros",      "Встречаемся в половину второго (13:30)."),
    (19, "Paskaita prasideda pusę treč___.",           "ios", "trečios",     "Лекция начинается в половину третьего (14:30)."),
    (19, "Susitinkame pusę ketvirt___.",               "os",  "ketvirtos",   "Встречаемся в половину четвёртого (15:30)."),
    (19, "Eisime pusę penkt___.",                      "os",  "penktos",     "Пойдём в половину пятого (16:30)."),
    (19, "Filmas pusę šešt___.",                       "os",  "šeštos",      "Фильм в половину шестого (17:30)."),
    (19, "Susitinkame pusę septint___.",               "os",  "septintos",   "Встречаемся в половину седьмого (18:30)."),
    (19, "Vakarienė pusę aštunt___.",                  "os",  "aštuntos",    "Ужин в половину восьмого (19:30)."),
    (19, "Spektaklis pusę devint___.",                  "os",  "devintos",    "Спектакль в половину девятого (20:30)."),
    (19, "Susitinkame pusę dešimt___.",                "os",  "dešimtos",    "Встречаемся в половину десятого (21:30)."),
    (19, "Pusryčiai pusę aštunt___.",                  "os",  "aštuntos",    "Завтрак в половину восьмого (7:30)."),
    (19, "Pietūs pusę pirm___.",                       "os",  "pirmos",      "Обед в половину первого (12:30)."),
    (19, "Susitinkame pusę treč___.",                  "ios", "trečios",     "Встречаемся в половину третьего (14:30)."),
    # Nuo/iki + genitive
    (19, "Bankas dirba nuo aštunt___ valandos.",        "os",  "aštuntos",    "Банк работает с восьми часов."),
    (19, "Dirbu iki penkt___ valandos.",                "os",  "penktos",     "Я работаю до пяти часов."),
    (19, "Parduotuvė dirba iki devint___ valandos.",    "os",  "devintos",    "Магазин работает до девяти часов."),
    (19, "Paskaita trunka nuo treč___ valandos.",       "ios", "trečios",     "Лекция длится с трёх часов."),

    # -----------------------------------------------------------------------
    # CASE 20 — Collective numbers (age — kiek metų?)
    # -----------------------------------------------------------------------
    # Collective 1–9 (nominative "metai")
    (20, "Man ___ metai. (2)",                          "dveji",               "dveji",               "Мне два года."),
    (20, "Draugui ___ metai. (7)",                      "septyneri",           "septyneri",           "Другу семь лет."),
    (20, "Sūnui ___ metai. (5)",                        "penkeri",             "penkeri",             "Сыну пять лет."),
    (20, "Dukteriai ___ metai. (9)",                    "devyneri",            "devyneri",            "Дочери девять лет."),
    (20, "Seseriai ___ metai. (3)",                     "treji",               "treji",               "Сестре три года."),
    (20, "Broliui ___ metai. (4)",                      "ketveri",             "ketveri",             "Брату четыре года."),
    (20, "Man ___ metai. (6)",                          "šešeri",              "šešeri",              "Мне шесть лет."),
    (20, "Katei ___ metai. (1)",                        "vieni",               "vieni",               "Кошке один год."),
    (20, "Man ___ metai. (8)",                          "aštuoneri",           "aštuoneri",           "Мне восемь лет."),
    (20, "Tau ___ metai. (2)",                          "dveji",               "dveji",               "Тебе два года."),
    # 10+ (genitive "metų")
    (20, "Sūnui ___ metų. (10)",                        "dešimt",              "dešimt",              "Сыну десять лет."),
    (20, "Draugui ___ metų. (15)",                      "penkiolika",          "penkiolika",          "Другу пятнадцать лет."),
    (20, "Mamai ___ metų. (40)",                        "keturiasdešimt",      "keturiasdešimt",      "Маме сорок лет."),
    (20, "Draugui ___ metų. (17)",                      "septyniolika",        "septyniolika",        "Другу семнадцать лет."),
    (20, "Senelei ___ metų. (70)",                      "septyniasdešimt",     "septyniasdešimt",     "Бабушке семьдесят лет."),
    # Compound (dvidešimt + collective)
    (20, "Man ___ metai. (21)",                         "dvidešimt vieni",     "dvidešimt vieni",     "Мне двадцать один год."),
    (20, "Draugei ___ metai. (25)",                     "dvidešimt penkeri",   "dvidešimt penkeri",   "Подруге двадцать пять лет."),
    (20, "Broliui ___ metai. (32)",                     "trisdešimt dveji",    "trisdešimt dveji",    "Брату тридцать два года."),
    (20, "Seneliui ___ metai. (65)",                    "šešiasdešimt penkeri","šešiasdešimt penkeri","Дедушке шестьдесят пять лет."),
    (20, "Mamai ___ metai. (41)",                       "keturiasdešimt vieni","keturiasdešimt vieni","Маме сорок один год."),
    # Dative person blanks
    (20, "Kiek ___ metų? (mama)",                       "mamai",               "mamai",               "Сколько лет маме?"),
    (20, "Kiek ___ metų? (tėtis)",                      "tėčiui",              "tėčiui",              "Сколько лет папе?"),
    (20, "Kiek ___ metų? (sūnus)",                      "sūnui",               "sūnui",               "Сколько лет сыну?"),
    (20, "Kiek ___ metų? (duktė)",                      "dukteriai",           "dukteriai",           "Сколько лет дочери?"),
    (20, "Kiek ___ metų? (sesuo)",                      "seseriai",            "seseriai",            "Сколько лет сестре?"),
    (20, "Kiek ___ metų? (brolis)",                     "broliui",             "broliui",             "Сколько лет брату?"),
    (20, "Kiek ___ metų? (senelis)",                    "seneliui",            "seneliui",            "Сколько лет дедушке?"),
    (20, "Kiek ___ metų? (senelė)",                     "senelei",             "senelei",             "Сколько лет бабушке?"),
    (20, "Kiek ___ metų? (draugas)",                    "draugui",             "draugui",             "Сколько лет другу?"),
    (20, "Kiek ___ metų? (draugė)",                     "draugei",             "draugei",             "Сколько лет подруге?"),
    (20, "___ trisdešimt dveji metai. (jis)",           "Jam",                 "Jam",                 "Ему тридцать два года."),
    (20, "___ penkiolika metų. (ji)",                   "Jai",                 "Jai",                 "Ей пятнадцать лет."),
    (20, "___ šešiasdešimt penkeri metai. (aš)",        "Man",                 "Man",                 "Мне шестьдесят пять лет."),
    (20, "___ dvidešimt vieni metai. (tu)",              "Tau",                 "Tau",                 "Тебе двадцать один год."),
    (20, "___ devyneri metai. (duktė)",                  "Dukteriai",           "Dukteriai",           "Дочери девять лет."),
    (20, "___ dveji metai. (šuo)",                       "Šuniui",              "Šuniui",              "Собаке два года."),
    (20, "Kiek ___ metų? (katė)",                        "katei",               "katei",               "Сколько лет кошке?"),
    (20, "Kiek ___ metų? (pusbrolis)",                   "pusbroliui",          "pusbroliui",          "Сколько лет двоюродному брату?"),
]


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed(reset: bool = False) -> None:
    with Session(engine) as session:

        # -- Case Rules --
        for rule_data in CASE_RULES:
            ci = rule_data["case_index"]
            existing = session.exec(
                select(GrammarCaseRule).where(GrammarCaseRule.case_index == ci)
            ).first()
            if existing and not reset:
                print(f"  Skip existing case rule: index={ci}")
                continue
            if existing and reset:
                session.delete(existing)
                session.flush()

            rule = GrammarCaseRule(**rule_data)
            session.add(rule)
            print(f"  Inserted case rule: index={ci} — {rule_data['name_ru']}")

        session.flush()

        # -- Sentences --
        case_indices = {r["case_index"] for r in CASE_RULES}
        if reset:
            existing_sents = session.exec(
                select(GrammarSentence).where(GrammarSentence.case_index.in_(case_indices))
            ).all()
            print(f"  Deleting {len(existing_sents)} existing sentences…")
            for s in existing_sents:
                session.delete(s)
            session.flush()

        counts: dict[int, int] = {}
        for (ci, display, ending, full_word, russian) in SENTENCES:
            sentence = GrammarSentence(
                case_index=ci,
                display=display,
                answer_ending=ending,
                full_word=full_word,
                russian=russian,
                use_in_basic=True,
                use_in_advanced=True,
                use_in_practice=True,
            )
            session.add(sentence)
            counts[ci] = counts.get(ci, 0) + 1

        session.commit()

        for ci, cnt in sorted(counts.items()):
            print(f"  Inserted {cnt} sentences for case {ci}")

        total = sum(counts.values())
        print(f"\nDone — {len(CASE_RULES)} case rules, {total} sentences across {len(counts)} cases.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Delete existing and reinsert")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no DB writes")
    args = parser.parse_args()

    if args.dry_run:
        counts = {}
        for (ci, *_) in SENTENCES:
            counts[ci] = counts.get(ci, 0) + 1
        print(f"Dry run — {len(CASE_RULES)} case rules, {sum(counts.values())} sentences:")
        for ci, cnt in sorted(counts.items()):
            print(f"  case {ci}: {cnt} sentences")
        return

    seed(reset=args.reset)


if __name__ == "__main__":
    main()
