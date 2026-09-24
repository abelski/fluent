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
        "name_en": "Numbers: Nominative (kiek? yra)",
        "question_en": "Kiek? (How many?)",
        "usage_en": "How many of something there are. Numbers 1–9 agree with the noun in gender: m. vienas, du, trys, keturi, penki, šeši, septyni, aštuoni, devyni; f. viena, dvi, trys, keturios, penkios, šešios, septynios, aštuonios, devynios. With 2–9 the noun is in the nominative plural (keturi studentai), with vienas/viena in the singular, and from 10 on in the genitive plural (dešimt studentų).",
        "endings_sg_en": "m.: -i (keturi, penki, šeši…) / f.: -ios (keturios, penkios, šešios…)",
        "endings_pl_en": "—",
        "transform_en": "4–9: m. -i → f. -ios (keturi→keturios, penki→penkios, devyni→devynios); special forms: vienas→viena, du→dvi; trys is the same for both genders.",
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
        "name_en": "Numbers: Accusative (turiu — I have)",
        "question_en": "Ką turiu? (What do I have?)",
        "usage_en": "After turiu/turi (I have / he has) and other transitive verbs, both the number and the noun go in the accusative: m. vieną, du, tris, keturis, penkis, šešis, septynis, aštuonis, devynis; f. vieną, dvi, tris, keturias, penkias, šešias, septynias, aštuonias, devynias. From 10 on the noun is in the genitive plural: Turiu dešimt knygų.",
        "endings_sg_en": "m.: -is (keturis, penkis, šešis…) / f.: -ias (keturias, penkias, šešias…)",
        "endings_pl_en": "—",
        "transform_en": "Vardininkas → Galininkas. 4–9: m. -i→-is (keturi→keturis, penki→penkis), f. -ios→-ias (keturios→keturias, penkios→penkias); trys→tris (both genders); du/dvi do not change; vienas/viena→vieną.",
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
        "name_en": "Ordinal numbers: Instrumental (which bus?)",
        "question_en": "Kaip važiuoji? (Which bus do you take?)",
        "usage_en": "The bus or trolleybus number goes in the instrumental: Važiuoju pirmu autobusu. The ordinal declines like a masculine adjective and agrees with autobusu / troleibusu.",
        "endings_sg_en": "-u (pirmu, antru, ketvirtu, penktu, šeštu…) / -iu (trečiu)",
        "endings_pl_en": "—",
        "transform_en": "Vardininkas → Įnagininkas: -as→-u (pirmas→pirmu, aštuntas→aštuntu), -ias→-iu (trečias→trečiu). In compound numbers only the last word changes: dvidešimt pirmas→dvidešimt pirmu.",
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
        "name_en": "Ordinal numbers: Locative (which floor? which room?)",
        "question_en": "Kelintame aukšte? Kelintoje auditorijoje? (On which floor? In which room?)",
        "usage_en": "Where exactly. Floor (m. aukštas): Gyvenu pirmame aukšte. Lecture room or classroom (f. auditorija, klasė): Paskaita pirmoje auditorijoje. The ordinal agrees with the noun in gender.",
        "endings_sg_en": "m.: -ame, -iame (pirmame, trečiame…) / f.: -oje, -ioje (pirmoje, trečioje…)",
        "endings_pl_en": "—",
        "transform_en": "m.: -as→-ame (pirmas→pirmame), -ias→-iame (trečias→trečiame); f.: -a→-oje (pirma→pirmoje), -ia→-ioje (trečia→trečioje). In compound numbers only the last word changes: šimtas pirmoje auditorijoje.",
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
        "name_en": "Time: Accusative (at what time? — kelintą valandą?)",
        "question_en": "Kelintą valandą? (At what time?)",
        "usage_en": "At what time? The hour goes in the accusative: Susitinkame antrą valandą. \"Half past\" is pusę + the ordinal in the genitive, counted toward the next hour: pusę antros (13:30), pusę trečios (14:30). Start and end: nuo/iki + genitive: nuo aštuntos valandos iki penktos.",
        "endings_sg_en": "-ą, -ią (pirmą, antrą, trečią…) / pusę + -os, -ios (pirmos, antros, trečios…)",
        "endings_pl_en": "—",
        "transform_en": "Vardininkas → Galininkas: -a→-ą (antra valanda→antrą valandą), -ia→-ią (trečia→trečią). Half hours use Kilmininkas: -a→-os, -ia→-ios (pusę antros, pusę trečios).",
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
        "name_en": "Collective numbers: age (kiek metų?)",
        "question_en": "Kiek tau metų? (How old are you?)",
        "usage_en": "Age. The person goes in the dative (kam?): Kaimynui dvylika metų. For 1–9 years and compounds ending in 1–9, use a collective number + metai; for 10–19 and round tens, a cardinal number + metų.",
        "endings_sg_en": "1–9: vieni, dveji, treji, ketveri, penkeri, šešeri, septyneri, aštuoneri, devyneri + metai | 10+: dvylika, dvidešimt, penkiasdešimt… + metų",
        "endings_pl_en": "—",
        "transform_en": "[to whom — dative] + [number] + metai/metų: Tetai ketveri metai (1–9 → collective + metai); Kaimynui dvylika metų (10+ → cardinal + metų); Dėdei trisdešimt treji metai (compound ending in 1–9 → collective + metai).",
        "status": "published",
        "article_slug": "numbers-05-age-dates-years",
    },
]


# ---------------------------------------------------------------------------
# Grammar sentences (GrammarSentence) — fill-in-the-gap exercises
# ---------------------------------------------------------------------------
# Format: (case_index, display, answer_ending, full_word, russian, english)
# For ordinal sentences: display uses stem+___ pattern (e.g. "treč___")
# For cardinal sentences: display uses ___ for the full number word

SENTENCES = [

    # -----------------------------------------------------------------------
    # CASE 15 — Cardinal nominative (kiek? yra) — gender agreement
    # -----------------------------------------------------------------------
    # Masculine forms
    (15, "Auditorijoje yra ___ studentai.",   "keturi",    "keturi",    "В аудитории четыре студента.", "There are four students in the lecture hall."),
    (15, "Šeimoje yra ___ vaikai.",                "trys",      "trys",      "В семье трое детей.", "There are three children in the family."),
    (15, "___ broliai gyvena Vilniuje.",            "Du",        "Du",        "Два брата живут в Вильнюсе.", "Two brothers live in Vilnius."),
    (15, "Klasėje yra ___ berniukai.",         "penki",     "penki",     "В классе пятеро мальчиков.", "There are five boys in the class."),
    (15, "___ draugai ateina šiandien.",        "Šeši",      "Šeši",      "Шесть друзей приходят сегодня.", "Six friends are coming today."),
    (15, "Universitete dirba ___ dėstytojai.", "septyni",   "septyni",   "В университете работают семь преподавателей.", "Seven lecturers work at the university."),
    (15, "___ studentai studijuoja čia.",       "Aštuoni",   "Aštuoni",   "Здесь учатся восемь студентов.", "Eight students study here."),
    (15, "Autobuse sėdi ___ vyrai.",            "devyni",    "devyni",    "В автобусе сидят девять мужчин.", "Nine men are sitting on the bus."),
    (15, "Lentynoje yra ___ žodynai.",          "du",        "du",        "На полке два словаря.", "There are two dictionaries on the shelf."),
    (15, "Gatvėje žaidžia ___ vaikai.",         "šeši",      "šeši",      "На улице играют шесть детей.", "Six children are playing in the street."),
    (15, "___ gydytojai dirba ligoninėje.",     "Aštuoni",   "Aštuoni",   "В больнице работают восемь врачей.", "Eight doctors work at the hospital."),
    (15, "Kambaryje yra ___ langai.",           "keturi",    "keturi",    "В комнате четыре окна.", "There are four windows in the room."),
    (15, "___ kolegos ateina į susirinkimą.",   "Trys",      "Trys",      "Три коллеги приходят на собрание.", "Three colleagues are coming to the meeting."),
    (15, "Parke sėdi ___ senukai.",             "penki",     "penki",     "В парке сидят пятеро стариков.", "Five old men are sitting in the park."),
    (15, "Laukia ___ pacientai.",               "devyni",    "devyni",    "Ждут девять пациентов.", "Nine patients are waiting."),
    # Feminine forms
    (15, "___ seserys gyvena Kaune.",            "Dvi",       "Dvi",       "Две сестры живут в Каунасе.", "Two sisters live in Kaunas."),
    (15, "Klasėje yra ___ mergaitės.",           "keturios",  "keturios",  "В классе четыре девочки.", "There are four girls in the class."),
    (15, "Šeimoje yra ___ dukterys.",            "trys",      "trys",      "В семье три дочери.", "There are three daughters in the family."),
    (15, "Universitete studijuoja ___ studentės.","penkios",  "penkios",   "В университете учатся пять студенток.", "Five female students study at the university."),
    (15, "___ tetos atvažiuoja šį savaitgalį.",  "Šešios",    "Šešios",    "Шесть тётей приезжают в эти выходные.", "Six aunts are coming this weekend."),
    (15, "Bibliotekoje dirba ___ moterys.",      "septynios", "septynios", "В библиотеке работают семь женщин.", "Seven women work at the library."),
    (15, "Renginyje buvo ___ merginos.",         "aštuonios", "aštuonios", "На мероприятии было восемь девушек.", "There were eight girls at the event."),
    (15, "___ pusseserės gyvena užsienyje.",     "Devynios",  "Devynios",  "Девять двоюродных сестёр живут за рубежом.", "Nine female cousins live abroad."),
    (15, "Kambaryje yra ___ kėdės.",             "keturios",  "keturios",  "В комнате четыре стула.", "There are four chairs in the room."),
    (15, "___ minutės liko iki pamokos.",         "Penkios",   "Penkios",   "До урока осталось пять минут.", "Five minutes were left before the lesson."),
    (15, "Knygoje yra ___ dalys.",                "penkios",   "penkios",   "В книге пять частей.", "The book has five parts."),
    (15, "___ dienos praėjo labai greitai.",      "Trys",      "Trys",      "Три дня прошли очень быстро.", "Three days went by very quickly."),
    (15, "Kambaryje yra ___ lovos.",              "dvi",       "dvi",       "В комнате две кровати.", "There are two beds in the room."),
    (15, "Parke auga ___ liepos.",                "šešios",    "šešios",    "В парке растут шесть лип.", "Six linden trees grow in the park."),
    (15, "Ant stalo stovi ___ lėkštės.",           "keturios",  "keturios",  "На столе стоят четыре тарелки.", "Four plates are on the table."),
    (15, "___ valandos praėjo greitai.",          "Dvi",       "Dvi",       "Два часа прошли быстро.", "Two hours went by quickly."),
    (15, "Miestelyje yra ___ parduotuvės.",       "penkios",   "penkios",   "В городке пять магазинов.", "There are five stores in the town."),
    (15, "Pakuotėje yra ___ dėžutės.",            "šešios",    "šešios",    "В упаковке шесть коробочек.", "There are six small boxes in the package."),
    (15, "___ seserys mokosi vienoje klasėje.",   "Aštuonios", "Aštuonios", "Восемь сестёр учатся в одном классе.", "Eight sisters study in the same class."),
    (15, "Lentynoje stovi ___ knygos.",           "devynios",  "devynios",  "На полке стоят девять книг.", "Nine books stand on the shelf."),

    # -----------------------------------------------------------------------
    # CASE 16 — Cardinal accusative (turiu — у меня есть)
    # -----------------------------------------------------------------------
    # Masculine accusative
    (16, "Jis turi ___ brolius.",               "du",        "du",        "У него два брата.", "He has two brothers."),
    (16, "Turiu ___ draugus.",                  "tris",      "tris",      "У меня три друга.", "I have three friends."),
    (16, "Paulius turi ___ brolius.",            "penkis",    "penkis",    "У Паулюса пять братьев.", "Paulius has five brothers."),
    (16, "Monika turi ___ anūkus.",              "tris",      "tris",      "У Моники три внука.", "Monika has three grandsons."),
    (16, "Jie turi ___ vaikus.",                 "keturis",   "keturis",   "У них четверо детей.", "They have four children."),
    (16, "Jonas turi ___ sūnus.",                "du",        "du",        "У Ионаса два сына.", "Jonas has two sons."),
    (16, "Mes turime ___ bilietus.",             "keturis",   "keturis",   "У нас четыре билета.", "We have four tickets."),
    (16, "Jis turi ___ brolius.",                "devynis",   "devynis",   "У него девять братьев.", "He has nine brothers."),
    (16, "Turiu ___ dėdes.",                     "du",        "du",        "У меня два дяди.", "I have two uncles."),
    (16, "Aš turiu ___ brolius.",                "šešis",     "šešis",     "У меня шесть братьев.", "I have six brothers."),
    (16, "Jis turi ___ pusbrolius.",             "aštuonis",  "aštuonis",  "У него восемь двоюродных братьев.", "He has eight cousins."),
    (16, "Vaikai turi ___ draugus.",             "penkis",    "penkis",    "У детей пять друзей.", "The children have five friends."),
    (16, "Rūta turi ___ pusbrolius.",            "septynis",  "septynis",  "У Руты семь двоюродных братьев.", "Rūta has seven cousins."),
    (16, "Jis turi ___ vaikus.",                 "devynis",   "devynis",   "У него девять детей.", "He has nine children."),
    (16, "Jie turi ___ namus.",                  "tris",      "tris",      "У них три дома.", "They have three houses."),
    (16, "Aš turiu ___ brolius.",                "aštuonis",  "aštuonis",  "У меня восемь братьев.", "I have eight brothers."),
    (16, "Monika turi ___ šunis.",               "tris",      "tris",      "У Моники три собаки.", "Monika has three dogs."),
    # Feminine accusative
    (16, "Ji turi ___ seseris.",                 "dvi",       "dvi",       "У неё две сестры.", "She has two sisters."),
    (16, "Rūta turi ___ tetas.",                 "keturias",  "keturias",  "У Руты четыре тёти.", "Rūta has four aunts."),
    (16, "Aš turiu ___ seseris.",                "penkias",   "penkias",   "У меня пять сестёр.", "I have five sisters."),
    (16, "Ji turi ___ dukteris.",                "tris",      "tris",      "У неё три дочери.", "She has three daughters."),
    (16, "Ji turi ___ kates.",                   "šešias",    "šešias",    "У неё шесть кошек.", "She has six cats."),
    (16, "Aš turiu ___ tetas.",                  "septynias", "septynias", "У меня семь тётей.", "I have seven aunts."),
    (16, "Andrius turi ___ knygas.",             "aštuonias", "aštuonias", "У Андрюса восемь книг.", "Andrius has eight books."),
    (16, "Andrius turi ___ seseris.",            "devynias",  "devynias",  "У Андрюса девять сестёр.", "Andrius has nine sisters."),
    (16, "Ar tu turi ___ seseris?",              "keturias",  "keturias",  "У тебя четыре сестры?", "Do you have four sisters?"),
    (16, "Ji turi ___ pusseseres.",              "šešias",    "šešias",    "У неё шесть двоюродных сестёр.", "She has six cousins."),
    (16, "Tomas turi ___ knygas.",               "šešias",    "šešias",    "У Томаса шесть книг.", "Tomas has six books."),
    (16, "Ji turi ___ dukteris.",                "septynias", "septynias", "У неё семь дочерей.", "She has seven daughters."),
    (16, "Rūta turi ___ drauges.",               "aštuonias", "aštuonias", "У Руты восемь подруг.", "Rūta has eight friends."),
    (16, "Ji turi ___ kates.",                   "devynias",  "devynias",  "У неё девять кошек.", "She has nine cats."),
    (16, "Andrius turi ___ dukterį.",            "vieną",     "vieną",     "У Андрюса одна дочь.", "Andrius has one daughter."),
    (16, "Laima turi ___ seseris.",              "dvi",       "dvi",       "У Лаймы две сестры.", "Laima has two sisters."),
    (16, "Ji turi ___ vaikus.",                  "du",        "du",        "У неё двое детей.", "She has two children."),
    (16, "Jis turi ___ seseris.",                "keturias",  "keturias",  "У него четыре сестры.", "He has four sisters."),

    # -----------------------------------------------------------------------
    # CASE 17 — Ordinal instrumental (transport — kaip važiuoji?)
    # -----------------------------------------------------------------------
    (17, "Važiuoju pirm___ autobusu.",                  "u",  "pirmu",                  "Я еду на первом автобусе.", "I take the number 1 bus."),
    (17, "Važiuoju antr___ autobusu.",                  "u",  "antru",                  "Я еду на втором автобусе.", "I take the number 2 bus."),
    (17, "Važiuoju treč___ autobusu.",                  "iu", "trečiu",                 "Я еду на третьем автобусе.", "I take the number 3 bus."),
    (17, "Važiuoju ketvirt___ troleibusu.",             "u",  "ketvirtu",               "Я еду на четвёртом троллейбусе.", "I take the number 4 trolleybus."),
    (17, "Pas draugę važiuoju penkt___ autobusu.",      "u",  "penktu",                 "К подруге я еду на пятом автобусе.", "I take the number 5 bus to my friend's place."),
    (17, "Į mokyklą važiuoja šešt___ autobusu.",        "u",  "šeštu",                  "В школу едут на шестом автобусе.", "They take the number 6 bus to school."),
    (17, "Namo grįžtu septint___ troleibusu.",          "u",  "septintu",               "Домой возвращаюсь на седьмом троллейбусе.", "I go home on the number 7 trolleybus."),
    (17, "Reikia važiuoti aštunt___ autobusu.",         "u",  "aštuntu",                "Нужно ехать на восьмом автобусе.", "You need to take the number 8 bus."),
    (17, "Mama važiuoja devint___ troleibusu.",         "u",  "devintu",                "Мама едет на девятом троллейбусе.", "Mom takes the number 9 trolleybus."),
    (17, "Į centrą važiuojame dešimt___ autobusu.",     "u",  "dešimtu",                "В центр мы едем на десятом автобусе.", "We take the number 10 bus to the city center."),
    (17, "Pas Lainą važiuosiu vienuolikt___ autobusu.", "u",  "vienuoliktu",            "К Лайне поеду на одиннадцатом автобусе.", "I'll take the number 11 bus to Laina's."),
    (17, "Tėvai važiuoja dvylikt___ troleibusu.",       "u",  "dvyliktu",               "Родители едут на двенадцатом троллейбусе.", "My parents take the number 12 trolleybus."),
    (17, "Grįžtu trylikt___ autobusu.",                 "u",  "tryliktu",               "Возвращаюсь на тринадцатом автобусе.", "I go back on the number 13 bus."),
    (17, "Važiuojame keturiolikt___ autobusu.",         "u",  "keturioliktu",           "Едем на четырнадцатом автобусе.", "We are taking the number 14 bus."),
    (17, "Senelis važiuoja penkiolikt___ troleibusu.",  "u",  "penkioliktu",            "Дедушка едет на пятнадцатом троллейбусе.", "Grandpa takes the number 15 trolleybus."),
    (17, "Į stotį reikia važiuoti šešiolikt___ autobusu.", "u", "šešioliktu",           "До вокзала нужно ехать на шестнадцатом автобусе.", "To get to the station, you need to take the number 16 bus."),
    (17, "Į universitetą važiuoju septyniolikt___ troleibusu.", "u", "septynioliktu",   "В университет я еду на семнадцатом троллейбусе.", "I take the number 17 trolleybus to the university."),
    (17, "Į ligoninę važiuojame aštuoniolikt___ autobusu.", "u", "aštuonioliktu",       "В больницу едем на восемнадцатом автобусе.", "We take the number 18 bus to the hospital."),
    (17, "Grįžtu devyniolikt___ troleibusu.",           "u",  "devynioliktu",           "Возвращаюсь на девятнадцатом троллейбусе.", "I go back on the number 19 trolleybus."),
    (17, "Į turgų reikia važiuoti dvidešimt___ autobusu.", "u", "dvidešimtu",           "На рынок нужно ехать на двадцатом автобусе.", "To get to the market, you need to take the number 20 bus."),
    (17, "Važiuoju dvidešimt pirm___ autobusu.",        "u",  "dvidešimt pirmu",        "Я еду на двадцать первом автобусе.", "I take the number 21 bus."),
    (17, "Pas draugą važiuojame trisdešimt pirm___ autobusu.", "u", "trisdešimt pirmu", "К другу едем на тридцать первом автобусе.", "We take the number 31 bus to our friend's place."),
    (17, "Reikia važiuoti penkiasdešimt šešt___ autobusu.", "u", "penkiasdešimt šeštu","Нужно ехать на пятьдесят шестом автобусе.", "You need to take the number 56 bus."),
    (17, "Kaip nuvažiuoti į centrą? — Treč___ autobusu.", "iu", "trečiu",              "Как добраться до центра? — На третьем автобусе.", "How do I get to the center? — On the number 3 bus."),
    (17, "Antr___ troleibusu važiuoji pas mamą?",       "u",  "antru",                  "Ко маме едешь на втором троллейбусе?", "Are you taking the number 2 trolleybus to Mom's?"),
    (17, "Aš visada važiuoju šešt___ troleibusu.",      "u",  "šeštu",                  "Я всегда езжу на шестом троллейбусе.", "I always take the number 6 trolleybus."),
    (17, "Į mokyklą vaikai važiuoja treč___ autobusu.", "iu", "trečiu",                 "В школу дети едут на третьем автобусе.", "The children take the number 3 bus to school."),
    (17, "Seneliui reikia važiuoti pirm___ troleibusu.","u",  "pirmu",                  "Дедушке нужно ехать на первом троллейбусе.", "Grandpa needs to take the number 1 trolleybus."),
    (17, "Pas Tomą važiuojame devint___ autobusu.",     "u",  "devintu",                "К Томасу едем на девятом автобусе.", "We take the number 9 bus to Tomas's place."),
    (17, "Važiuok antr___ troleibusu iki galinės stotelės!", "u", "antru",              "Езжай на втором троллейбусе до конечной!", "Take the number 2 trolleybus to the last stop!"),
    (17, "Kaip nuvažiuoti į turgų? — Ketvirt___ troleibusu.", "u", "ketvirtu",         "Как до рынка? — На четвёртом троллейбусе.", "How do I get to the market? — On the number 4 trolleybus."),
    (17, "Mes su drauge važiuojame dvylikt___ autobusu.", "u", "dvyliktu",              "Мы с подругой едем на двенадцатом автобусе.", "My friend and I are taking the number 12 bus."),
    (17, "Sūnus į mokyklą važiuoja vienuolikt___ troleibusu.", "u", "vienuoliktu",     "Сын едет в школу на одиннадцатом троллейбусе.", "My son takes the number 11 trolleybus to school."),
    (17, "Duktė grįžta šešiolikt___ autobusu.",         "u",  "šešioliktu",            "Дочь возвращается на шестнадцатом автобусе.", "My daughter comes back on the number 16 bus."),
    (17, "Į biblioteką važiuokite trylikt___ autobusu.", "u", "tryliktu",               "В библиотеку езжайте на тринадцатом автобусе.", "Take the number 13 bus to the library."),
    (17, "Greitai atvažiuosiu — važiuoju penkt___ autobusu.", "u", "penktu",           "Скоро приеду — еду на пятом автобусе.", "I'll be there soon — I'm on the number 5 bus."),
    (17, "Ar pirm___ autobusu nuvažiuosi į centrą?",    "u",  "pirmu",                  "На первом автобусе доедешь до центра?", "Will the number 1 bus get you to the center?"),
    (17, "Šiandien važiuojame keturiolikt___ autobusu.", "u", "keturioliktu",           "Сегодня едем на четырнадцатом автобусе.", "Today we are taking the number 14 bus."),

    # -----------------------------------------------------------------------
    # CASE 18 — Ordinal locative (floors -ame, rooms -oje)
    # -----------------------------------------------------------------------
    # Masculine locative (aukštas)
    (18, "Gyvenu pirm___ aukšte.",                       "ame",  "pirmame",              "Я живу на первом этаже.", "I live on the first floor."),
    (18, "Kavinė yra antr___ aukšte.",                   "ame",  "antrame",              "Кафе на втором этаже.", "The café is on the second floor."),
    (18, "Kabinetas yra treč___ aukšte.",                "iame", "trečiame",             "Кабинет на третьем этаже.", "The office is on the third floor."),
    (18, "Mano butas yra ketvirt___ aukšte.",            "ame",  "ketvirtame",           "Моя квартира на четвёртом этаже.", "My apartment is on the fourth floor."),
    (18, "Dirba penkt___ aukšte.",                       "ame",  "penktame",             "Работает на пятом этаже.", "He works on the fifth floor."),
    (18, "Gyvenu šešt___ aukšte.",                       "ame",  "šeštame",              "Я живу на шестом этаже.", "I live on the sixth floor."),
    (18, "Biblioteka yra septint___ aukšte.",             "ame",  "septintame",           "Библиотека на седьмом этаже.", "The library is on the seventh floor."),
    (18, "Prezidento kabinetas yra aštunt___ aukšte.",   "ame",  "aštuntame",            "Кабинет президента на восьмом этаже.", "The president's office is on the eighth floor."),
    (18, "Susitinkame devint___ aukšte.",                "ame",  "devintame",            "Встречаемся на девятом этаже.", "We meet on the ninth floor."),
    (18, "Restoranas yra dešimt___ aukšte.",             "ame",  "dešimtame",            "Ресторан на десятом этаже.", "The restaurant is on the tenth floor."),
    (18, "Kabinetas yra vienuolikt___ aukšte.",          "ame",  "vienuoliktame",        "Кабинет на одиннадцатом этаже.", "The office is on the eleventh floor."),
    (18, "Jie gyvena dvylikt___ aukšte.",                "ame",  "dvyliktame",           "Они живут на двенадцатом этаже.", "They live on the twelfth floor."),
    (18, "Biuras yra dvidešimt pirm___ aukšte.",         "ame",  "dvidešimt pirmame",    "Офис на двадцать первом этаже.", "The office is on the twenty-first floor."),
    (18, "Tėvai gyvena šešt___ aukšte.",                 "ame",  "šeštame",              "Родители живут на шестом этаже.", "My parents live on the sixth floor."),
    (18, "Kompiuterių klasė yra ketvirt___ aukšte.",     "ame",  "ketvirtame",           "Компьютерный класс на четвёртом этаже.", "The computer lab is on the fourth floor."),
    (18, "Parduotuvė yra pirm___ aukšte.",               "ame",  "pirmame",              "Магазин на первом этаже.", "The store is on the first floor."),
    (18, "Kelintame aukšte gyveni? — Šešt___!",          "ame",  "Šeštame",              "На каком этаже живёшь? — На шестом!", "Which floor do you live on? — The sixth!"),
    (18, "Susitinkame antr___ aukšte prie lifto.",       "ame",  "antrame",              "Встречаемся на втором этаже у лифта.", "We're meeting on the second floor by the elevator."),
    (18, "Kabinetas yra treč___ aukšte.",                "iame", "trečiame",             "Кабинет на третьем этаже.", "The office is on the third floor."),
    # Feminine locative (auditorija, klasė)
    (18, "Paskaita bus pirm___ auditorijoje.",           "oje",  "pirmoje",              "Лекция будет в первой аудитории.", "The lecture will be in room 1."),
    (18, "Seminaras antr___ auditorijoje.",              "oje",  "antroje",              "Семинар во второй аудитории.", "The seminar is in room 2."),
    (18, "Egzaminas treč___ auditorijoje.",              "ioje", "trečioje",             "Экзамен в третьей аудитории.", "The exam is in room 3."),
    (18, "Susirinkimas ketvirt___ auditorijoje.",        "oje",  "ketvirtoje",           "Собрание в четвёртой аудитории.", "The meeting is in room 4."),
    (18, "Paskaita penkt___ auditorijoje.",              "oje",  "penktoje",             "Лекция в пятой аудитории.", "The lecture is in room 5."),
    (18, "Egzaminas šešt___ auditorijoje.",             "oje",  "šeštoje",              "Экзамен в шестой аудитории.", "The exam is in room 6."),
    (18, "Seminaras septint___ auditorijoje.",           "oje",  "septintoje",           "Семинар в седьмой аудитории.", "The seminar is in room 7."),
    (18, "Paskaita aštunt___ auditorijoje.",             "oje",  "aštuntoje",            "Лекция в восьмой аудитории.", "The lecture is in room 8."),
    (18, "Priėmimas devint___ auditorijoje.",            "oje",  "devintoje",            "Приём в девятой аудитории.", "The reception is in room 9."),
    (18, "Renginys dešimt___ auditorijoje.",             "oje",  "dešimtoje",            "Мероприятие в десятой аудитории.", "The event is in room 10."),
    (18, "Paskaita vienuolikt___ auditorijoje.",         "oje",  "vienuoliktoje",        "Лекция в одиннадцатой аудитории.", "The lecture is in room 11."),
    (18, "Seminaras dvylikt___ auditorijoje.",           "oje",  "dvyliktoje",           "Семинар в двенадцатой аудитории.", "The seminar is in room 12."),
    (18, "Egzaminas bus šimtas pirm___ auditorijoje.",  "oje",  "šimtas pirmoje",       "Экзамен в аудитории 101.", "The exam will be in room 101."),
    (18, "Paskaita šimtas trisdešimt___ auditorijoje.", "oje",  "šimtas trisdešimtoje", "Лекция в аудитории 130.", "The lecture is in room 130."),
    (18, "Susirinkimas dvidešimt antr___ auditorijoje.","oje",  "dvidešimt antroje",    "Собрание в аудитории 22.", "The meeting is in room 22."),
    (18, "Paskaita dvidešimt pirm___ auditorijoje.",    "oje",  "dvidešimt pirmoje",    "Лекция в аудитории 21.", "The lecture is in room 21."),
    (18, "Kelintoje auditorijoje seminaras? — Antr___!", "oje", "Antroje",              "В какой аудитории семинар? — Во второй!", "Which room is the seminar in? — Room 2!"),
    (18, "Renginys treč___ klasėje.",                   "ioje", "trečioje",             "Мероприятие в третьем классе.", "The event is in classroom 3."),
    (18, "Egzaminas šimtas penkiasdešimt aštunt___ auditorijoje.", "oje", "šimtas penkiasdešimt aštuntoje", "Экзамен в аудитории 158.", "The exam is in room 158."),

    # -----------------------------------------------------------------------
    # CASE 19 — Time accusative (kelintą valandą?) and half past (pusę)
    # -----------------------------------------------------------------------
    (19, "Susitinkame pirm___ valandą.",                "ą",   "pirmą",       "Встречаемся в час (13:00).", "We meet at one o'clock (13:00)."),
    (19, "Einame į teatrą antr___ valandą.",            "ą",   "antrą",       "Идём в театр в два часа (14:00).", "We're going to the theater at two o'clock (14:00)."),
    (19, "Paskaita treč___ valandą.",                   "ią",  "trečią",      "Лекция в три часа (15:00).", "The lecture is at three o'clock (15:00)."),
    (19, "Susitinkame ketvirt___ valandą.",             "ą",   "ketvirtą",    "Встречаемся в четыре (16:00).", "We meet at four (16:00)."),
    (19, "Filmas penkt___ valandą.",                    "ą",   "penktą",      "Фильм в пять часов (17:00).", "The movie is at five o'clock (17:00)."),
    (19, "Eisime į restoraną šešt___ valandą.",         "ą",   "šeštą",       "Пойдём в ресторан в шесть (18:00).", "We'll go to the restaurant at six (18:00)."),
    (19, "Autobusas išvyksta septint___ valandą.",      "ą",   "septintą",    "Автобус отправляется в семь (19:00).", "The bus leaves at seven (19:00)."),
    (19, "Darbo diena prasideda aštunt___ valandą.",    "ą",   "aštuntą",     "Рабочий день начинается в восемь (8:00).", "The workday starts at eight (8:00)."),
    (19, "Susitinkame devint___ valandą.",              "ą",   "devintą",     "Встречаемся в девять (9:00).", "We meet at nine (9:00)."),
    (19, "Paskaita baigiasi dešimt___ valandą.",        "ą",   "dešimtą",     "Лекция заканчивается в десять (10:00).", "The lecture ends at ten (10:00)."),
    (19, "Pietaujame vienuolikt___ valandą.",           "ą",   "vienuoliktą", "Обедаем в одиннадцать (11:00).", "We have lunch at eleven (11:00)."),
    (19, "Susitinkame dvylikt___ valandą.",             "ą",   "dvyliktą",    "Встречаемся в двенадцать (12:00).", "We meet at twelve (12:00)."),
    (19, "Traukinys išvyksta trylikt___ valandą.",      "ą",   "tryliktą",    "Поезд отправляется в тринадцать (13:00).", "The train leaves at 1 p.m. (13:00)."),
    (19, "Paskaita keturiolikt___ valandą.",            "ą",   "keturioliktą","Лекция в четырнадцать (14:00).", "The lecture is at 2 p.m. (14:00)."),
    (19, "Eisime į kiną penkiolikt___ valandą.",        "ą",   "penkioliktą", "Пойдём в кино в пятнадцать (15:00).", "We'll go to the movies at 3 p.m. (15:00)."),
    (19, "Susitinkame šešiolikt___ valandą.",           "ą",   "šešioliktą",  "Встречаемся в шестнадцать (16:00).", "We meet at 4 p.m. (16:00)."),
    (19, "Darbas baigiasi septyniolikt___ valandą.",    "ą",   "septynioliktą","Работа заканчивается в семнадцать (17:00).", "Work ends at 5 p.m. (17:00)."),
    (19, "Vakarienė aštuoniolikt___ valandą.",          "ą",   "aštuonioliktą","Ужин в восемнадцать (18:00).", "Dinner is at 6 p.m. (18:00)."),
    (19, "Spektaklis prasideda devyniolikt___ valandą.","ą",   "devynioliktą","Спектакль начинается в девятнадцать (19:00).", "The show starts at 7 p.m. (19:00)."),
    (19, "Susitinkame dvidešimt___ valandą.",           "ą",   "dvidešimtą",  "Встречаемся в двадцать (20:00).", "We meet at 8 p.m. (20:00)."),
    (19, "Traukinys atvyksta dvidešimt pirm___ valandą.","ą",  "dvidešimt pirmą","Поезд прибывает в двадцать один (21:00).", "The train arrives at 9 p.m. (21:00)."),
    # Half past (pusę + genitive)
    (19, "Susitinkame pusę antr___.",                  "os",  "antros",      "Встречаемся в половину второго (13:30).", "We meet at half past one (13:30)."),
    (19, "Paskaita prasideda pusę treč___.",           "ios", "trečios",     "Лекция начинается в половину третьего (14:30).", "The lecture starts at half past two (14:30)."),
    (19, "Susitinkame pusę ketvirt___.",               "os",  "ketvirtos",   "Встречаемся в половину четвёртого (15:30).", "We meet at half past three (15:30)."),
    (19, "Eisime pusę penkt___.",                      "os",  "penktos",     "Пойдём в половину пятого (16:30).", "We'll go at half past four (16:30)."),
    (19, "Filmas pusę šešt___.",                       "os",  "šeštos",      "Фильм в половину шестого (17:30).", "The movie is at half past five (17:30)."),
    (19, "Susitinkame pusę septint___.",               "os",  "septintos",   "Встречаемся в половину седьмого (18:30).", "We meet at half past six (18:30)."),
    (19, "Vakarienė pusę aštunt___.",                  "os",  "aštuntos",    "Ужин в половину восьмого (19:30).", "Dinner is at half past seven (19:30)."),
    (19, "Spektaklis pusę devint___.",                  "os",  "devintos",    "Спектакль в половину девятого (20:30).", "The show is at half past eight (20:30)."),
    (19, "Susitinkame pusę dešimt___.",                "os",  "dešimtos",    "Встречаемся в половину десятого (21:30).", "We meet at half past nine (21:30)."),
    (19, "Pusryčiai pusę aštunt___.",                  "os",  "aštuntos",    "Завтрак в половину восьмого (7:30).", "Breakfast is at half past seven (7:30)."),
    (19, "Pietūs pusę pirm___.",                       "os",  "pirmos",      "Обед в половину первого (12:30).", "Lunch is at half past twelve (12:30)."),
    (19, "Susitinkame pusę treč___.",                  "ios", "trečios",     "Встречаемся в половину третьего (14:30).", "We meet at half past two (14:30)."),
    # Nuo/iki + genitive
    (19, "Bankas dirba nuo aštunt___ valandos.",        "os",  "aštuntos",    "Банк работает с восьми часов.", "The bank is open from eight o'clock."),
    (19, "Dirbu iki penkt___ valandos.",                "os",  "penktos",     "Я работаю до пяти часов.", "I work until five o'clock."),
    (19, "Parduotuvė dirba iki devint___ valandos.",    "os",  "devintos",    "Магазин работает до девяти часов.", "The store is open until nine o'clock."),
    (19, "Paskaita trunka nuo treč___ valandos.",       "ios", "trečios",     "Лекция длится с трёх часов.", "The lecture runs from three o'clock."),

    # -----------------------------------------------------------------------
    # CASE 20 — Collective numbers (age — kiek metų?)
    # -----------------------------------------------------------------------
    # Collective 1–9 (nominative "metai")
    (20, "Man ___ metai. (2)",                          "dveji",               "dveji",               "Мне два года.", "I am two years old."),
    (20, "Draugui ___ metai. (7)",                      "septyneri",           "septyneri",           "Другу семь лет.", "My friend is seven years old."),
    (20, "Sūnui ___ metai. (5)",                        "penkeri",             "penkeri",             "Сыну пять лет.", "My son is five years old."),
    (20, "Dukteriai ___ metai. (9)",                    "devyneri",            "devyneri",            "Дочери девять лет.", "My daughter is nine years old."),
    (20, "Seseriai ___ metai. (3)",                     "treji",               "treji",               "Сестре три года.", "My sister is three years old."),
    (20, "Broliui ___ metai. (4)",                      "ketveri",             "ketveri",             "Брату четыре года.", "My brother is four years old."),
    (20, "Man ___ metai. (6)",                          "šešeri",              "šešeri",              "Мне шесть лет.", "I am six years old."),
    (20, "Katei ___ metai. (1)",                        "vieni",               "vieni",               "Кошке один год.", "The cat is one year old."),
    (20, "Man ___ metai. (8)",                          "aštuoneri",           "aštuoneri",           "Мне восемь лет.", "I am eight years old."),
    (20, "Tau ___ metai. (2)",                          "dveji",               "dveji",               "Тебе два года.", "You are two years old."),
    # 10+ (genitive "metų")
    (20, "Sūnui ___ metų. (10)",                        "dešimt",              "dešimt",              "Сыну десять лет.", "My son is ten years old."),
    (20, "Draugui ___ metų. (15)",                      "penkiolika",          "penkiolika",          "Другу пятнадцать лет.", "My friend is fifteen years old."),
    (20, "Mamai ___ metų. (40)",                        "keturiasdešimt",      "keturiasdešimt",      "Маме сорок лет.", "Mom is forty years old."),
    (20, "Draugui ___ metų. (17)",                      "septyniolika",        "septyniolika",        "Другу семнадцать лет.", "My friend is seventeen years old."),
    (20, "Senelei ___ metų. (70)",                      "septyniasdešimt",     "septyniasdešimt",     "Бабушке семьдесят лет.", "Grandma is seventy years old."),
    # Compound (dvidešimt + collective)
    (20, "Man ___ metai. (21)",                         "dvidešimt vieni",     "dvidešimt vieni",     "Мне двадцать один год.", "I am twenty-one years old."),
    (20, "Draugei ___ metai. (25)",                     "dvidešimt penkeri",   "dvidešimt penkeri",   "Подруге двадцать пять лет.", "My friend is twenty-five years old."),
    (20, "Broliui ___ metai. (32)",                     "trisdešimt dveji",    "trisdešimt dveji",    "Брату тридцать два года.", "My brother is thirty-two years old."),
    (20, "Seneliui ___ metai. (65)",                    "šešiasdešimt penkeri","šešiasdešimt penkeri","Дедушке шестьдесят пять лет.", "Grandpa is sixty-five years old."),
    (20, "Mamai ___ metai. (41)",                       "keturiasdešimt vieni","keturiasdešimt vieni","Маме сорок один год.", "Mom is forty-one years old."),
    # Dative person blanks
    (20, "Kiek ___ metų? (mama)",                       "mamai",               "mamai",               "Сколько лет маме?", "How old is Mom?"),
    (20, "Kiek ___ metų? (tėtis)",                      "tėčiui",              "tėčiui",              "Сколько лет папе?", "How old is Dad?"),
    (20, "Kiek ___ metų? (sūnus)",                      "sūnui",               "sūnui",               "Сколько лет сыну?", "How old is your son?"),
    (20, "Kiek ___ metų? (duktė)",                      "dukteriai",           "dukteriai",           "Сколько лет дочери?", "How old is your daughter?"),
    (20, "Kiek ___ metų? (sesuo)",                      "seseriai",            "seseriai",            "Сколько лет сестре?", "How old is your sister?"),
    (20, "Kiek ___ metų? (brolis)",                     "broliui",             "broliui",             "Сколько лет брату?", "How old is your brother?"),
    (20, "Kiek ___ metų? (senelis)",                    "seneliui",            "seneliui",            "Сколько лет дедушке?", "How old is your grandpa?"),
    (20, "Kiek ___ metų? (senelė)",                     "senelei",             "senelei",             "Сколько лет бабушке?", "How old is your grandma?"),
    (20, "Kiek ___ metų? (draugas)",                    "draugui",             "draugui",             "Сколько лет другу?", "How old is your friend?"),
    (20, "Kiek ___ metų? (draugė)",                     "draugei",             "draugei",             "Сколько лет подруге?", "How old is your friend?"),
    (20, "___ trisdešimt dveji metai. (jis)",           "Jam",                 "Jam",                 "Ему тридцать два года.", "He is thirty-two years old."),
    (20, "___ penkiolika metų. (ji)",                   "Jai",                 "Jai",                 "Ей пятнадцать лет.", "She is fifteen years old."),
    (20, "___ šešiasdešimt penkeri metai. (aš)",        "Man",                 "Man",                 "Мне шестьдесят пять лет.", "I am sixty-five years old."),
    (20, "___ dvidešimt vieni metai. (tu)",              "Tau",                 "Tau",                 "Тебе двадцать один год.", "You are twenty-one years old."),
    (20, "___ devyneri metai. (duktė)",                  "Dukteriai",           "Dukteriai",           "Дочери девять лет.", "My daughter is nine years old."),
    (20, "___ dveji metai. (šuo)",                       "Šuniui",              "Šuniui",              "Собаке два года.", "The dog is two years old."),
    (20, "Kiek ___ metų? (katė)",                        "katei",               "katei",               "Сколько лет кошке?", "How old is the cat?"),
    (20, "Kiek ___ metų? (pusbrolis)",                   "pusbroliui",          "pusbroliui",          "Сколько лет двоюродному брату?", "How old is your cousin?"),
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
        for (ci, display, ending, full_word, russian, english) in SENTENCES:
            sentence = GrammarSentence(
                case_index=ci,
                display=display,
                answer_ending=ending,
                full_word=full_word,
                russian=russian,
                english=english,
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
