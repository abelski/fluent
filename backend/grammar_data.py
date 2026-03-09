"""
Static Lithuanian grammar data extracted from suprantu.lt/treniruoklis.
Lesson configs, word declensions (71 words), and sentence templates.
No runtime network dependency.
"""
import random

# ── Word declension table ─────────────────────────────────────────────────────
# Each entry: [stem, idx1..14_endings, russian_translation]
# Indices 1-7 = singular cases, 8-14 = plural cases
# ! prefix means irregular/unused form (skip in exercises)
WORDS = [
    ["nam","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","дом"],
    ["kel","ias","io","iui","ią","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","дорога"],
    ["brol","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","брат"],
    ["kambar","ys","io","iui","į","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","комната"],
    ["knyg","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","книга"],
    ["vyšn","ia","ios","iai","ią","ia","ioje","ia","ios","ių","ioms","ias","iomis","iose","ios","вишня"],
    ["gatv","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","улица"],
    ["pil","is","ies","iai","į","imi","yje","ie","ys","ių","ims","is","imis","yse","ys","замок"],
    ["dant","is","ies","!iui","į","imi","yje","ie","ys","ų","ims","is","imis","yse","ys","зуб"],
    ["sūn","us","aus","ui","ų","umi","uje","au","ūs","ų","ums","us","umis","uose","ūs","сын"],
    ["vais","ius","iaus","iui","ių","iumi","iuje","iau","iai","ių","iams","ius","iais","iuose","iai","плод"],
    ["akm","uo","ens","eniui","enį","eniu","enyje","enie","enys","enų","enims","enis","enimis","enyse","enys","камень"],
    ["ses","uo","ers","eriai","erį","eria","eryje","erie","erys","erų","erims","eris","erimis","eryse","erys","сестра"],
    ["dukt","ė","ers","eriai","erį","eria","eryje","erie","erys","erų","erims","eris","erimis","eryse","erys","дочь"],
    ["agurk","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","огурец"],
    ["centr","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","центр"],
    ["sod","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","сад"],
    ["tort","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","торт"],
    ["desert","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","десерт"],
    ["draug","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","друг"],
    ["rajon","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","район"],
    ["universitet","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","университет"],
    ["staliuk","as","o","ui","ą","u","e","e","ai","ų","ams","us","ais","uose","ai","столик"],
    ["veln","ias","io","iui","ią","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","черт"],
    ["sveč","ias","io","iui","ią","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","гость"],
    ["eln","ias","io","iui","ią","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","олень"],
    ["maišel","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","пакет"],
    ["pyragait","is","!io","!iui","į","!iu","yje","i","!iai","!ių","!iams","!ius","!iais","!iuose","!iai","пирожное"],
    ["tėvel","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","отец"],
    ["burokėl","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","свекла"],
    ["sumuštin","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","бутерброд"],
    ["senel","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","дедушка"],
    ["puodel","is","io","iui","į","iu","yje","i","iai","ių","iams","ius","iais","iuose","iai","чашка"],
    ["obuol","ys","io","iui","į","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","яблоко"],
    ["virdul","ys","io","iui","į","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","чайник"],
    ["pirkin","ys","io","iui","į","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","покупка"],
    ["švytur","ys","io","iui","į","iu","yje","y","iai","ių","iams","ius","iais","iuose","iai","маяк"],
    ["mork","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","морковь"],
    ["sodyb","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","усадьба"],
    ["padavėj","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","официантка"],
    ["dukr","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","дочь"],
    ["citrin","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","лимон"],
    ["katedr","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","кафедральный собор"],
    ["spurg","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","пончик"],
    ["mam","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","мама"],
    ["slyv","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","слива"],
    ["nuolaid","a","os","ai","ą","a","oje","a","os","ų","oms","as","omis","ose","os","скидка"],
    ["bažnyč","ia","ios","iai","ią","ia","ioje","ia","ios","ių","ioms","ias","iomis","iose","ios","церковь"],
    ["žin","ia","ios","iai","ią","ia","ioje","ia","ios","ių","ioms","ias","iomis","iose","ios","новость"],
    ["pon","ia","ios","iai","ią","ia","ioje","ia","ios","ių","ioms","ias","iomis","iose","ios","госпожа"],
    ["dvas","ia","ios","iai","ią","ia","ioje","ia","ios","ių","ioms","ias","iomis","iose","ios","дух"],
    ["brašk","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","клубника"],
    ["aikšt","ė","ės","ei","ę","e","ėje","e","ės","!ių","ėms","es","ėmis","ėse","ės","площадь"],
    ["rotuš","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","ратуша"],
    ["bandel","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","булочка"],
    ["kriauš","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","груша"],
    ["servetel","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","салфетка"],
    ["draug","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","подруга"],
    ["dešrel","ė","ės","ei","ę","e","ėje","e","ės","ių","ėms","es","ėmis","ėse","ės","сосиска"],
    ["lėkštut","ė","ės","ei","ę","e","ėje","e","ės","!ių","ėms","es","ėmis","ėse","ės","блюдечко"],
    ["močiut","ė","ės","ei","ę","e","ėje","e","ės","!ių","ėms","es","ėmis","ėse","ės","бабушка"],
    ["žuv","is","ies","iai","į","imi","yje","ie","ys","ių","ims","is","imis","yse","ys","рыба"],
    ["stot","is","ies","!iai","į","imi","yje","ie","ys","!ių","ims","is","imis","yse","ys","вокзал"],
    ["šird","is","ies","!iai","į","imi","yje","ie","ys","!ių","ims","is","imis","yse","ys","сердце"],
    ["nakt","is","ies","!iai","į","imi","yje","ie","ys","ų","ims","is","imis","yse","ys","ночь"],
    ["mint","is","ies","!iai","į","imi","yje","ie","ys","!ių","ims","is","imis","yse","ys","мысль"],
    ["muziej","us","aus","ui","ų","umi","uje","au","ūs","ų","ums","us","umis","uose","ūs","музей"],
    ["turg","us","aus","ui","ų","umi","uje","au","ūs","ų","ums","us","umis","uose","ūs","рынок"],
    ["aktor","ius","iaus","iui","ių","iumi","iuje","iau","iai","ių","iams","ius","iais","iuose","iai","актер"],
    ["profesor","ius","iaus","iui","ių","iumi","iuje","iau","iai","ių","iams","ius","iais","iuose","iai","профессор"],
    ["vand","uo","ens","eniui","enį","eniu","enyje","enie","enys","enų","enims","enis","enimis","enyse","enys","вода"],
]

# ── Lesson configuration ──────────────────────────────────────────────────────
# [id, level, [case_indices], task_count, title]
# case_indices: 1=Vard.Vns, 2=Kilm.Vns, 3=Naud.Vns, 4=Galin.Vns,
#               5=Įnag.Vns, 6=Viet.Vns, 7=Šauksm.Vns,
#               8=Vard.Dgs, 9=Kilm.Dgs, 10=Naud.Dgs, 11=Galin.Dgs,
#               12=Įnag.Dgs, 13=Viet.Dgs, 14=Šauksm.Dgs
LESSON_CONFIG = [
    [1,"basic",[4],24,"Galininkas Vns."],
    [2,"advanced",[4],35,"Galininkas Vns."],
    [3,"practice",[4],20,"Galininkas Vns."],
    [4,"basic",[6],24,"Vietininkas Vns."],
    [5,"advanced",[6],35,"Vietininkas Vns."],
    [6,"practice",[6],20,"Vietininkas Vns."],
    [7,"basic",[4,6],30,"Повторение"],
    [8,"advanced",[4,6],30,"Повторение"],
    [9,"practice",[4,6],30,"Повторение"],
    [10,"basic",[2],24,"Kilmininkas Vns."],
    [11,"advanced",[2],35,"Kilmininkas Vns."],
    [12,"practice",[2],20,"Kilmininkas Vns."],
    [13,"basic",[2,4,6],30,"Повторение"],
    [14,"advanced",[2,4,6],30,"Повторение"],
    [15,"practice",[2,4,6],30,"Повторение"],
    [16,"basic",[8],24,"Vardininkas Dgs."],
    [17,"advanced",[8],35,"Vardininkas Dgs."],
    [18,"practice",[8],20,"Vardininkas Dgs."],
    [19,"basic",[4,2,6,8],35,"Повторение"],
    [20,"advanced",[4,2,6,8],35,"Повторение"],
    [21,"practice",[4,2,6,8],30,"Повторение"],
    [22,"basic",[9],24,"Kilmininkas Dgs."],
    [23,"advanced",[9],35,"Kilmininkas Dgs."],
    [24,"practice",[9],20,"Kilmininkas Dgs."],
    [25,"basic",[4,2,6,8,9],40,"Повторение"],
    [26,"advanced",[4,2,6,8,9],40,"Повторение"],
    [27,"practice",[4,2,6,8,9],30,"Повторение"],
    [28,"basic",[5],24,"Įnagininkas Vns."],
    [29,"advanced",[5],35,"Įnagininkas Vns."],
    [30,"practice",[5],10,"Įnagininkas Vns."],
    [31,"basic",[4,2,6,8,9,5],45,"Повторение"],
    [32,"advanced",[4,2,6,8,9,5],45,"Повторение"],
    [33,"practice",[4,2,6,8,9,5],10,"Повторение"],
    [34,"basic",[3],24,"Naudininkas Vns."],
    [35,"advanced",[3],35,"Naudininkas Vns."],
    [36,"practice",[3],10,"Naudininkas Vns."],
    [37,"basic",[4,2,6,8,9,5,3],50,"Повторение"],
    [38,"advanced",[4,2,6,8,9,5,3],50,"Повторение"],
    [39,"practice",[4,2,6,8,9,5,3],10,"Повторение"],
    [40,"basic",[7],24,"Šauksmininkas Vns."],
    [41,"advanced",[7],35,"Šauksmininkas Vns."],
    [42,"practice",[7],10,"Šauksmininkas Vns."],
    [43,"basic",[4,2,6,8,9,5,3,7],50,"Повторение"],
    [44,"advanced",[4,2,6,8,9,5,3,7],50,"Повторение"],
    [45,"practice",[4,2,6,8,9,5,3,7],10,"Повторение"],
    [46,"basic",[13],24,"Vietininkas Dgs."],
    [47,"advanced",[13],35,"Vietininkas Dgs."],
    [48,"practice",[13],10,"Vietininkas Dgs."],
    [49,"basic",[4,2,6,8,9,5,3,7,13],50,"Повторение"],
    [50,"advanced",[4,2,6,8,9,5,3,7,13],50,"Повторение"],
    [51,"practice",[4,2,6,8,9,5,3,7,13],10,"Повторение"],
    [52,"basic",[11],24,"Galininkas Dgs."],
    [53,"advanced",[11],35,"Galininkas Dgs."],
    [54,"practice",[11],10,"Galininkas Dgs."],
    [55,"basic",[4,2,6,8,9,5,3,7,13,11],50,"Повторение"],
    [56,"advanced",[4,2,6,8,9,5,3,7,13,11],50,"Повторение"],
    [57,"practice",[4,2,6,8,9,5,3,7,13,11],10,"Повторение"],
    [58,"basic",[12],24,"Įnagininkas Dgs."],
    [59,"advanced",[12],35,"Įnagininkas Dgs."],
    [60,"practice",[12],10,"Įnagininkas Dgs."],
    [61,"basic",[4,2,6,8,9,5,3,7,13,11,12],50,"Повторение"],
    [62,"advanced",[4,2,6,8,9,5,3,7,13,11,12],50,"Повторение"],
    [63,"practice",[4,2,6,8,9,5,3,7,13,11,12],10,"Повторение"],
    [64,"basic",[10],24,"Naudininkas Dgs."],
    [65,"advanced",[10],35,"Naudininkas Dgs."],
    [66,"practice",[10],35,"Naudininkas Dgs."],
    [67,"basic",[4,2,6,8,9,5,3,7,13,11,12,10],50,"Повторение"],
    [68,"advanced",[4,2,6,8,9,5,3,7,13,11,12,10],50,"Повторение"],
    [69,"practice",[4,2,6,8,9,5,3,7,13,11,12,10],40,"Повторение"],
]

# ── Case metadata ─────────────────────────────────────────────────────────────
CASE_INFO = {
    1:  ("Vardininkas", "Vienaskaita"),
    2:  ("Kilmininkas", "Vienaskaita"),
    3:  ("Naudininkas", "Vienaskaita"),
    4:  ("Galininkas",  "Vienaskaita"),
    5:  ("Įnagininkas", "Vienaskaita"),
    6:  ("Vietininkas", "Vienaskaita"),
    7:  ("Šauksmininkas","Vienaskaita"),
    8:  ("Vardininkas", "Daugiskaita"),
    9:  ("Kilmininkas", "Daugiskaita"),
    10: ("Naudininkas", "Daugiskaita"),
    11: ("Galininkas",  "Daugiskaita"),
    12: ("Įnagininkas", "Daugiskaita"),
    13: ("Vietininkas", "Daugiskaita"),
    14: ("Šauksmininkas","Daugiskaita"),
}

# Sentence templates for practice lessons: (lt_template, ru_template)
# {nom} = nominative form, {blank} = word stem for display, {ru} = russian translation
SENTENCE_TEMPLATES = {
    4:  [("Aš matau {blank}___.", "Я вижу {ru}."),
         ("Daiva myli {blank}___.", "Дайва любит {ru}."),
         ("Vladas turi {blank}___.", "Владас имеет {ru}."),
         ("Jis skaito {blank}___.", "Он читает {ru}."),],
    2:  [("Prie {blank}___ stovi medis.", "У {ru} стоит дерево."),
         ("Čia nėra {blank}___.", "Здесь нет {ru}."),
         ("Aš neturiu {blank}___.", "У меня нет {ru}."),
         ("Jis ieško {blank}___.", "Он ищет {ru}."),],
    6:  [("Aš gyvenu {blank}___.", "Я живу в {ru}."),
         ("Mes susitikome {blank}___.", "Мы встретились в {ru}."),
         ("Jis dirba {blank}___.", "Он работает в {ru}."),],
    8:  [("Čia yra {blank}___.", "Здесь есть {ru}."),
         ("Tie {blank}___ yra gražūs.", "Эти {ru} красивые."),],
    9:  [("Čia nėra {blank}___.", "Здесь нет {ru}."),
         ("Aš neturiu {blank}___.", "У меня нет {ru}."),],
    5:  [("Aš einu su {blank}___.", "Я иду с {ru}."),
         ("Jis rašo {blank}___.", "Он пишет {ru}."),],
    3:  [("Aš duodu {blank}___.", "Я даю {ru}."),
         ("Tai reikalinga {blank}___.", "Это нужно {ru}."),],
    7:  [("Labas, {blank}___!", "Привет, {ru}!"),
         ("Ačiū, {blank}___!", "Спасибо, {ru}!"),],
    11: [("Aš matau daug {blank}___.", "Я вижу много {ru}."),
         ("Jis turi daug {blank}___.", "У него много {ru}."),],
    10: [("Aš daviau {blank}___.", "Я дал {ru}."),],
    12: [("Su {blank}___.", "С {ru}."),],
    13: [("Mes gyvename {blank}___.", "Мы живём в {ru}."),],
}


# ── Public API ────────────────────────────────────────────────────────────────

def get_lessons() -> list[dict]:
    return [
        {
            "id": entry[0],
            "title": entry[4],
            "level": entry[1],
            "cases": entry[2],
            "task_count": entry[3],
        }
        for entry in LESSON_CONFIG
    ]


def _word_form(word_entry: list, case_idx: int) -> str | None:
    """Return full word form for given case index (1-14). Returns None for irregular (!) forms."""
    if case_idx < 1 or case_idx > 14:
        return None
    stem = word_entry[0]
    ending = word_entry[case_idx]  # indices 1-14 map directly
    if ending.startswith("!"):
        return None
    return stem + ending


def _word_nominative(word_entry: list) -> str:
    return word_entry[0] + word_entry[1]


def _word_ru(word_entry: list) -> str:
    return word_entry[-1]


def _generate_declension_tasks(cases: list[int], count: int) -> list[dict]:
    pool = [w for w in WORDS]
    random.shuffle(pool)
    tasks = []
    attempts = 0
    while len(tasks) < count and attempts < count * 5:
        attempts += 1
        word = pool[attempts % len(pool)]
        case_idx = random.choice(cases)
        form = _word_form(word, case_idx)
        if form is None:
            continue
        case_name, number = CASE_INFO.get(case_idx, ("", ""))
        tasks.append({
            "type": "declension",
            "prompt_lt": _word_nominative(word),
            "prompt_ru": _word_ru(word),
            "case_name": case_name,
            "number": number,
            "answer": form,
        })
    return tasks


def _generate_sentence_tasks(cases: list[int], count: int) -> list[dict]:
    pool = [w for w in WORDS]
    random.shuffle(pool)
    tasks = []
    attempts = 0
    while len(tasks) < count and attempts < count * 10:
        attempts += 1
        word = pool[attempts % len(pool)]
        case_idx = random.choice(cases)
        form = _word_form(word, case_idx)
        if form is None:
            continue
        templates = SENTENCE_TEMPLATES.get(case_idx)
        if not templates:
            # Fall back to declension task if no sentence template
            case_name, number = CASE_INFO.get(case_idx, ("", ""))
            tasks.append({
                "type": "declension",
                "prompt_lt": _word_nominative(word),
                "prompt_ru": _word_ru(word),
                "case_name": case_name,
                "number": number,
                "answer": form,
            })
            continue

        lt_tmpl, ru_tmpl = random.choice(templates)
        stem = word[0]
        ending = word[case_idx]
        ru = _word_ru(word)

        display = lt_tmpl.replace("{blank}", stem)
        translation = ru_tmpl.replace("{ru}", ru)

        tasks.append({
            "type": "sentence",
            "display": display,
            "answer": ending,
            "full_answer": form,
            "translation_ru": translation,
        })
    return tasks


def get_lesson_tasks(lesson_id: int) -> list[dict] | None:
    config = next((e for e in LESSON_CONFIG if e[0] == lesson_id), None)
    if config is None:
        return None
    num, level, cases, task_count, title = config
    if level == "practice":
        return _generate_sentence_tasks(cases, task_count)
    else:
        return _generate_declension_tasks(cases, task_count)
