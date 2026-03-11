# Grammar rule descriptions for each Lithuanian case.
# Used to display hints to the student during basic and advanced exercises.
# Format per entry: {question, name_ru, usage, endings_sg, endings_pl}

CASE_RULES: dict[int, dict] = {
    1: {
        "question": "Кто? Что?",
        "name_ru": "Именительный (Vardininkas)",
        "usage": "Подлежащее предложения — кто или что совершает действие.",
        "endings_sg": "-as, -is, -ys, -a, -ė, -us, -uo",
        "endings_pl": "-ai, -iai, -os, -ės, -ūs, -ys",
    },
    2: {
        "question": "Кого? Чего?",
        "name_ru": "Родительный (Kilmininkas)",
        "usage": "Отрицание (nėra + род.), принадлежность, после предлогов iš, be, prie, šalia, iki, pas.",
        "endings_sg": "-o, -io, -os, -ės, -aus, -ies",
        "endings_pl": "-ų",
    },
    3: {
        "question": "Кому? Чему?",
        "name_ru": "Дательный (Naudininkas)",
        "usage": "Косвенное дополнение — кому что-то дают, предназначают или для кого делают.",
        "endings_sg": "-ui, -iui, -ai, -ei, -ui",
        "endings_pl": "-ams, -iams, -oms, -ėms, -ums",
    },
    4: {
        "question": "Кого? Что?",
        "name_ru": "Винительный (Galininkas)",
        "usage": "Прямое дополнение — объект действия (вижу, покупаю, люблю кого/что).",
        "endings_sg": "-ą, -į, -ų",
        "endings_pl": "-us, -ius, -as, -es",
    },
    5: {
        "question": "Кем? Чем? С кем?",
        "name_ru": "Творительный (Įnagininkas)",
        "usage": "Инструмент или совместность. После предлога su (с кем/чем).",
        "endings_sg": "-u, -iu, -a, -e",
        "endings_pl": "-ais, -iais, -omis, -ėmis, -umis",
    },
    6: {
        "question": "В ком? В чём? Где?",
        "name_ru": "Местный (Vietininkas)",
        "usage": "Местонахождение внутри чего-то. Отвечает на вопрос «где?» (в доме, в городе).",
        "endings_sg": "-e, -yje, -oje, -ėje, -uje",
        "endings_pl": "-uose, -iuose, -ose, -ėse",
    },
    7: {
        "question": "Эй, ...!",
        "name_ru": "Звательный (Šauksmininkas)",
        "usage": "Прямое обращение к человеку или существу. Используется только в речи.",
        "endings_sg": "-e, -ai, -a, -ė",
        "endings_pl": "-ai, -iai, -os, -ės",
    },
    8: {
        "question": "Кто? Что? (мн.ч.)",
        "name_ru": "Именительный мн.ч. (Vardininkas Dgs.)",
        "usage": "Подлежащее во множественном числе.",
        "endings_sg": "—",
        "endings_pl": "-ai, -iai, -os, -ės, -ūs, -ys",
    },
    9: {
        "question": "Кого? Чего? (мн.ч.)",
        "name_ru": "Родительный мн.ч. (Kilmininkas Dgs.)",
        "usage": "Множественное число родительного. Часто окончание -ų для большинства существительных.",
        "endings_sg": "—",
        "endings_pl": "-ų",
    },
    10: {
        "question": "Кому? (мн.ч.)",
        "name_ru": "Дательный мн.ч. (Naudininkas Dgs.)",
        "usage": "Косвенное дополнение во множественном числе.",
        "endings_sg": "—",
        "endings_pl": "-ams, -iams, -oms, -ėms, -ums",
    },
    11: {
        "question": "Кого? Что? (мн.ч.)",
        "name_ru": "Винительный мн.ч. (Galininkas Dgs.)",
        "usage": "Прямое дополнение во множественном числе.",
        "endings_sg": "—",
        "endings_pl": "-us, -ius, -as, -es",
    },
    12: {
        "question": "С кем? С чем? (мн.ч.)",
        "name_ru": "Творительный мн.ч. (Įnagininkas Dgs.)",
        "usage": "Творительный падеж во множественном числе, совместность.",
        "endings_sg": "—",
        "endings_pl": "-ais, -iais, -omis, -ėmis, -umis",
    },
    13: {
        "question": "Где? (мн.ч.)",
        "name_ru": "Местный мн.ч. (Vietininkas Dgs.)",
        "usage": "Местонахождение внутри чего-то, множественное число.",
        "endings_sg": "—",
        "endings_pl": "-uose, -iuose, -ose, -ėse",
    },
    14: {
        "question": "Эй, ...! (мн.ч.)",
        "name_ru": "Звательный мн.ч. (Šauksmininkas Dgs.)",
        "usage": "Прямое обращение к нескольким людям.",
        "endings_sg": "—",
        "endings_pl": "-ai, -iai, -os, -ės",
    },
}
