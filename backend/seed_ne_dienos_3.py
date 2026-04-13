"""One-shot seed script: create 'Ne dienos be lietuvių kalbos — Book 3' program.

Creates:
  - 1 SubcategoryMeta (key='lithuanian_daily_language_3', status='draft')
  - 6 WordList rows (one per chapter)
  - Word + WordListItem rows for each vocabulary entry

Run from backend/: python seed_ne_dienos_3.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from database import engine
from models import SubcategoryMeta, WordList, Word, WordListItem
from sqlmodel import Session, select

PROGRAM_KEY = "lithuanian_daily_language_3"

# ---------------------------------------------------------------------------
# Lesson metadata with inline vocabulary (lithuanian, russian, english)
# ---------------------------------------------------------------------------

LESSONS = [
    {
        "sort": 0,
        "title": "Istorija ir politika",
        "title_en": "History and politics",
        "vocab": [
            # Documents & research
            ("archyvas", "архив", "archive"),
            ("atradimas", "открытие", "discovery"),
            ("dokumentas", "документ", "document"),
            ("tekstas", "текст", "text"),
            ("amžininkas", "современник", "contemporary/eyewitness"),
            ("tyrinėtojas", "исследователь", "researcher"),
            # Society & institutions
            ("tarnyba", "служба", "service/agency"),
            ("valdžia", "власть", "power/authority"),
            ("visuomenė", "общество", "society"),
            ("bendruomenė", "сообщество", "community"),
            # Abstract concepts
            ("erdvė", "пространство", "space"),
            ("reiškinys", "явление", "phenomenon"),
            ("samprata", "понятие/концепция", "notion/concept"),
            ("sąvoka", "понятие/термин", "concept/term"),
            ("vaidmuo", "роль", "role"),
            ("veikla", "деятельность", "activity"),
            ("vaizduotė", "воображение", "imagination"),
            # Memory & fate
            ("atmintis", "память", "memory"),
            ("atsakomybė", "ответственность", "responsibility"),
            ("būtis", "существование", "existence/being"),
            ("likimas", "судьба", "fate/destiny"),
            ("užmarštis", "забвение", "oblivion"),
            # Events & causes
            ("aplinkybės", "обстоятельства", "circumstances"),
            ("iššūkis", "вызов", "challenge"),
            ("įtaka", "влияние", "influence"),
            ("įvykis", "событие", "event"),
            ("laikotarpis", "период/эпоха", "period/era"),
            ("pasekmė", "последствие", "consequence"),
            ("pastangos", "усилия", "efforts"),
            ("pokytis", "перемена/изменение", "change"),
            ("priežastis", "причина", "reason/cause"),
            ("sprendimas", "решение", "decision"),
            # Struggle & resistance
            ("akcija", "акция", "action/campaign"),
            ("judėjimas", "движение", "movement"),
            ("kova", "борьба", "fight/struggle"),
            ("lūžis", "перелом", "turning point"),
            ("nepriklausomybė", "независимость", "independence"),
            ("pasipriešinimas", "сопротивление", "resistance"),
            ("pergalė", "победа", "victory"),
            ("drąsa", "храбрость", "courage"),
            ("ryžtas", "решимость", "determination/resolve"),
            ("viltis", "надежда", "hope"),
            # Deportation & repression
            ("tremtis", "ссылка/депортация", "exile/deportation"),
            ("badas", "голод", "hunger/famine"),
            ("lageris", "лагерь", "camp/gulag"),
            ("skurdas", "бедность/нищета", "poverty/misery"),
            ("tremtinys", "ссыльный", "deportee"),
            ("kalejimas", "тюрьма/заключение", "imprisonment/prison"),
            ("pogrindis", "подполье", "underground/resistance"),
            ("partizanas", "партизан", "partisan/guerrilla"),
            ("priesaika", "клятва", "oath"),
            ("vadas", "командир/вождь", "leader/commander"),
            # Adjectives
            ("amžinas", "вечный", "eternal"),
            ("ryžtingas", "решительный", "determined/resolute"),
            ("skaudus", "болезненный", "painful"),
            ("šiuolaikinis", "современный", "contemporary/modern"),
            ("žiaurus", "жестокий", "cruel/fierce"),
            # Verbs
            ("aptarti", "обсудить", "to discuss"),
            ("įamžinti", "увековечить", "to immortalize"),
            ("tirti", "исследовать", "to investigate/research"),
            ("atstovauti", "представлять", "to represent"),
            ("pasmerkti", "осудить", "to condemn"),
            ("įvertinti", "оценить", "to evaluate"),
            ("patirti", "пережить/испытать", "to experience"),
            ("laikyti", "считать/держать", "to consider/hold"),
        ],
    },
    {
        "sort": 1,
        "title": "Muzika, teatras, kinas",
        "title_en": "Music, theatre, cinema",
        "vocab": [
            # Announcements & events
            ("afiša", "афиша", "poster/playbill"),
            ("pramoga", "развлечение", "entertainment"),
            ("premjera", "премьера", "premiere"),
            ("programa", "программа", "program"),
            ("repertuaras", "репертуар", "repertoire"),
            ("seansas", "сеанс", "show/session"),
            # Theatre
            ("spektaklis", "спектакль", "performance/show"),
            ("pertrauka", "антракт/перерыв", "intermission/break"),
            ("veiksmas", "действие/акт", "act"),
            ("akustika", "акустика", "acoustics"),
            ("dekoracijos", "декорации", "set/decorations"),
            ("repeticija", "репетиция", "rehearsal"),
            ("scena", "сцена", "stage/scene"),
            ("uždanga", "занавес", "curtain"),
            ("užkulisiai", "кулисы/закулисье", "backstage"),
            ("baletas", "балет", "ballet"),
            ("opera", "опера", "opera"),
            ("operetė", "оперетта", "operetta"),
            ("kulminacija", "кульминация", "climax/culmination"),
            ("atomazga", "развязка", "denouement"),
            # Cinema
            ("scenarijus", "сценарий", "screenplay"),
            ("epizodas", "эпизод", "episode"),
            ("kadras", "кадр", "frame/shot"),
            ("ekranas", "экран", "screen"),
            ("vaidybinis filmas", "художественный фильм", "feature film"),
            ("dokumentinis filmas", "документальный фильм", "documentary"),
            ("animacinis filmas", "мультипликационный фильм", "animated film"),
            ("fantastinis filmas", "фантастический фильм", "sci-fi film"),
            ("siaubo filmas", "фильм ужасов", "horror film"),
            ("trileris", "триллер", "thriller"),
            ("melodrama", "мелодрама", "melodrama"),
            # People
            ("aktorius", "актёр", "actor"),
            ("atlikėjas", "исполнитель", "performer"),
            ("režisierius", "режиссёр", "director"),
            ("scenaristas", "сценарист", "screenwriter"),
            ("veikėjas", "персонаж/действующее лицо", "character"),
            # Music
            ("virtuozas", "виртуоз", "virtuoso"),
            ("fortepijonas", "рояль", "grand piano"),
            ("smuikas", "скрипка", "violin"),
            ("gitara", "гитара", "guitar"),
            ("fleita", "флейта", "flute"),
            ("saksofonas", "саксофон", "saxophone"),
            ("vargonai", "орган", "organ"),
            ("violončelė", "виолончель", "cello"),
            ("kanklės", "канклес (литовский инструмент)", "kankles (Lithuanian zither)"),
            # Music genres & voices
            ("džiazas", "джаз", "jazz"),
            ("klasikinė muzika", "классическая музыка", "classical music"),
            ("folkloras", "фольклор", "folklore"),
            ("orkestras", "оркестр", "orchestra"),
            ("dirigentas", "дирижёр", "conductor"),
            ("choras", "хор", "choir"),
            ("solistas", "солист", "soloist"),
            ("arija", "ария", "aria"),
            ("melodija", "мелодия", "melody"),
            # Performance concepts
            ("kūryba", "творчество", "creativity/art"),
            ("scenografija", "сценография", "set design"),
            ("festivalis", "фестиваль", "festival"),
            ("konkursas", "конкурс", "competition"),
            ("kritika", "критика", "criticism"),
            ("žiūrovas", "зритель", "viewer/spectator"),
            # Adjectives
            ("talentingas", "талантливый", "talented"),
            ("originalus", "оригинальный", "original"),
            ("dramatiškas", "драматический", "dramatic"),
            ("lyriškas", "лирический", "lyrical"),
            ("romantinis", "романтический", "romantic"),
            ("unikalus", "уникальный", "unique"),
            # Verbs
            ("režisuoti", "режиссировать", "to direct"),
            ("vaidinti", "играть/изображать", "to act/play"),
            ("filmuoti", "снимать (фильм)", "to film"),
            ("recenzuoti", "рецензировать", "to review"),
            ("akompanuoti", "аккомпанировать", "to accompany"),
            ("groti", "играть (на инструменте)", "to play (instrument)"),
        ],
    },
    {
        "sort": 2,
        "title": "Architektūra. Vaizduojamasis menas",
        "title_en": "Architecture. Visual arts",
        "vocab": [
            # Architecture
            ("architektas", "архитектор", "architect"),
            ("restauratorius", "реставратор", "restorer"),
            ("projektas", "проект", "project"),
            ("palikimas", "наследие", "heritage/legacy"),
            ("paveldas", "наследство/наследие", "heritage"),
            ("paveldosauga", "охрана наследия", "heritage protection"),
            ("stilius", "стиль", "style"),
            ("braižas", "манера/почерк", "drawing style/manner"),
            ("harmonija", "гармония", "harmony"),
            ("ansamblis", "ансамбль/комплекс", "ensemble/complex"),
            ("pastatas", "здание", "building"),
            ("rūmai", "дворец/особняк", "palace/mansion"),
            ("eksterjeras", "экстерьер", "exterior"),
            ("interjeras", "интерьер", "interior"),
            ("fasadas", "фасад", "facade"),
            ("kolona", "колонна", "column"),
            ("arka", "арка", "arch"),
            ("freska", "фреска", "fresco"),
            ("ornamentas", "орнамент", "ornament"),
            ("skliautas", "свод", "vault/arch"),
            # Fine arts
            ("dailė", "изобразительное искусство", "fine arts"),
            ("tapyba", "живопись", "painting"),
            ("tapytojas", "живописец", "painter"),
            ("natiurmortas", "натюрморт", "still life"),
            ("peizažas", "пейзаж", "landscape"),
            ("portretas", "портрет", "portrait"),
            ("eskizas", "эскиз", "sketch"),
            ("akvarelė", "акварель", "watercolor"),
            ("aliejus", "масло (краска)", "oil paint"),
            ("drobė", "холст", "canvas"),
            ("teptukas", "кисть", "brush"),
            ("potėpis", "мазок", "brushstroke"),
            ("molbertas", "мольберт", "easel"),
            ("spalvų paletė", "цветовая палитра", "color palette"),
            ("kompozicija", "композиция", "composition"),
            # Sculpture & applied arts
            ("skulptūra", "скульптура", "sculpture"),
            ("skulptorius", "скульптор", "sculptor"),
            ("akmuo", "камень", "stone"),
            ("metalas", "металл", "metal"),
            ("porcelianas", "фарфор", "porcelain"),
            ("mozaika", "мозаика", "mosaic"),
            ("keramika", "керамика", "ceramics"),
            ("tekstilė", "текстиль", "textile"),
            ("vitražas", "витраж", "stained glass"),
            ("instalacija", "инсталляция", "installation"),
            # Exhibitions & critique
            ("galerija", "галерея", "gallery"),
            ("paroda", "выставка", "exhibition"),
            ("kuratorius", "куратор", "curator"),
            ("ekspozicija", "экспозиция", "exposition/display"),
            ("bienalė", "биеннале", "biennale"),
            ("kolekcija", "коллекция", "collection"),
            ("katalogas", "каталог", "catalogue"),
            ("reprodukcija", "репродукция", "reproduction"),
            ("įkvėpimas", "вдохновение", "inspiration"),
            ("motyvas", "мотив", "motif/motive"),
            ("technika", "техника", "technique"),
            # Adjectives
            ("estetiškas", "эстетичный", "aesthetic"),
            ("funkcionalus", "функциональный", "functional"),
            ("novatoriškas", "новаторский", "innovative"),
            ("reikšmingas", "значительный", "significant"),
            ("subtilus", "тонкий/изысканный", "subtle"),
            ("vertingas", "ценный", "valuable"),
            ("kūrybingas", "творческий", "creative"),
            # Verbs
            ("restauruoti", "реставрировать", "to restore"),
            ("projektuoti", "проектировать", "to design/project"),
            ("eksponuoti", "экспонировать", "to exhibit/display"),
            ("atstatyti", "восстановить", "to rebuild/restore"),
            ("atkurti", "воссоздать", "to recreate/restore"),
            ("vyrauti", "преобладать/господствовать", "to prevail/dominate"),
        ],
    },
    {
        "sort": 3,
        "title": "Grožinė literatūra",
        "title_en": "Fiction / Belles-lettres",
        "vocab": [
            # Literary genres
            ("grožinė literatūra", "художественная литература", "fiction/belles-lettres"),
            ("žanras", "жанр", "genre"),
            ("proza", "проза", "prose"),
            ("apysaka", "повесть", "novel/novella"),
            ("apsakymas", "рассказ", "short story"),
            ("esė", "эссе", "essay"),
            ("novelė", "новелла", "novella"),
            ("romanas", "роман", "novel"),
            ("poezija", "поэзия", "poetry"),
            ("lyrika", "лирика", "lyric poetry"),
            ("poema", "поэма", "epic poem"),
            ("sonetas", "сонет", "sonnet"),
            ("eilėraštis", "стихотворение", "poem"),
            ("eilės", "стихи", "verses"),
            ("ritmas", "ритм", "rhythm"),
            ("rimas", "рифма", "rhyme"),
            # Dramaturgy
            ("dramaturgija", "драматургия", "dramaturgy"),
            ("tragedija", "трагедия", "tragedy"),
            ("tragikomedija", "трагикомедия", "tragicomedy"),
            # Criticism
            ("anotacija", "аннотация", "annotation/abstract"),
            ("apžvalga", "обзор/рецензия", "overview/review"),
            ("recenzija", "рецензия", "review"),
            # Narrative elements
            ("veikėjas", "персонаж", "character"),
            ("pasakotojas", "рассказчик", "narrator"),
            ("pasakojimas", "повествование", "narration/story"),
            ("charakteristika", "характеристика", "characterization"),
            # Literary analysis
            ("siužetas", "сюжет", "plot"),
            ("siužetinė linija", "сюжетная линия", "storyline"),
            ("tema", "тема", "theme"),
            ("interpretacija", "интерпретация", "interpretation"),
            ("perspektyva", "перспектива", "perspective"),
            ("nuotaika", "настроение", "mood/atmosphere"),
            ("įtaka", "влияние", "influence"),
            ("įvaizdis", "образ", "image/symbol"),
            ("problematika", "проблематика", "problematic/issues"),
            ("retrospektyva", "ретроспектива", "retrospective"),
            ("klišė", "клише", "cliché"),
            # Adjectives
            ("autentiškas", "аутентичный", "authentic"),
            ("ironiškas", "иронический", "ironic"),
            ("sarkastiškas", "саркастический", "sarcastic"),
            ("simbolinis", "символический", "symbolic"),
            ("šmaikštus", "остроумный", "witty"),
            ("tragiškas", "трагический", "tragic"),
            ("lyriškas", "лирический", "lyrical"),
            ("originalus", "оригинальный", "original"),
            ("kandus", "едкий/язвительный", "biting/caustic"),
            ("reikšmingas", "значительный", "significant"),
            # Verbs
            ("analizuoti", "анализировать", "to analyze"),
            ("aprašyti", "описывать", "to describe"),
            ("interpretuoti", "интерпретировать", "to interpret"),
            ("publikuoti", "публиковать", "to publish"),
            ("redaguoti", "редактировать", "to edit"),
            ("cenzūruoti", "цензурировать", "to censor"),
            ("improvizuoti", "импровизировать", "to improvise"),
            ("suvokti", "осмыслить/воспринять", "to comprehend"),
            ("įtikinti", "убедить", "to convince"),
            ("atskleisti", "раскрыть", "to reveal/disclose"),
        ],
    },
    {
        "sort": 4,
        "title": "Gyvenimo būdas",
        "title_en": "Lifestyle",
        "vocab": [
            # Everyday life & society
            ("buitis", "быт/повседневная жизнь", "everyday life"),
            ("esmė", "суть/сущность", "essence"),
            ("išraiška", "выражение", "expression"),
            ("karta", "поколение", "generation"),
            ("lūkestis", "ожидание", "expectation"),
            ("maištas", "бунт/восстание", "rebellion/revolt"),
            ("norma", "норма", "norm"),
            ("paskirtis", "назначение/цель", "purpose/function"),
            ("pažanga", "прогресс", "progress"),
            ("pokytis", "изменение", "change"),
            ("poreikis", "потребность", "need/requirement"),
            ("poveikis", "воздействие/влияние", "effect/impact"),
            ("prabanga", "роскошь", "luxury"),
            ("realybė", "реальность", "reality"),
            ("riba", "граница/предел", "limit/boundary"),
            ("siekiamybė", "стремление/цель", "aspiration/goal"),
            ("tempas", "темп", "pace/tempo"),
            ("veiksnys", "фактор", "factor"),
            ("žingsnis", "шаг", "step"),
            # Emotions & wellbeing
            ("būsena", "состояние", "state/condition"),
            ("emocija", "эмоция", "emotion"),
            ("ištvermė", "выносливость", "endurance/stamina"),
            ("paguoda", "утешение", "consolation/comfort"),
            ("palaima", "блаженство", "bliss/blessing"),
            ("pojūtis", "ощущение/чувство", "sensation/feeling"),
            # Environment & ecology
            ("aplinkosauga", "охрана окружающей среды", "environmental protection"),
            ("atliekos", "отходы/мусор", "waste/refuse"),
            ("energija", "энергия", "energy"),
            ("ištekliai", "ресурсы", "resources"),
            ("perteklius", "излишек/избыток", "surplus/excess"),
            ("smogas", "смог", "smog"),
            ("tarša", "загрязнение", "pollution"),
            ("žaliava", "сырьё", "raw material"),
            # Adjectives – personal
            ("atsakingas", "ответственный", "responsible"),
            ("brandus", "зрелый", "mature/ripe"),
            ("imlus", "восприимчивый", "receptive"),
            ("naivus", "наивный", "naive"),
            ("nuoseklus", "последовательный", "consistent"),
            ("pastovus", "стабильный/постоянный", "stable/constant"),
            ("tobulas", "совершенный", "perfect"),
            ("tvirtas", "твёрдый/прочный", "firm/solid"),
            # Adjectives – environmental
            ("darnus", "гармоничный/устойчивый", "harmonious/sustainable"),
            ("kenksmingas", "вредный", "harmful"),
            ("saikingas", "умеренный", "moderate"),
            ("tvarus", "устойчивый", "sustainable"),
            ("veiksmingas", "эффективный", "effective"),
            ("žalingas", "вредный/опасный", "harmful/damaging"),
            # Verbs
            ("motyvuoti", "мотивировать", "to motivate"),
            ("įveikti", "преодолеть", "to overcome"),
            ("tausoti", "беречь/экономить", "to conserve/spare"),
            ("teršti", "загрязнять", "to pollute"),
            ("perdirbti", "перерабатывать", "to recycle"),
            ("tobulėti", "совершенствоваться", "to improve/develop"),
            ("konkuruoti", "конкурировать", "to compete"),
            ("skatinti", "поощрять/стимулировать", "to encourage/stimulate"),
            ("stokoti", "нуждаться/испытывать недостаток", "to lack/be short of"),
            ("atpalaiduoti", "расслаблять", "to relax/release"),
            ("atsigauti", "восстановиться", "to recover"),
        ],
    },
    {
        "sort": 5,
        "title": "Kelionės",
        "title_en": "Travel",
        "vocab": [
            # Travel types & people
            ("išvyka", "поездка/экскурсия", "trip/excursion"),
            ("žygis", "поход/экспедиция", "trek/expedition"),
            ("keliautojas", "путешественник", "traveler"),
            ("klajoklis", "бродяга/кочевник", "wanderer/nomad"),
            ("lankytojas", "посетитель", "visitor"),
            ("piligrimas", "паломник", "pilgrim"),
            ("žygeivis", "турист-пешеходник", "hiker"),
            # Travel experiences
            ("įžymybė", "знаменитость/достопримечательность", "landmark/celebrity"),
            ("lauktuvės", "сувениры/подарки из поездки", "souvenirs/travel gifts"),
            ("stebuklas", "чудо", "miracle/wonder"),
            ("akimirka", "мгновение/момент", "moment/instant"),
            ("įspūdis", "впечатление", "impression"),
            ("išbandymas", "испытание/вызов", "challenge/test"),
            ("išgyvenimas", "переживание/выживание", "experience/survival"),
            ("jaudulys", "волнение/возбуждение", "excitement/thrill"),
            ("nuotykis", "приключение", "adventure"),
            ("nuovargis", "усталость", "fatigue/tiredness"),
            ("pavojus", "опасность", "danger"),
            ("sumanymas", "идея/план", "idea/plan"),
            # Navigation
            ("atstumas", "расстояние", "distance"),
            ("kryptis", "направление", "direction"),
            ("posūkis", "поворот", "turn/turning point"),
            # Accommodation
            ("nakvynė", "ночлег", "overnight stay"),
            ("stovyklavietė", "кемпинг", "campsite"),
            # Time of day
            ("aušra", "рассвет/заря", "dawn"),
            ("sutemos", "сумерки", "dusk/twilight"),
            # Geography & nature phenomena
            ("ašigalis", "полюс", "pole (geographic)"),
            ("atogražos", "тропики", "tropics"),
            ("cunamis", "цунами", "tsunami"),
            ("dykuma", "пустыня", "desert"),
            ("džiunglės", "джунгли", "jungle"),
            ("krioklys", "водопад", "waterfall"),
            ("ledynas", "ледник", "glacier"),
            ("ola", "пещера", "cave"),
            ("potvynis", "наводнение", "flood"),
            ("prerija", "прерия", "prairie"),
            ("stepė", "степь", "steppe"),
            ("taiga", "тайга", "taiga"),
            ("tundra", "тундра", "tundra"),
            ("ugnikalnis", "вулкан", "volcano"),
            ("žemės drebėjimas", "землетрясение", "earthquake"),
            # Adjectives
            ("įspūdingas", "впечатляющий", "impressive"),
            ("bekraštis", "бескрайний", "boundless"),
            ("laukinis", "дикий", "wild"),
            ("neišdildomas", "неизгладимый", "indelible"),
            ("nuostabus", "удивительный", "amazing/wonderful"),
            ("paslaptingas", "загадочный/таинственный", "mysterious"),
            ("smalsus", "любопытный", "curious"),
            ("vaizdingas", "живописный", "scenic/picturesque"),
            ("svetingas", "гостеприимный", "hospitable"),
            ("žavingas", "очаровательный", "charming/enchanting"),
            ("atšiaurus", "суровый/жёсткий", "harsh/severe"),
            # Adverbs
            ("galiausiai", "в конце концов", "finally/ultimately"),
            ("žūtbūt", "во что бы то ни стало", "at all costs"),
            # Verbs
            ("keliauti", "путешествовать", "to travel"),
            ("klajoti", "скитаться/бродить", "to wander/roam"),
            ("kopti", "подниматься", "to climb"),
            ("pasiklysti", "заблудиться", "to get lost"),
            ("apsistoti", "остановиться", "to stay/stop over"),
            ("žygiuoti", "маршировать/идти в поход", "to march/hike"),
            ("mėgautis", "наслаждаться", "to enjoy"),
            ("stebėtis", "удивляться", "to marvel/be amazed"),
            ("atsikvėpti", "перевести дыхание", "to catch one's breath"),
            ("susidurti", "столкнуться/встретиться", "to encounter/face"),
        ],
    },
]


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
            name_ru="Не дня без литовского — Книга 3",
            name_en="Not a Day Without Lithuanian — Book 3",
            cefr_level="C1",
            difficulty="hard",
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
            vocab = lesson["vocab"]
            print(f"  Using {len(vocab)} words for '{lesson['title']}'")

            # 2. Create WordList
            wl = WordList(
                title=lesson["title"],
                title_en=lesson["title_en"],
                subcategory=PROGRAM_KEY,
                is_public=True,
                sort_order=lesson["sort"],
                cefr_level="C1",
                difficulty="hard",
            )
            session.add(wl)
            session.flush()
            total_lists += 1

            # 3. Create Words + WordListItems
            for pos, (lt, ru, en) in enumerate(vocab):
                lt_key = lt.lower().strip()

                if lt_key in word_cache:
                    word_id = word_cache[lt_key]
                else:
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
