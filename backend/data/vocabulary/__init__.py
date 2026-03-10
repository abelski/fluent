from data.vocabulary import (
    countries,
    numbers,
    people_social,
    basic_words,
    city_places,
    time_calendar,
    family,
    adjectives,
    food_drinks,
    vegetables_fruit,
    restaurant,
    verbs_common,
)

_MODULES = [
    countries,
    numbers,
    people_social,
    basic_words,
    city_places,
    time_calendar,
    family,
    adjectives,
    food_drinks,
    vegetables_fruit,
    restaurant,
    verbs_common,
]

WORD_LISTS = [
    {
        "title": m.TITLE,
        "description": m.DESCRIPTION,
        "words": m.WORDS,
    }
    for m in _MODULES
]
