"""Seed the Regitra driving-exam vocabulary program.

8 word lists grouped under subcategory 'regitra', linked to the
'regitra-vocabulary' article.

Usage from repo root:
    python backend/scripts/seed_regitra_program.py
    python backend/scripts/seed_regitra_program.py --reset
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone

_here = Path(__file__).resolve().parent
_backend = _here.parent
sys.path.insert(0, str(_backend))

from sqlmodel import Session, select
from database import engine
from models import WordList, Word, WordListItem, SubcategoryMeta


SUBCATEGORY_KEY = "regitra"
SUBCATEGORY_NAME_RU = "Регитра — экзамен на права"
SUBCATEGORY_NAME_EN = "Regitra — driving exam"
ARTICLE_URL = "/dashboard/articles/regitra-vocabulary"
ARTICLE_NAME_RU = "Литовский для Регитры: 180 слов"
ARTICLE_NAME_EN = "Lithuanian for Regitra: 180 words"
CEFR_LEVEL = "A2-B1"
DIFFICULTY = "medium"
SORT_ORDER_BASE = 500


def _utc():
    return datetime.now(timezone.utc)


# Each list: (sort_offset, title_ru, title_en, description_ru, [(lt, ru, en, hint), ...])
LISTS = [
    (
        1,
        "Регитра 1: Структура экзамена",
        "Regitra 1: Exam structure",
        "Базовая терминология практического экзамена в Регитре.",
        [
            ("vairavimo egzaminas", "экзамен по вождению", "driving exam", None),
            ("teorijos egzaminas", "теоретический экзамен", "theory exam", None),
            ("praktikos egzaminas", "практический экзамен", "practical exam", None),
            ("bandomasis egzaminas", "пробный экзамен", "mock exam", None),
            ("egzaminuotojas", "экзаменатор", "examiner", None),
            ("mokinys", "ученик", "student (m)", "m."),
            ("mokinė", "ученица", "student (f)", "f."),
            ("instruktorius", "инструктор", "instructor", None),
            ("vairavimo mokykla", "автошкола", "driving school", None),
            ("vairuotojo pažymėjimas", "водительское удостоверение", "driving licence", None),
            ("B kategorija", "категория B", "category B", None),
            ("išlaikyti egzaminą", "сдать экзамен", "to pass the exam", "išlaikyti + acc."),
            ("neišlaikyti egzamino", "не сдать экзамен", "to fail the exam", "neišlaikyti + gen."),
            ("iš pirmo karto", "с первого раза", "on the first try", None),
            ("perlaikyti", "пересдать", "to retake", None),
            ("maršrutas", "маршрут", "route", None),
            ("egzamino aikštelė", "экзаменационная площадка", "exam ground", None),
            ("važiavimas realiame eisme", "вождение в реальном движении", "real-traffic driving", None),
            ("savarankiško vairavimo užduotis", "задание самостоятельного вождения", "independent driving task", None),
            ("kritinė klaida", "критическая ошибка", "critical mistake", None),
            ("nekritinė klaida", "некритическая ошибка", "non-critical mistake", None),
        ],
    ),
    (
        2,
        "Регитра 2: Части автомобиля (20 вопросов)",
        "Regitra 2: Car parts (20 questions)",
        "«20 вопросов перед Регитрой» — экзаменатор задаёт 3 случайных. Не показал — критическая ошибка.",
        [
            ("variklis", "двигатель", "engine", None),
            ("vairas", "руль", "steering wheel", None),
            ("vairo užraktas", "блокировка руля", "steering wheel lock", None),
            ("vairo stiprintuvas", "усилитель руля", "power steering", None),
            ("pavarų svirtis", "рычаг передач", "gear lever", None),
            ("atbulinė pavara", "задняя передача", "reverse gear", None),
            ("stabdžio pedalas", "педаль тормоза", "brake pedal", None),
            ("sankabos pedalas", "педаль сцепления", "clutch pedal", None),
            ("akceleratoriaus pedalas", "педаль газа", "accelerator pedal", None),
            ("rankinis stabdys", "ручной тормоз", "handbrake", None),
            ("posūkio svirtis", "рычаг поворотников", "turn signal lever", None),
            ("garso signalas", "звуковой сигнал", "horn", None),
            ("veidrodėliai", "зеркала", "mirrors", None),
            ("vidinis veidrodėlis", "салонное зеркало", "rear-view mirror", None),
            ("šoniniai veidrodėliai", "боковые зеркала", "side mirrors", None),
            ("prietaisų skydelis", "приборная панель", "dashboard", None),
            ("spidometras", "спидометр", "speedometer", None),
            ("degalų matuoklis", "указатель топлива", "fuel gauge", None),
            ("alyvos matuoklis", "масляный щуп", "oil dipstick", None),
            ("variklio dangtis", "капот", "hood", None),
            ("bagažinė", "багажник", "trunk", None),
            ("stiklo valytuvai", "дворники", "wipers", None),
            ("langų plovimas", "омыватель стёкол", "windshield washer", None),
            ("galinio lango šildymas", "обогрев заднего стекла", "rear window heating", None),
        ],
    ),
    (
        3,
        "Регитра 3: Жидкости и техобслуживание",
        "Regitra 3: Fluids & maintenance",
        "Половина «20 вопросов» — про жидкости. Экзаменатор открывает капот и просит показать.",
        [
            ("alyva", "масло", "oil", None),
            ("variklio alyva", "моторное масло", "engine oil", None),
            ("alyvos lygis", "уровень масла", "oil level", None),
            ("patikrinti alyvos lygį", "проверить уровень масла", "check oil level", None),
            ("aušinimo skystis", "охлаждающая жидкость", "coolant", None),
            ("stabdžių skystis", "тормозная жидкость", "brake fluid", None),
            ("langų plovimo skystis", "жидкость омывателя", "washer fluid", None),
            ("degalai", "топливо", "fuel", None),
            ("benzinas", "бензин", "petrol", None),
            ("dyzelinas", "дизель", "diesel", None),
            ("akumuliatorius", "аккумулятор", "battery", None),
            ("padangos", "шины", "tires", None),
            ("padangų slėgis", "давление в шинах", "tire pressure", None),
            ("protektoriaus raštas", "рисунок протектора", "tread pattern", None),
            ("protektoriaus gylis", "глубина протектора", "tread depth", None),
            ("atsarginis ratas", "запасное колесо", "spare wheel", None),
        ],
    ),
    (
        4,
        "Регитра 4: Системы безопасности",
        "Regitra 4: Safety systems",
        "Непристёгнутый ремень = критическая ошибка = экзамен окончен.",
        [
            ("saugos diržas", "ремень безопасности", "seat belt", None),
            ("užsisegti saugos diržą", "пристегнуть ремень", "to fasten the belt", None),
            ("oro pagalvė", "подушка безопасности", "airbag", None),
            ("ABS", "АБС", "anti-lock brakes", None),
            ("avarinė signalizacija", "аварийная сигнализация", "hazard lights", None),
            ("gabaritinės šviesos", "габариты", "parking lights", None),
            ("artimosios šviesos", "ближний свет", "low beam", None),
            ("tolimosios šviesos", "дальний свет", "high beam", None),
            ("rūko žibintai", "противотуманки", "fog lights", None),
            ("Stop žibintai", "стоп-сигналы", "brake lights", None),
            ("atbulinės eigos žibintas", "фонарь заднего хода", "reversing light", None),
            ("pavojaus trikampis", "аварийный знак", "warning triangle", None),
            ("gesintuvas", "огнетушитель", "fire extinguisher", None),
            ("pirmosios pagalbos vaistinėlė", "аптечка", "first-aid kit", None),
            ("atšvaitinė liemenė", "светоотражающий жилет", "reflective vest", None),
        ],
    ),
    (
        5,
        "Регитра 5: Манёвры",
        "Regitra 5: Maneuvers",
        "Специальные манёвры B-категории на площадке Регитры.",
        [
            ("manevras", "манёвр", "maneuver", None),
            ("parkavimas", "парковка", "parking", None),
            ("statmenas parkavimas", "перпендикулярная парковка (90°)", "perpendicular parking", None),
            ("įstrižas parkavimas", "парковка под углом (45°)", "angled parking", None),
            ("lygiagretus parkavimas", "параллельная парковка", "parallel parking", None),
            ("atbulinis važiavimas", "движение задним ходом", "reversing", None),
            ("apsisukimas", "разворот", "U-turn", None),
            ("apsisukimas trimis judesiais", "разворот в три приёма", "three-point turn", None),
            ('važiavimas „T" forma', "разворот «буквой Т»", "T-shape maneuver", None),
            ("važiavimas aštuoniuke", "«восьмёрка»", "figure-eight", None),
            ("apvažiuoti kliūtį", "объехать препятствие", "obstacle avoidance", None),
            ("stabdymas iš greičio", "экстренное торможение", "emergency braking", None),
            ("pajudėti iš vietos", "тронуться с места", "to pull off", None),
            ("pajudėti į kalną", "тронуться в гору", "hill start", None),
            ("sustoti", "остановиться", "to stop", None),
            ("persirikiavimas", "перестроение", "lane change", None),
            ("įsiliejimas į eismą", "вливание в поток", "merging", None),
        ],
    ),
    (
        6,
        "Регитра 6: Команды экзаменатора",
        "Regitra 6: Examiner's commands",
        "~90 % того, что произнесёт экзаменатор за 90 минут. Самый высокоокупаемый блок.",
        [
            ("Pradėkite važiuoti.", "Начинайте движение.", "Start driving.", None),
            ("Važiuokite tiesiai.", "Езжайте прямо.", "Drive straight.", None),
            ("Sukite į dešinę.", "Поверните направо.", "Turn right.", None),
            ("Sukite į kairę.", "Поверните налево.", "Turn left.", None),
            ("Kitoje sankryžoje sukite į dešinę.", "На следующем перекрёстке направо.", "Turn right at the next intersection.", None),
            ("Persirikiuokite į dešinę juostą.", "Перестройтесь в правую полосу.", "Change to the right lane.", None),
            ("Sustokite saugioje vietoje.", "Остановитесь в безопасном месте.", "Stop in a safe place.", None),
            ("Apsisukite.", "Развернитесь.", "Make a U-turn.", None),
            ("Įjunkite posūkio signalą.", "Включите поворотник.", "Turn on the signal.", None),
            ("Įjunkite avarinę signalizaciją.", "Включите аварийку.", "Hazards on.", None),
            ("Užveskite variklį.", "Заведите двигатель.", "Start the engine.", None),
            ("Užgesinkite variklį.", "Заглушите двигатель.", "Stop the engine.", None),
            ("Užsisekite saugos diržą.", "Пристегните ремень.", "Fasten your belt.", None),
            ("Atleiskite rankinį stabdį.", "Отпустите ручник.", "Release the handbrake.", None),
            ("Pasirinkite tinkamą pavarą.", "Выберите подходящую передачу.", "Select the right gear.", None),
            ("Sumažinkite greitį.", "Снизьте скорость.", "Reduce speed.", None),
            ("Padidinkite greitį.", "Увеличьте скорость.", "Increase speed.", None),
            ("Laikykitės saugaus atstumo.", "Соблюдайте дистанцию.", "Keep safe distance.", None),
            ("Stebėkite veidrodėlius.", "Следите за зеркалами.", "Watch the mirrors.", None),
            ("Toliau važiuokite savarankiškai.", "Дальше езжайте сами.", "Continue independently.", None),
            ("Egzaminas baigtas.", "Экзамен окончен.", "The exam is over.", None),
        ],
    ),
    (
        7,
        "Регитра 7: Дорожное движение и знаки",
        "Regitra 7: Traffic & signs",
        "Базовая лексика ПДД (KET).",
        [
            ("eismas", "движение", "traffic", None),
            ("eismo taisyklės", "ПДД", "traffic rules", "KET"),
            ("juosta", "полоса", "lane", None),
            ("sankryža", "перекрёсток", "intersection", None),
            ("žiedinė sankryža", "круговое движение", "roundabout", None),
            ("pėsčiųjų perėja", "пешеходный переход", "crosswalk", None),
            ("pėsčiasis", "пешеход", "pedestrian", None),
            ("dviratininkas", "велосипедист", "cyclist", None),
            ("greičio ribojimas", "ограничение скорости", "speed limit", None),
            ("pirmenybė", "приоритет", "right of way", None),
            ("duoti kelią", "уступить дорогу", "give way", None),
            ("stop ženklas", "знак «стоп»", "stop sign", None),
            ("šviesoforas", "светофор", "traffic light", None),
            ("eismo įvykis", "ДТП", "traffic accident", None),
        ],
    ),
    (
        8,
        "Регитра 8: Критические ошибки",
        "Regitra 8: Critical mistakes",
        "Одна такая ошибка — и экзамен окончен. Маленький блок, огромная отдача.",
        [
            ("egzaminuotojo įsikišimas", "вмешательство экзаменатора", "examiner intervention", None),
            ("neužsisegtas saugos diržas", "непристёгнутый ремень", "unfastened seat belt", None),
            ("naudoti telefoną vairuojant", "телефон за рулём", "phone while driving", None),
            ("nepaisyti šviesoforo", "проехать на красный", "running a red light", None),
            ("neduoti pirmenybės", "не уступить дорогу", "failure to yield", None),
            ("viršyti greitį", "превысить скорость", "speeding", None),
            ("užvažiuoti ant bordiūro", "наехать на бордюр", "hitting the curb", None),
            ("atsitrenkti į kliūtį", "столкнуться с препятствием", "hitting an obstacle", None),
            ("užgesinti variklį sankryžoje", "заглохнуть на перекрёстке", "stalling at an intersection", None),
            ("pasirinkti netinkamą pavarą", "неправильная передача", "wrong gear", None),
        ],
    ),
]


def seed(reset: bool = False) -> None:
    with Session(engine) as session:
        # Subcategory metadata
        meta = session.exec(
            select(SubcategoryMeta).where(SubcategoryMeta.key == SUBCATEGORY_KEY)
        ).first()

        if meta and reset:
            print(f"  Deleting existing '{SUBCATEGORY_KEY}' lists…")
            lists = session.exec(
                select(WordList).where(WordList.subcategory == SUBCATEGORY_KEY)
            ).all()
            for wl in lists:
                items = session.exec(
                    select(WordListItem).where(WordListItem.word_list_id == wl.id)
                ).all()
                word_ids = [it.word_id for it in items]
                for it in items:
                    session.delete(it)
                # Delete words that were only used by this list
                for wid in word_ids:
                    other = session.exec(
                        select(WordListItem).where(WordListItem.word_id == wid)
                    ).first()
                    if not other:
                        w = session.get(Word, wid)
                        if w:
                            session.delete(w)
                session.delete(wl)
            session.commit()

        if not meta:
            meta = SubcategoryMeta(
                key=SUBCATEGORY_KEY,
                name_ru=SUBCATEGORY_NAME_RU,
                name_en=SUBCATEGORY_NAME_EN,
                cefr_level=CEFR_LEVEL,
                difficulty=DIFFICULTY,
                article_url=ARTICLE_URL,
                article_name_ru=ARTICLE_NAME_RU,
                article_name_en=ARTICLE_NAME_EN,
                sort_order=SORT_ORDER_BASE,
                status="published",
            )
            session.add(meta)
            session.commit()
            print(f"  Created subcategory '{SUBCATEGORY_KEY}'.")
        else:
            print(f"  Subcategory '{SUBCATEGORY_KEY}' already exists.")

        # Lists
        for offset, title_ru, title_en, desc_ru, entries in LISTS:
            existing = session.exec(
                select(WordList)
                .where(WordList.subcategory == SUBCATEGORY_KEY)
                .where(WordList.title == title_ru)
            ).first()
            if existing:
                print(f"  Skipping list (exists): {title_ru}")
                continue

            wl = WordList(
                title=title_ru,
                title_en=title_en,
                description=desc_ru,
                description_en=None,
                subcategory=SUBCATEGORY_KEY,
                is_public=True,
                cefr_level=CEFR_LEVEL,
                difficulty=DIFFICULTY,
                article_url=ARTICLE_URL,
                sort_order=offset,
                created_at=_utc(),
            )
            session.add(wl)
            session.flush()

            for position, (lt, ru, en, hint) in enumerate(entries):
                # Star: phrase if it contains a space + ends with punctuation, else 1
                star = 3 if (" " in lt and lt.rstrip()[-1:] in ".!?") else (2 if " " in lt else 1)
                word = Word(
                    lithuanian=lt,
                    translation_en=en,
                    translation_ru=ru,
                    hint=hint,
                    star=star,
                )
                session.add(word)
                session.flush()
                session.add(WordListItem(
                    word_list_id=wl.id,
                    word_id=word.id,
                    position=position,
                ))

            print(f"  Created list: {title_ru}  ({len(entries)} words)")

        session.commit()
        total = sum(len(e[4]) for e in LISTS)
        print(f"\nDone. Subcategory '{SUBCATEGORY_KEY}', {len(LISTS)} lists, {total} entries.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="Delete existing regitra lists first")
    args = p.parse_args()
    seed(reset=args.reset)
