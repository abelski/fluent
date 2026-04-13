"""One-shot seed script: create 'Ne dienos be lietuvių kalbos — Book 2' program.

Creates:
  - 1 SubcategoryMeta (key='lithuanian_daily_language_2', status='draft')
  - 10 WordList rows (one per chapter)
  - Word + WordListItem rows for each vocabulary entry

Run from backend/: python seed_ne_dienos_2.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from database import engine
from models import SubcategoryMeta, WordList, Word, WordListItem
from sqlmodel import Session, select

PROGRAM_KEY = "lithuanian_daily_language_2"

# ---------------------------------------------------------------------------
# Lesson metadata with inline vocabulary (lithuanian, russian, english)
# ---------------------------------------------------------------------------

LESSONS = [
    {
        "sort": 0,
        "title": "Jūs būtinai atvažiuokite čia",
        "title_en": "You must come here",
        "vocab": [
            # Nouns – geography & terrain
            ("apylinkė", "окрестность", "surroundings/area"),
            ("regionas", "регион", "region"),
            ("šalis", "страна", "country"),
            ("vietovė", "местность", "locality"),
            ("aukštuma", "возвышенность", "highland"),
            ("lyguma", "равнина", "plain"),
            ("žemuma", "низменность", "lowland"),
            ("ežeras", "озеро", "lake"),
            ("jūra", "море", "sea"),
            ("upė", "река", "river"),
            ("vandenynas", "океан", "ocean"),
            ("pelkė", "болото", "swamp/marsh"),
            ("šaltinis", "источник", "spring/source"),
            ("kalnas", "гора", "mountain"),
            ("kalva", "холм", "hill"),
            ("sala", "остров", "island"),
            ("pusiasalis", "полуостров", "peninsula"),
            ("pakrantė", "побережье", "coast/shore"),
            ("krantas", "берег", "bank/shore"),
            ("miškas", "лес", "forest"),
            ("giria", "чаща/дубрава", "woods"),
            ("šilas", "сосновый бор", "pine forest"),
            # Protected areas & navigation
            ("draustinis", "заказник", "nature reserve"),
            ("nacionalinis parkas", "национальный парк", "national park"),
            ("rezervatas", "заповедник", "strict nature reserve"),
            ("maršrutas", "маршрут", "route"),
            ("atstumas", "расстояние", "distance"),
            ("kryptis", "направление", "direction"),
            # Language
            ("kalba", "язык", "language"),
            ("tarmė", "диалект", "dialect"),
            ("garsas", "звук", "sound"),
            ("raidė", "буква", "letter"),
            ("žodis", "слово", "word"),
            ("tarimas", "произношение", "pronunciation"),
            ("rašyba", "правописание", "spelling/orthography"),
            ("norma", "норма", "norm/standard"),
            ("vertimas", "перевод", "translation"),
            # Adjectives
            ("gilus", "глубокий", "deep"),
            ("erdvus", "просторный", "spacious"),
            ("tankus", "густой", "dense/thick"),
            ("vešlus", "пышный", "lush"),
            ("skaidrus", "прозрачный", "clear/transparent"),
            ("sraunus", "стремительный", "swift/rapid"),
            # Verbs
            ("tekėti", "течь", "to flow"),
            ("lankyti", "посещать", "to visit"),
            ("stebėtis", "удивляться/любоваться", "to marvel"),
            ("žavėtis", "восхищаться", "to be charmed/admire"),
            ("viešėti", "гостить", "to stay as a guest"),
        ],
    },
    {
        "sort": 1,
        "title": "Labai smagu čia gyventi",
        "title_en": "It is very nice to live here",
        "vocab": [
            # Settlement types
            ("miestas", "город", "city"),
            ("sostinė", "столица", "capital"),
            ("miestelis", "посёлок", "small town"),
            ("kaimas", "деревня/село", "village"),
            ("gyvenvietė", "населённый пункт", "settlement"),
            # History & landmarks
            ("istorija", "история", "history"),
            ("legenda", "легенда", "legend"),
            ("bokštas", "башня", "tower"),
            ("rūmai", "дворец", "palace"),
            ("dvaras", "поместье/усадьба", "manor/estate"),
            ("vienuolynas", "монастырь", "monastery"),
            ("paminklas", "памятник", "monument"),
            ("pastatas", "здание", "building"),
            ("rotušė", "ратуша", "town hall"),
            ("griuvėsiai", "руины", "ruins"),
            ("herbas", "герб", "coat of arms"),
            ("vėliava", "флаг", "flag"),
            # Time & people
            ("amžius", "век/столетие", "century"),
            ("praeitis", "прошлое", "past"),
            ("dabartis", "настоящее", "present"),
            ("valdovas", "правитель", "ruler"),
            ("karalius", "король", "king"),
            ("kunigaikštis", "князь", "duke/prince"),
            ("įkūrėjas", "основатель", "founder"),
            # Architecture styles
            ("architektūra", "архитектура", "architecture"),
            ("gotika", "готика", "Gothic"),
            ("barokas", "барокко", "baroque"),
            ("klasicizmas", "классицизм", "classicism"),
            ("stilius", "стиль", "style"),
            # Adjectives
            ("didingas", "величественный", "majestic/grand"),
            ("prabangus", "роскошный", "luxurious"),
            ("šiuolaikiškas", "современный", "modern"),
            ("turtingas", "богатый", "rich"),
            ("įžymus", "знаменитый", "renowned"),
            ("jaukus", "уютный", "cozy"),
            # Verbs
            ("įkurti", "основать", "to found/establish"),
            ("statyti", "строить", "to build"),
            ("klestėti", "процветать", "to flourish"),
            ("kovoti", "сражаться", "to fight"),
            ("valdyti", "управлять", "to rule/govern"),
            ("saugoti", "охранять/защищать", "to protect"),
        ],
    },
    {
        "sort": 2,
        "title": "Tegul meilė Lietuvos dega mūsų širdyse",
        "title_en": "Let love of Lithuania burn in our hearts",
        "vocab": [
            # State & society
            ("valstybė", "государство", "state"),
            ("tauta", "нация/народ", "nation/people"),
            ("visuomenė", "общество", "society"),
            ("pilietis", "гражданин", "citizen"),
            ("valdžia", "власть", "power/authority"),
            # Government institutions
            ("parlamentas", "парламент/сейм", "parliament"),
            ("vyriausybė", "правительство", "government"),
            ("prezidentas", "президент", "president"),
            ("ministras", "министр", "minister"),
            ("meras", "мэр", "mayor"),
            ("savivaldybė", "самоуправление/муниципалитет", "municipality"),
            # Political life
            ("rinkimai", "выборы", "elections"),
            ("partija", "партия", "party"),
            ("kandidatas", "кандидат", "candidate"),
            ("rinkėjas", "избиратель", "voter"),
            ("opozicija", "оппозиция", "opposition"),
            ("referendumas", "референдум", "referendum"),
            ("politika", "политика", "politics/policy"),
            ("politikas", "политик", "politician"),
            # Rights & values
            ("demokratija", "демократия", "democracy"),
            ("konstitucija", "конституция", "constitution"),
            ("nepriklausomybė", "независимость", "independence"),
            ("laisvė", "свобода", "freedom"),
            ("teisė", "право", "right/law"),
            ("įstatymas", "закон", "law"),
            # Economy
            ("biudžetas", "бюджет", "budget"),
            ("pajamos", "доходы", "income"),
            ("pensija", "пенсия", "pension"),
            ("pašalpa", "пособие", "allowance/benefit"),
            ("parama", "поддержка", "support/aid"),
            # Adjectives
            ("demokratiškas", "демократический", "democratic"),
            ("nepriklausomas", "независимый", "independent"),
            ("ryžtingas", "решительный", "resolute/determined"),
            ("tikras", "настоящий/истинный", "real/genuine"),
            ("žinomas", "известный", "known/famous"),
            # Verbs
            ("balsuoti", "голосовать", "to vote"),
            ("rinkti", "выбирать/избирать", "to elect"),
            ("spręsti", "решать", "to decide"),
            ("atstovauti", "представлять", "to represent"),
            ("remtis", "опираться", "to rely on"),
        ],
    },
    {
        "sort": 3,
        "title": "Mokslo šaknys karčios, bet vaisiai saldūs",
        "title_en": "The roots of knowledge are bitter, but the fruits are sweet",
        "vocab": [
            # Education institutions
            ("mokykla", "школа", "school"),
            ("pradinė mokykla", "начальная школа", "primary school"),
            ("vidurinė mokykla", "средняя школа", "secondary school"),
            ("gimnazija", "гимназия", "gymnasium/grammar school"),
            ("universitetas", "университет", "university"),
            ("kolegija", "колледж", "college"),
            ("akademija", "академия", "academy"),
            ("fakultetas", "факультет", "faculty/department"),
            ("laboratorija", "лаборатория", "laboratory"),
            # People in education
            ("mokinys", "ученик", "pupil"),
            ("studentas", "студент", "student"),
            ("mokytojas", "учитель", "teacher"),
            ("dėstytojas", "преподаватель", "lecturer"),
            ("profesorius", "профессор", "professor"),
            ("doktorantas", "докторант", "doctoral student"),
            # Subjects
            ("matematika", "математика", "mathematics"),
            ("fizika", "физика", "physics"),
            ("chemija", "химия", "chemistry"),
            ("istorija", "история", "history"),
            ("literatūra", "литература", "literature"),
            ("dailė", "изобразительное искусство", "art"),
            # Exams & grades
            ("egzaminas", "экзамен", "exam"),
            ("egzaminas raštu", "письменный экзамен", "written exam"),
            ("egzaminas žodžiu", "устный экзамен", "oral exam"),
            ("diplomas", "диплом", "diploma"),
            ("atestatas", "аттестат", "school-leaving certificate"),
            ("balas", "балл/оценка", "grade/point"),
            ("taškas", "очко/балл", "point/mark"),
            ("sesija", "экзаменационная сессия", "exam session"),
            # Language learning
            ("kalbėjimas", "говорение", "speaking"),
            ("klausymas", "слушание", "listening"),
            ("rašymas", "письмо", "writing"),
            ("skaitymas", "чтение", "reading"),
            ("gramatika", "грамматика", "grammar"),
            ("žodynas", "словарь/лексика", "vocabulary"),
            ("vertimas", "перевод", "translation"),
            # Adjectives
            ("gabus", "способный/талантливый", "gifted/talented"),
            ("darbštus", "трудолюбивый", "hardworking"),
            ("kruopštus", "тщательный/усердный", "thorough/diligent"),
            ("atidus", "внимательный", "attentive"),
            ("smalsus", "любознательный", "curious"),
            # Verbs
            ("mokytis", "учиться", "to study/learn"),
            ("studijuoti", "учиться в вузе", "to study at university"),
            ("suprasti", "понимать", "to understand"),
            ("mokyti", "учить/преподавать", "to teach"),
            ("egzaminuoti", "экзаменовать", "to examine"),
        ],
    },
    {
        "sort": 4,
        "title": "Knygų pasaulis yra stebuklingas",
        "title_en": "The world of books is magical",
        "vocab": [
            # Books & publications
            ("knyga", "книга", "book"),
            ("kūrinys", "произведение", "literary work"),
            ("rankraštis", "рукопись", "manuscript"),
            ("vadovėlis", "учебник", "textbook"),
            ("leidinys", "издание", "publication"),
            ("viršelis", "обложка", "cover"),
            ("puslapis", "страница", "page"),
            ("skyrius", "глава/раздел", "chapter/section"),
            ("turinys", "содержание", "table of contents"),
            # Literary genres
            ("romanas", "роман", "novel"),
            ("apsakymas", "рассказ", "short story"),
            ("eilėraštis", "стихотворение", "poem"),
            ("drama", "драма", "drama"),
            ("pasaka", "сказка", "fairy tale"),
            ("satyra", "сатира", "satire"),
            ("humoreska", "юмористический рассказ", "humorous story"),
            ("detektyvinis romanas", "детективный роман", "detective novel"),
            # People in publishing
            ("autorius", "автор", "author"),
            ("rašytojas", "писатель", "writer"),
            ("poetas", "поэт", "poet"),
            ("redaktorius", "редактор", "editor"),
            ("leidėjas", "издатель", "publisher"),
            ("vertėjas", "переводчик", "translator"),
            ("leidykla", "издательство", "publishing house"),
            # Media
            ("žiniasklaida", "СМИ", "mass media"),
            ("laikraštis", "газета", "newspaper"),
            ("žurnalas", "журнал", "magazine"),
            ("žurnalistas", "журналист", "journalist"),
            ("straipsnis", "статья", "article"),
            ("internetas", "интернет", "internet"),
            ("tinklaraštis", "блог", "blog"),
            ("svetainė", "веб-сайт", "website"),
            # TV & film
            ("televizija", "телевидение", "television"),
            ("filmas", "фильм", "film/movie"),
            ("serialas", "сериал", "series/serial"),
            ("dokumentinis filmas", "документальный фильм", "documentary"),
            ("siaubo filmas", "фильм ужасов", "horror film"),
            ("komedija", "комедия", "comedy"),
            # Verbs
            ("skaityti", "читать", "to read"),
            ("rašyti", "писать", "to write"),
            ("leisti", "издавать", "to publish"),
            ("naršyti", "просматривать (интернет)", "to browse"),
            ("stebėti", "наблюдать/смотреть", "to watch/observe"),
        ],
    },
    {
        "sort": 5,
        "title": "Pasodintas medis – gražiausias paminklas",
        "title_en": "A planted tree is the most beautiful monument",
        "vocab": [
            # Traditions & customs
            ("tradicija", "традиция", "tradition"),
            ("paprotys", "обычай", "custom"),
            ("apeiga", "обряд/ритуал", "rite/ceremony"),
            ("šventė", "праздник", "holiday/celebration"),
            ("renginys", "мероприятие/событие", "event"),
            ("atmintis", "память", "memory"),
            ("pagarba", "уважение", "respect"),
            # Celebrations
            ("gimimo diena", "день рождения", "birthday"),
            ("vardo diena", "именины", "name day"),
            ("Joninės", "Купала/Иванов день", "Midsummer/St. John's Day"),
            ("burtai", "гадание/колдовство", "fortune-telling/magic"),
            ("laužas", "костёр", "bonfire"),
            ("vainikas", "венок", "wreath"),
            ("linkėjimai", "пожелания", "wishes/greetings"),
            # Music & folk culture
            ("daina", "песня", "song"),
            ("giesmė", "псалом/гимн", "hymn/chant"),
            ("sutartinė", "старинная литовская песня", "Lithuanian folk round"),
            ("liaudies daina", "народная песня", "folk song"),
            # All Souls' Day
            ("Vėlinės", "День поминовения усопших", "All Souls' Day"),
            ("kapas", "могила", "grave"),
            ("kapinės", "кладбище", "cemetery"),
            ("metinės", "годовщина", "anniversary"),
            # Feelings & values
            ("džiaugsmas", "радость", "joy"),
            ("liūdesys", "печаль/грусть", "sadness"),
            ("svarba", "важность/значение", "importance"),
            # Adjectives
            ("šventas", "святой/священный", "holy/sacred"),
            ("šventiškas", "праздничный", "festive"),
            ("tradicinis", "традиционный", "traditional"),
            ("ypatingas", "особый", "special"),
            ("nepaprastas", "необычный/замечательный", "unusual/extraordinary"),
            ("būdingas", "характерный", "characteristic/typical"),
            ("vienintelis", "единственный", "only/unique"),
            # Verbs
            ("švęsti", "праздновать", "to celebrate"),
            ("rengti", "организовывать", "to organize"),
            ("giedoti", "петь (псалмы/гимны)", "to chant/sing"),
            ("pinti", "плести", "to braid/weave"),
            ("sveikinti", "поздравлять", "to congratulate"),
            ("aukoti", "жертвовать", "to sacrifice/offer"),
        ],
    },
    {
        "sort": 6,
        "title": "Laimingas žmogus – tai aš",
        "title_en": "A happy person — that's me",
        "vocab": [
            # Character & personality
            ("charakteris", "характер", "character"),
            ("asmenybė", "личность", "personality"),
            ("bruožas", "черта характера", "character trait"),
            ("emocijos", "эмоции", "emotions"),
            ("nuotaika", "настроение", "mood"),
            ("temperamentas", "темперамент", "temperament"),
            ("vertybė", "ценность", "value"),
            # Moral concepts
            ("meilė", "любовь", "love"),
            ("garbė", "честь/слава", "honour"),
            ("melas", "ложь", "lie"),
            ("nerimas", "тревога/беспокойство", "anxiety/worry"),
            ("pavydas", "зависть", "envy/jealousy"),
            ("pyktis", "злость/гнев", "anger"),
            ("ramybė", "спокойствие", "peace/calm"),
            ("viltis", "надежда", "hope"),
            ("pasitikėjimas", "доверие/уверенность", "trust/confidence"),
            # Positive adjectives
            ("nuoširdus", "искренний", "sincere"),
            ("dosnus", "щедрый", "generous"),
            ("draugiškas", "дружелюбный", "friendly"),
            ("jautrus", "чувствительный/чуткий", "sensitive"),
            ("kantrus", "терпеливый", "patient"),
            ("mandagus", "вежливый", "polite"),
            ("švelnus", "нежный/мягкий", "gentle/tender"),
            ("sąžiningas", "честный/добросовестный", "honest"),
            ("ramus", "спокойный", "calm"),
            ("sumanus", "умный/ловкий", "clever/resourceful"),
            # Negative adjectives
            ("abejingas", "равнодушный", "indifferent"),
            ("agresyvus", "агрессивный", "aggressive"),
            ("kerštingas", "мстительный", "vindictive"),
            ("tingus", "ленивый", "lazy"),
            ("meilus", "ласковый", "affectionate"),
            ("žavus", "очаровательный", "charming"),
            ("šykštus", "скупой", "stingy"),
            ("taupus", "бережливый", "thrifty"),
            # Verbs
            ("draugauti", "дружить", "to be friends"),
            ("atleisti", "простить", "to forgive"),
            ("juoktis", "смеяться", "to laugh"),
            ("bijoti", "бояться", "to be afraid"),
            ("pasitikėti", "доверять", "to trust"),
            ("meluoti", "лгать/врать", "to lie"),
            ("apgauti", "обмануть", "to deceive"),
        ],
    },
    {
        "sort": 7,
        "title": "Darbas darbą veja",
        "title_en": "Work follows work",
        "vocab": [
            # Utilities & electricity
            ("elektra", "электричество", "electricity"),
            ("lemputė", "лампочка", "light bulb"),
            ("jungiklis", "выключатель", "switch"),
            ("kabelis", "кабель", "cable"),
            ("laidas", "провод", "wire"),
            ("kištukas", "вилка (электрическая)", "plug"),
            ("čiaupas", "кран (водопроводный)", "faucet/tap"),
            ("dujos", "газ", "gas"),
            ("šildymas", "отопление", "heating"),
            ("šiluma", "тепло", "warmth/heat"),
            ("krosnis", "печь", "stove/oven"),
            ("židinys", "камин", "fireplace"),
            # Appliances
            ("šaldytuvas", "холодильник", "refrigerator"),
            ("skalbyklė", "стиральная машина", "washing machine"),
            ("mikrobangų krosnelė", "микроволновая печь", "microwave"),
            ("dulkių siurblys", "пылесос", "vacuum cleaner"),
            ("indaplovė", "посудомоечная машина", "dishwasher"),
            # Tools
            ("plaktukas", "молоток", "hammer"),
            ("pjūklas", "пила", "saw"),
            ("replės", "плоскогубцы", "pliers"),
            ("atsuktuvas", "отвёртка", "screwdriver"),
            ("grąžtas", "сверло", "drill/drill bit"),
            ("kirvis", "топор", "axe"),
            # Craftsmen
            ("meistras", "мастер", "craftsman/repairman"),
            ("elektrikas", "электрик", "electrician"),
            ("santechnikas", "сантехник", "plumber"),
            ("stalius", "столяр", "carpenter"),
            # Car vocabulary
            ("automobilis", "автомобиль", "car"),
            ("vairas", "руль", "steering wheel"),
            ("stabdžiai", "тормоза", "brakes"),
            ("padangos", "шины", "tyres"),
            ("degalai", "топливо", "fuel"),
            ("benzinas", "бензин", "petrol"),
            ("variklis", "двигатель", "engine"),
            ("greitis", "скорость", "speed"),
            # Adjectives
            ("švarus", "чистый", "clean"),
            ("tvarkingas", "аккуратный/в порядке", "neat/tidy"),
            ("patogus", "удобный", "comfortable"),
            ("erdvus", "просторный", "spacious"),
            ("ankštas", "тесный", "cramped/narrow"),
            # Verbs
            ("remontuoti", "ремонтировать", "to repair"),
            ("taisyti", "ремонтировать/исправлять", "to fix/repair"),
            ("dažyti", "красить", "to paint"),
            ("montuoti", "монтировать/устанавливать", "to install"),
            ("gaisinti", "тушить (пожар)", "to extinguish"),
        ],
    },
    {
        "sort": 8,
        "title": "Saldu gardu kaip devyni medūs",
        "title_en": "Sweet and tasty like nine honeys",
        "vocab": [
            # Dishes & courses
            ("patiekalas", "блюдо", "dish/course"),
            ("kepsnys", "жаркое/котлета", "roast/steak"),
            ("troškinys", "рагу/тушёное мясо", "stew"),
            ("sriuba", "суп", "soup"),
            ("padažas", "соус", "sauce"),
            ("užkandis", "закуска/перекус", "snack/appetizer"),
            # Fish
            ("žuvis", "рыба", "fish"),
            ("silkė", "сельдь", "herring"),
            ("lašiša", "лосось", "salmon"),
            ("karpis", "карп", "carp"),
            ("lydeka", "щука", "pike"),
            # Meat
            ("mėsa", "мясо", "meat"),
            ("vištiena", "курятина", "chicken"),
            ("jautiena", "говядина", "beef"),
            ("kiauliena", "свинина", "pork"),
            ("aviena", "баранина", "lamb/mutton"),
            # Grains
            ("kruopos", "крупа", "groats/grains"),
            ("avižinės", "овсяная крупа", "oat groats"),
            ("grikiai", "гречка", "buckwheat"),
            ("manai", "манная крупа", "semolina"),
            # Lithuanian dishes
            ("cepelinai", "цеппелины (картофельные кнели)", "potato dumplings"),
            ("bulviniai blynai", "картофельные блины", "potato pancakes"),
            ("virtiniai", "вареники", "dumplings"),
            # Spices
            ("prieskoniai", "специи/приправы", "spices/seasonings"),
            ("pipirai", "перец", "pepper"),
            ("cinamonas", "корица", "cinnamon"),
            ("imbieras", "имбирь", "ginger"),
            ("petražolės", "петрушка", "parsley"),
            ("krapai", "укроп", "dill"),
            # Sweets
            ("tortas", "торт", "cake"),
            ("saldainis", "конфета", "candy/sweet"),
            ("šokoladas", "шоколад", "chocolate"),
            ("sausainis", "печенье", "biscuit/cookie"),
            # Taste adjectives
            ("saldus", "сладкий", "sweet"),
            ("aitrus", "острый (кислый/горький)", "sharp/tart"),
            ("aštrus", "острый (перечный)", "spicy/pungent"),
            ("rūgštus", "кислый", "sour"),
            ("kartus", "горький", "bitter"),
            ("sūrus", "солёный", "salty"),
            # Cooking state adjectives
            ("keptas", "жареный/запечённый", "fried/baked"),
            ("virtas", "варёный", "boiled/cooked"),
            ("troškintas", "тушёный", "stewed/braised"),
            ("rūkytas", "копчёный", "smoked"),
            # Verbs
            ("kepti", "жарить/печь", "to fry/bake"),
            ("virti", "варить", "to boil/cook"),
            ("ragauti", "пробовать", "to taste"),
            ("sūdyti", "солить", "to salt"),
            ("kepinti", "поджаривать", "to roast/fry"),
        ],
    },
    {
        "sort": 9,
        "title": "Tai upės ir medžio, ir paukščio – ir tavo namai!",
        "title_en": "This is the river and the tree and the bird — and your home!",
        "vocab": [
            # Plants & ecology
            ("augalas", "растение", "plant"),
            ("gamta", "природа", "nature"),
            ("gamtosauga", "охрана природы", "nature conservation"),
            ("gyvūnas", "животное", "animal/creature"),
            ("Raudonoji knyga", "Красная книга", "Red Book/Red List"),
            # Flowers & herbs
            ("gėlė", "цветок", "flower"),
            ("žolė", "трава", "grass/herb"),
            ("čiobrelis", "тимьян", "thyme"),
            ("dobilas", "клевер", "clover"),
            ("ramunė", "ромашка", "chamomile"),
            ("aguona", "мак", "poppy"),
            ("rugiagėlė", "василёк", "cornflower"),
            ("pakalnutė", "ландыш", "lily of the valley"),
            ("dilgėlė", "крапива", "nettle"),
            # Plant parts
            ("lapas", "лист", "leaf"),
            ("šaknis", "корень", "root"),
            ("žiedas", "цветок/соцветие", "flower/blossom"),
            ("sėkla", "семя/семечко", "seed"),
            ("stiebas", "стебель", "stem"),
            # Trees
            ("medis", "дерево", "tree"),
            ("beržas", "берёза", "birch"),
            ("ąžuolas", "дуб", "oak"),
            ("eglė", "ель/пихта", "spruce/fir"),
            ("pušis", "сосна", "pine"),
            ("liepa", "липа", "linden tree"),
            ("klevas", "клён", "maple"),
            ("kamienas", "ствол", "trunk"),
            ("šaka", "ветка", "branch"),
            ("žievė", "кора", "bark"),
            # Mushrooms
            ("grybas", "гриб", "mushroom"),
            ("baravykas", "белый гриб/боровик", "porcini mushroom"),
            ("voveraitė", "лисичка", "chanterelle"),
            ("musmirė", "мухомор", "fly agaric"),
            # Berries
            ("avietės", "малина", "raspberries"),
            ("mėlynės", "черника", "blueberries"),
            ("žemuogės", "земляника", "wild strawberries"),
            ("bruknės", "брусника", "lingonberries"),
            ("spanguolės", "клюква", "cranberries"),
            # Adjectives
            ("retas", "редкий", "rare"),
            ("kvapnus", "душистый/ароматный", "fragrant"),
            ("vešlus", "пышный/густой", "lush"),
            ("tankus", "густой/плотный", "dense/thick"),
            # Verbs
            ("žydėti", "цвести", "to bloom/flower"),
            ("augti", "расти", "to grow"),
            ("skinti", "срывать/собирать", "to pick/pluck"),
            ("uogauti", "собирать ягоды", "to pick berries"),
            ("grybauti", "собирать грибы", "to pick mushrooms"),
            ("saugoti", "сохранять/защищать", "to protect/save"),
            ("nykti", "исчезать", "to disappear/die out"),
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
            name_ru="Не дня без литовского — Книга 2",
            name_en="Not a Day Without Lithuanian — Book 2",
            cefr_level="B1-B2",
            difficulty="medium",
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
                cefr_level="B1-B2",
                difficulty="medium",
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
