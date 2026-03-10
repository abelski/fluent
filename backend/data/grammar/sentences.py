# Sentence fill-in-the-blank templates for grammar practice exercises.
# {blank} = word stem shown to user, {ru} = Russian translation of the word.
# Format per case: list of (lt_template, ru_template) tuples.
SENTENCE_TEMPLATES = {
    # Galininkas Vienaskaita (Accusative singular)
    4: [
        ("Laima mato {blank}___.", "Лайма видит {ru}."),
        ("Tėvas perka {blank}___.", "Папа покупает {ru}."),
        ("Jonas turi {blank}___.", "Йонас имеет {ru}."),
        ("Mes matome {blank}___.", "Мы видим {ru}."),
    ],
    # Kilmininkas Vienaskaita (Genitive singular)
    2: [
        ("Šalia {blank}___ yra parduotuvė.", "Рядом с {ru} есть магазин."),
        ("Ten nėra {blank}___.", "Там нет {ru}."),
        ("Ona neturi {blank}___.", "У Оны нет {ru}."),
        ("Petras ieško {blank}___.", "Пятрас ищет {ru}."),
    ],
    # Vietininkas Vienaskaita (Locative singular)
    6: [
        ("Mama dirba {blank}___.", "Мама работает в {ru}."),
        ("Jie gyvena {blank}___.", "Они живут в {ru}."),
        ("Vaikai mokosi {blank}___.", "Дети учатся в {ru}."),
    ],
    # Vardininkas Daugiskaita (Nominative plural)
    8: [
        ("Čia yra {blank}___.", "Здесь есть {ru}."),
        ("Tie {blank}___ yra gražūs.", "Эти {ru} красивые."),
    ],
    # Kilmininkas Daugiskaita (Genitive plural)
    9: [
        ("Čia nėra {blank}___.", "Здесь нет {ru}."),
        ("Rasa neturi {blank}___.", "У Расы нет {ru}."),
    ],
    # Įnagininkas Vienaskaita (Instrumental singular)
    5: [
        ("Algis eina su {blank}___.", "Алгис идёт с {ru}."),
        ("Ji rašo {blank}___.", "Она пишет {ru}."),
    ],
    # Naudininkas Vienaskaita (Dative singular)
    3: [
        ("Mama duoda {blank}___.", "Мама даёт {ru}."),
        ("Tai reikalinga {blank}___.", "Это нужно {ru}."),
    ],
    # Šauksmininkas Vienaskaita (Vocative singular)
    7: [
        ("Sveiki, {blank}___!", "Привет, {ru}!"),
        ("Ačiū, {blank}___!", "Спасибо, {ru}!"),
    ],
    # Galininkas Daugiskaita (Accusative plural)
    11: [
        ("Matau daug {blank}___.", "Я вижу много {ru}."),
        ("Rasa turi daug {blank}___.", "У Расы много {ru}."),
    ],
    # Naudininkas Daugiskaita (Dative plural)
    10: [
        ("Algis padavė {blank}___.", "Алгис подал {ru}."),
    ],
    # Įnagininkas Daugiskaita (Instrumental plural)
    12: [
        ("Su {blank}___.", "С {ru}."),
    ],
    # Vietininkas Daugiskaita (Locative plural)
    13: [
        ("Jie gyvena {blank}___.", "Они живут в {ru}."),
    ],
}
