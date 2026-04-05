"""One-shot seed script: create the 'Ne dienos be lietuvių kalbos' program.

Creates:
  - 1 SubcategoryMeta (key='lithuanian_daily_language', status='draft')
  - 12 WordList rows (one per lesson)
  - Word + WordListItem rows for each vocabulary entry

Run from backend/: python seed_ne_dienos.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from database import engine
from models import SubcategoryMeta, WordList, Word, WordListItem
from sqlmodel import Session, select

REPO_ROOT = Path(__file__).parent.parent
LESSONS_DIR = REPO_ROOT / "temp_files" / "Ne_denos_belietuviu_Kalba"

PROGRAM_KEY = "lithuanian_daily_language"

# ---------------------------------------------------------------------------
# Lesson metadata
# ---------------------------------------------------------------------------

LESSONS = [
    {"sort": 0, "title": "Susipažinkime!", "title_en": "Let's Get Acquainted!",
     "file": "01_Susipazinkime.md"},
    {"sort": 1, "title": "Kaip sekasi?", "title_en": "How are you?",
     "file": "02_Kaip_sekasi.md"},
    {"sort": 2, "title": "Čia mano šeima", "title_en": "This is my family",
     "file": "03_Cia_mano_seima.md"},
    {"sort": 3, "title": "Kaip skanu!", "title_en": "How tasty!",
     "vocab": [
         ("maistas", "еда", "food"),
         ("virti", "варить", "to cook"),
         ("skanus", "вкусный", "tasty"),
         ("duona", "хлеб", "bread"),
         ("mėsa", "мясо", "meat"),
         ("žuvis", "рыба", "fish"),
         ("višta", "курица", "chicken"),
         ("sviestas", "масло", "butter"),
         ("sūris", "сыр", "cheese"),
         ("kiaušinis", "яйцо", "egg"),
         ("pienas", "молоко", "milk"),
         ("šokoladas", "шоколад", "chocolate"),
         ("obuolys", "яблоко", "apple"),
         ("apelsinai", "апельсины", "oranges"),
         ("braškės", "клубника", "strawberries"),
         ("prieskoniai", "специи", "spices"),
         ("saldus", "сладкий", "sweet"),
         ("rūgštus", "кислый", "sour"),
         ("karštas", "горячий", "hot"),
         ("šaltas", "холодный", "cold"),
         ("keptuvė", "сковорода", "frying pan"),
         ("puodas", "кастрюля", "pot"),
         ("peilis", "нож", "knife"),
         ("šakutė", "вилка", "fork"),
         ("šaukštas", "ложка", "spoon"),
         ("stiklinė", "стакан", "glass"),
     ]},
    {"sort": 4, "title": "Prašom paragauti", "title_en": "Please taste",
     "vocab": [
         ("valgyti", "есть", "to eat"),
         ("gerti", "пить", "to drink"),
         ("paragauti", "попробовать", "to taste"),
         ("lėkštė", "тарелка", "plate"),
         ("puodelis", "чашка", "cup"),
         ("arbata", "чай", "tea"),
         ("kava", "кофе", "coffee"),
         ("vynas", "вино", "wine"),
         ("alus", "пиво", "beer"),
         ("sultys", "сок", "juice"),
         ("vanduo", "вода", "water"),
         ("salotos", "салат", "salad"),
         ("sriuba", "суп", "soup"),
         ("pusryčiai", "завтрак", "breakfast"),
         ("pietūs", "обед", "lunch"),
         ("vakarienė", "ужин", "dinner"),
         ("mėgstu", "мне нравится", "I like"),
         ("nemėgstu", "мне не нравится", "I don't like"),
         ("labai skanu", "очень вкусно", "very tasty"),
         ("ačiū", "спасибо", "thank you"),
         ("prašom", "пожалуйста", "please"),
         ("užsakyti", "заказать", "to order"),
         ("sąskaita", "счёт", "bill"),
         ("restoranas", "ресторан", "restaurant"),
         ("valgiaraštis", "меню", "menu"),
     ]},
    {"sort": 5, "title": "Eikite tiesiai!", "title_en": "Go straight!",
     "vocab": [
         ("eiti", "идти", "to go (on foot)"),
         ("važiuoti", "ехать", "to go (by vehicle)"),
         ("tiesiai", "прямо", "straight"),
         ("kairėje", "слева", "on the left"),
         ("dešinėje", "справа", "on the right"),
         ("priešais", "напротив", "opposite"),
         ("šalia", "рядом", "next to"),
         ("prie", "у", "at/near"),
         ("gatvė", "улица", "street"),
         ("aikštė", "площадь", "square"),
         ("tiltas", "мост", "bridge"),
         ("stotis", "станция", "station"),
         ("autobusas", "автобус", "bus"),
         ("traukinys", "поезд", "train"),
         ("taksi", "такси", "taxi"),
         ("automobilis", "автомобиль", "car"),
         ("dviratis", "велосипед", "bicycle"),
         ("žemėlapis", "карта", "map"),
         ("kur", "где", "where"),
         ("čia", "здесь", "here"),
         ("ten", "там", "there"),
         ("parodyti", "показать", "to show"),
         ("klausti", "спрашивать", "to ask"),
         ("sustoti", "остановиться", "to stop"),
         ("apsisukti", "повернуть", "to turn around"),
         ("pėsčiomis", "пешком", "on foot"),
         ("grįžti", "возвращаться", "to return"),
     ]},
    {"sort": 6, "title": "Čia labai jauku", "title_en": "It's very cozy here",
     "vocab": [
         ("namas", "дом", "house"),
         ("butas", "квартира", "apartment"),
         ("kambarys", "комната", "room"),
         ("virtuvė", "кухня", "kitchen"),
         ("miegamasis", "спальня", "bedroom"),
         ("svetainė", "гостinė комната", "living room"),
         ("vonios kambarys", "ванная комната", "bathroom"),
         ("prieškambaris", "прихожая", "hallway"),
         ("stalas", "стол", "table"),
         ("kėdė", "стул", "chair"),
         ("lova", "кровать", "bed"),
         ("sofa", "диван", "sofa"),
         ("šaldytuvas", "холодильник", "refrigerator"),
         ("viryklė", "плита", "stove"),
         ("durys", "дверь", "door"),
         ("langas", "окно", "window"),
         ("siena", "стена", "wall"),
         ("grindys", "пол", "floor"),
         ("lubos", "потолок", "ceiling"),
         ("šviesa", "свет", "light"),
         ("šiltas", "тёплый", "warm"),
         ("jauku", "уютно", "cozy"),
         ("švarus", "чистый", "clean"),
         ("erdvus", "просторный", "spacious"),
         ("gyventi", "жить", "to live"),
         ("nuomotis", "арендовать", "to rent"),
     ]},
    {"sort": 7, "title": "Šiandien saulėta", "title_en": "Today is sunny",
     "vocab": [
         ("oras", "погода", "weather"),
         ("saulė", "солнце", "sun"),
         ("debesis", "облако", "cloud"),
         ("lietus", "дождь", "rain"),
         ("sniegas", "снег", "snow"),
         ("vėjas", "ветер", "wind"),
         ("perkūnija", "гроза", "thunderstorm"),
         ("temperatūra", "температура", "temperature"),
         ("šilta", "тепло", "warm"),
         ("šalta", "холодно", "cold"),
         ("drėgna", "влажно", "humid"),
         ("saulėta", "солнечно", "sunny"),
         ("debesuota", "облачно", "cloudy"),
         ("lietinga", "дождливо", "rainy"),
         ("dangus", "небо", "sky"),
         ("pavasaris", "весна", "spring"),
         ("vasara", "лето", "summer"),
         ("ruduo", "осень", "autumn"),
         ("žiema", "зима", "winter"),
         ("saulėlydis", "закат", "sunset"),
         ("saulėtekis", "рассвет", "sunrise"),
         ("pūga", "метель", "blizzard"),
         ("šlapias", "мокрый", "wet"),
         ("lauke", "на улице", "outside"),
         ("prognozė", "прогноз", "forecast"),
     ]},
    {"sort": 8, "title": "Jaučiuosi puikiai", "title_en": "I feel great!",
     "vocab": [
         ("sveikata", "здоровье", "health"),
         ("galva", "голова", "head"),
         ("akis", "глаз", "eye"),
         ("ausis", "ухо", "ear"),
         ("nosis", "нос", "nose"),
         ("burna", "рот", "mouth"),
         ("dantis", "зуб", "tooth"),
         ("kaklas", "шея", "neck"),
         ("širdis", "сердце", "heart"),
         ("ranka", "рука", "arm/hand"),
         ("koja", "нога", "leg/foot"),
         ("pilvas", "живот", "belly/stomach"),
         ("nugara", "спина", "back"),
         ("liga", "болезнь", "illness"),
         ("skauda", "болит", "hurts"),
         ("karštis", "жар", "fever"),
         ("laimingas", "счастливый", "happy"),
         ("liūdnas", "грустный", "sad"),
         ("pavargęs", "уставший", "tired"),
         ("puikus", "отличный", "excellent/great"),
         ("gydytojas", "врач", "doctor"),
         ("vaistai", "лекарства", "medicine"),
         ("ligoninė", "больница", "hospital"),
         ("jaustis", "чувствовать себя", "to feel"),
         ("sergu", "я болен", "I am sick"),
     ]},
    {"sort": 9, "title": "Ką veiki šiandien?", "title_en": "What are you doing today?",
     "vocab": [
         ("veikti", "делать", "to do/act"),
         ("daryti", "делать", "to make/do"),
         ("skaityti", "читать", "to read"),
         ("rašyti", "писать", "to write"),
         ("klausyti", "слушать", "to listen"),
         ("žiūrėti", "смотреть", "to watch"),
         ("vaikščioti", "ходить", "to walk"),
         ("bėgti", "бежать", "to run"),
         ("šokti", "танцевать", "to dance"),
         ("dainuoti", "петь", "to sing"),
         ("piešti", "рисовать", "to draw"),
         ("žaisti", "играть", "to play"),
         ("sportuoti", "заниматься спортом", "to do sports"),
         ("keliauti", "путешествовать", "to travel"),
         ("ilsėtis", "отдыхать", "to rest"),
         ("dirbti", "работать", "to work"),
         ("mokytis", "учиться", "to study"),
         ("keltis", "вставать", "to get up"),
         ("miegoti", "спать", "to sleep"),
         ("šiandien", "сегодня", "today"),
         ("rytoj", "завтра", "tomorrow"),
         ("vakar", "вчера", "yesterday"),
         ("planuoti", "планировать", "to plan"),
         ("susitikti", "встретиться", "to meet"),
         ("pirkti", "покупать", "to buy"),
     ]},
    {"sort": 10, "title": "Kaip smagu!", "title_en": "How fun!",
     "vocab": [
         ("pramoga", "развлечение", "entertainment"),
         ("žaidimas", "игра", "game"),
         ("sportas", "спорт", "sport"),
         ("futbolas", "футбол", "football"),
         ("krepšinis", "баскетбол", "basketball"),
         ("plaukimas", "плавание", "swimming"),
         ("tenisas", "теннис", "tennis"),
         ("slidinėjimas", "лыжи", "skiing"),
         ("dviratis", "велосипед", "bicycle"),
         ("stadionas", "стадион", "stadium"),
         ("baseinas", "бассейн", "swimming pool"),
         ("kinas", "кино", "cinema"),
         ("muzika", "музыка", "music"),
         ("koncertas", "концерт", "concert"),
         ("teatras", "театр", "theatre"),
         ("nuotaika", "настроение", "mood"),
         ("smagu", "весело", "fun/it's fun"),
         ("nuobodu", "скучно", "boring"),
         ("įdomu", "интересно", "interesting"),
         ("džiaugsmas", "радость", "joy"),
         ("draugai", "друзья", "friends"),
         ("komanda", "команда", "team"),
         ("laimėti", "выиграть", "to win"),
         ("pralaimėti", "проиграть", "to lose"),
         ("rekordas", "рекорд", "record"),
     ]},
    {"sort": 11, "title": "Sveikinu!", "title_en": "I congratulate!",
     "vocab": [
         ("sveikinti", "поздравлять", "to congratulate"),
         ("sveikiname", "поздравляем", "we congratulate"),
         ("gimtadienis", "день рождения", "birthday"),
         ("Kalėdos", "Рождество", "Christmas"),
         ("Naujieji metai", "Новый год", "New Year"),
         ("Velykos", "Пасха", "Easter"),
         ("šventė", "праздник", "holiday/celebration"),
         ("dovana", "подарок", "gift"),
         ("gėlės", "цветы", "flowers"),
         ("pyragas", "торт", "cake"),
         ("saldumynai", "сладости", "sweets/candy"),
         ("žvakės", "свечи", "candles"),
         ("linkiu", "желаю", "I wish"),
         ("sveikatos", "здоровья", "health (genitive)"),
         ("laimės", "счастья", "happiness (genitive)"),
         ("dėkoju", "благодарю", "I thank"),
         ("svečias", "гость", "guest"),
         ("vaišės", "угощение", "treats"),
         ("šampanas", "шампанское", "champagne"),
         ("taurė", "бокал", "glass/goblet"),
         ("džiaugsmas", "радость", "joy"),
         ("brangus", "дорогой", "dear/precious"),
         ("mielas", "милый", "sweet/dear"),
         ("pergalė", "победа", "victory"),
         ("pasveikinti", "поздравить", "to congratulate (pf.)"),
     ]},
]


# ---------------------------------------------------------------------------
# Markdown parser for lessons 1-3
# ---------------------------------------------------------------------------

def parse_md_vocab(path: Path) -> list[tuple[str, str, str]]:
    """Extract (lithuanian, russian, english) tuples from a markdown file."""
    words = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("-"):
            continue
        content = line.lstrip("- ").strip()
        parts = [p.strip() for p in content.split("=")]
        if len(parts) < 3:
            continue
        lt, ru, en = parts[0], parts[1], "=".join(parts[2:])
        if lt and ru and en:
            words.append((lt, ru, en))
    return words


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

def seed():
    with Session(engine) as session:
        # Guard: skip if program already exists
        existing = session.exec(
            select(SubcategoryMeta).where(SubcategoryMeta.key == PROGRAM_KEY)
        ).first()
        if existing:
            print(f"Program '{PROGRAM_KEY}' already exists — skipping.")
            return

        # Find the highest existing sort_order
        all_meta = session.exec(select(SubcategoryMeta)).all()
        max_sort = max((m.sort_order or 0 for m in all_meta), default=0)

        # 1. Create SubcategoryMeta
        meta = SubcategoryMeta(
            key=PROGRAM_KEY,
            name_ru="Не дня без литовского языка",
            name_en="Not a Day Without Lithuanian",
            cefr_level="A1-A2",
            difficulty="easy",
            article_url="https://www.vu.lt/leidyba/knygos/vadovelis-ne-dienos-be-lietuviu-kalbos",
            article_name_ru="Учебник ВУ",
            article_name_en="VU Textbook",
            sort_order=max_sort + 1,
            status="draft",
        )
        session.add(meta)
        session.flush()
        print(f"Created SubcategoryMeta: {PROGRAM_KEY}")

        total_lists = 0
        total_words = 0
        total_items = 0

        # Word deduplication cache: lithuanian text → word id
        word_cache: dict[str, int] = {}

        for lesson in LESSONS:
            # Load vocabulary
            if "file" in lesson:
                path = LESSONS_DIR / lesson["file"]
                vocab = parse_md_vocab(path)
                print(f"  Parsed {len(vocab)} words from {lesson['file']}")
            else:
                vocab = lesson["vocab"]
                print(f"  Using hardcoded {len(vocab)} words for {lesson['title']}")

            # 2. Create WordList
            wl = WordList(
                title=lesson["title"],
                title_en=lesson["title_en"],
                subcategory=PROGRAM_KEY,
                is_public=True,
                sort_order=lesson["sort"],
                cefr_level="A1-A2",
                difficulty="easy",
            )
            session.add(wl)
            session.flush()
            total_lists += 1

            # 3. Create Words + WordListItems
            for pos, (lt, ru, en) in enumerate(vocab):
                lt_key = lt.lower().strip()

                # Deduplicate: reuse existing word if same Lithuanian text
                if lt_key in word_cache:
                    word_id = word_cache[lt_key]
                else:
                    # Check DB too (in case script is re-run partially)
                    existing_word = session.exec(
                        select(Word).where(Word.lithuanian == lt)
                    ).first()
                    if existing_word:
                        word_id = existing_word.id
                    else:
                        word = Word(
                            lithuanian=lt,
                            translation_ru=ru,
                            translation_en=en,
                            star=1,
                        )
                        session.add(word)
                        session.flush()
                        word_id = word.id
                        total_words += 1
                    word_cache[lt_key] = word_id

                item = WordListItem(word_list_id=wl.id, word_id=word_id, position=pos)
                session.add(item)
                total_items += 1

        session.commit()
        print(f"\nDone! Created:")
        print(f"  {total_lists} word lists")
        print(f"  {total_words} new words")
        print(f"  {total_items} word-list items")


if __name__ == "__main__":
    seed()
