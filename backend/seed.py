"""
Seed the database with word lists from Chapter 1 Žodynas section
of "Koks jūsų vardas?" (Lithuanian textbook).

Run from backend/ directory:
    python seed.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from sqlmodel import Session, select
from database import engine, create_db_and_tables
from models import Word, WordList, WordListItem

create_db_and_tables()

WORD_LISTS = [
    {
        "title": "Pasisveikinimas",
        "description": "Greetings, farewells and polite phrases",
        "words": [
            ("Labas rytas!", "Good morning!", "Доброе утро!", None),
            ("Laba diena!", "Good afternoon!", "Добрый день!", None),
            ("Labas vakaras!", "Good evening!", "Добрый вечер!", None),
            ("Labas!", "Hello! / Hi!", "Привет! / Здравствуйте!", None),
            ("Viso gero!", "Goodbye! / All the best!", "Всего хорошего!", None),
            ("Sudie!", "Goodbye!", "До свидания!", None),
            ("Iki! / Iki pasimatymo!", "See you! / Until we meet again!", "Пока! / До встречи!", None),
            ("Iki rytojaus!", "Until tomorrow!", "До завтра!", None),
            ("Ate!", "Bye!", "Пока!", None),
            ("Atsiprašau!", "I'm sorry! / Excuse me!", "Извините! / Прошу прощения!", None),
            ("Nieko tokio!", "Never mind! / No worries!", "Ничего страшного!", None),
            ("Prašom!", "Please / You're welcome / Here you go", "Пожалуйста!", None),
            ("Ačiū.", "Thank you.", "Спасибо.", None),
            ("Nėra už ką.", "Don't mention it. / You're welcome.", "Не за что.", None),
            ("Malonu.", "Nice to meet you. / Pleasant.", "Приятно. / Приятно познакомиться.", None),
            ("Labai malonu!", "Very nice to meet you!", "Очень приятно!", None),
            ("Man taip pat malonu.", "Nice to meet you too.", "Мне тоже приятно.", None),
        ],
    },
    {
        "title": "Šalys",
        "description": "Countries of the world in Lithuanian",
        "words": [
            ("Amerika", "America", "Америка", None),
            ("Anglija", "England", "Англия", None),
            ("Airija", "Ireland", "Ирландия", None),
            ("Baltarusija", "Belarus", "Беларусь", None),
            ("Brazilija", "Brazil", "Бразилия", None),
            ("Belgija", "Belgium", "Бельгия", None),
            ("Čekija", "Czech Republic", "Чехия", None),
            ("Čilė", "Chile", "Чили", None),
            ("Danija", "Denmark", "Дания", None),
            ("Estija", "Estonia", "Эстония", None),
            ("Filipinai", "Philippines", "Филиппины", None),
            ("Graikija", "Greece", "Греция", None),
            ("Havajai", "Hawaii", "Гавайи", None),
            ("Ispanija", "Spain", "Испания", None),
            ("Italija", "Italy", "Италия", None),
            ("Izraelis", "Israel", "Израиль", None),
            ("Japonija", "Japan", "Япония", None),
            ("Kanada", "Canada", "Канада", None),
            ("Kinija", "China", "Китай", None),
            ("Lietuva", "Lithuania", "Литва", None),
            ("Lenkija", "Poland", "Польша", None),
            ("Moldova", "Moldova", "Молдова", None),
            ("Norvegija", "Norway", "Норвегия", None),
            ("Olandija", "Netherlands", "Нидерланды", None),
            ("Portugalija", "Portugal", "Португалия", None),
            ("Prancūzija", "France", "Франция", None),
            ("Rusija", "Russia", "Россия", None),
            ("Slovakija", "Slovakia", "Словакия", None),
            ("Slovėnija", "Slovenia", "Словения", None),
            ("Suomija", "Finland", "Финляндия", None),
            ("Švedija", "Sweden", "Швеция", None),
            ("Turkija", "Turkey", "Турция", None),
            ("Ukraina", "Ukraine", "Украина", None),
            ("Urugvajus", "Uruguay", "Уругвай", None),
            ("Vengrija", "Hungary", "Венгрия", None),
            ("Vokietija", "Germany", "Германия", None),
            ("Zimbabvė", "Zimbabwe", "Зимбабве", None),
        ],
    },
    {
        "title": "Tautybės",
        "description": "Nationalities (masculine / feminine forms)",
        "words": [
            ("amerikietis / amerikietė", "American (m. / f.)", "американец / американка", "m. / f."),
            ("anglas / anglė", "English (m. / f.)", "англичанин / англичанка", "m. / f."),
            ("airis / airė", "Irish (m. / f.)", "ирландец / ирландка", "m. / f."),
            ("baltarusis / baltarusė", "Belarusian (m. / f.)", "белорус / белоруска", "m. / f."),
            ("brazilas / brazilė", "Brazilian (m. / f.)", "бразилец / бразильянка", "m. / f."),
            ("belgas / belgė", "Belgian (m. / f.)", "бельгиец / бельгийка", "m. / f."),
            ("čekas / čekė", "Czech (m. / f.)", "чех / чешка", "m. / f."),
            ("čilietis / čilietė", "Chilean (m. / f.)", "чилиец / чилийка", "m. / f."),
            ("danas / danė", "Danish (m. / f.)", "датчанин / датчанка", "m. / f."),
            ("estas / estė", "Estonian (m. / f.)", "эстонец / эстонка", "m. / f."),
            ("filipinietis / filipinietė", "Filipino (m. / f.)", "филиппинец / филиппинка", "m. / f."),
            ("graikas / graikė", "Greek (m. / f.)", "грек / гречанка", "m. / f."),
            ("havajietis / havajietė", "Hawaiian (m. / f.)", "гавайец / гавайка", "m. / f."),
            ("ispanas / ispanė", "Spanish (m. / f.)", "испанец / испанка", "m. / f."),
            ("italas / italė", "Italian (m. / f.)", "итальянец / итальянка", "m. / f."),
            ("izraelietis / izraelietė", "Israeli (m. / f.)", "израильтянин / израильтянка", "m. / f."),
            ("japonas / japonė", "Japanese (m. / f.)", "японец / японка", "m. / f."),
            ("kanadietis / kanadietė", "Canadian (m. / f.)", "канадец / канадка", "m. / f."),
            ("kinas / kinė", "Chinese (m. / f.)", "китаец / китаянка", "m. / f."),
            ("lietuvis / lietuvė", "Lithuanian (m. / f.)", "литовец / литовка", "m. / f."),
            ("lenkas / lenkė", "Polish (m. / f.)", "поляк / полька", "m. / f."),
            ("moldavas / moldavė", "Moldovan (m. / f.)", "молдаванин / молдаванка", "m. / f."),
            ("norvegas / norvegė", "Norwegian (m. / f.)", "норвежец / норвежка", "m. / f."),
            ("olandas / olandė", "Dutch (m. / f.)", "голландец / голландка", "m. / f."),
            ("portugalas / portugalė", "Portuguese (m. / f.)", "португалец / португалка", "m. / f."),
            ("prancūzas / prancūzė", "French (m. / f.)", "француз / француженка", "m. / f."),
            ("rusas / rusė", "Russian (m. / f.)", "русский / русская", "m. / f."),
            ("slovakas / slovakė", "Slovak (m. / f.)", "словак / словачка", "m. / f."),
            ("slovėnas / slovėnė", "Slovenian (m. / f.)", "словенец / словенка", "m. / f."),
            ("suomis / suomė", "Finnish (m. / f.)", "финн / финка", "m. / f."),
            ("švedas / švedė", "Swedish (m. / f.)", "швед / шведка", "m. / f."),
            ("turkas / turkė", "Turkish (m. / f.)", "турок / турчанка", "m. / f."),
            ("ukrainietis / ukrainietė", "Ukrainian (m. / f.)", "украинец / украинка", "m. / f."),
            ("urugvajietis / urugvajietė", "Uruguayan (m. / f.)", "уругваец / уругвайка", "m. / f."),
            ("vengras / vengrė", "Hungarian (m. / f.)", "венгр / венгерка", "m. / f."),
            ("vokietis / vokietė", "German (m. / f.)", "немец / немка", "m. / f."),
            ("žydas / žydė", "Jewish (m. / f.)", "еврей / еврейка", "m. / f."),
        ],
    },
    {
        "title": "Pagrindiniai žodžiai",
        "description": "Basic vocabulary: verbs, pronouns and key words",
        "words": [
            ("būti, yra, buvo", "to be", "быть, есть, был", "verb"),
            ("nebūti, nėra, nebuvo", "not to be", "не быть, нет, не был", "verb (negative)"),
            ("taip", "yes", "да", None),
            ("ne", "no", "нет", None),
            ("čia", "here", "здесь", None),
            ("ir", "and", "и", "conjunction"),
            ("o", "and / but / while", "а / но", "conjunction"),
            ("dėstytojas / dėstytoja", "university teacher (m. / f.)", "преподаватель / преподавательница", "m. / f."),
            ("studentas / studentė", "student (m. / f.)", "студент / студентка", "m. / f."),
            ("vardas", "name", "имя", "noun"),
            ("pavardė", "surname", "фамилия", "noun"),
            ("aš", "I", "я", "pronoun"),
            ("tu", "you (informal)", "ты", "pronoun"),
            ("jis / ji", "he / she", "он / она", "pronoun"),
            ("mes", "we", "мы", "pronoun"),
            ("jūs", "you (formal/plural)", "вы", "pronoun"),
            ("jie / jos", "they (m. / f.)", "они", "pronoun"),
        ],
    },
]


def seed():
    with Session(engine) as session:
        # Check if already seeded
        existing = session.exec(select(WordList)).first()
        if existing:
            print("Database already seeded. Skipping.")
            return

        for list_data in WORD_LISTS:
            wl = WordList(
                title=list_data["title"],
                description=list_data["description"],
            )
            session.add(wl)
            session.flush()  # get wl.id

            for position, (lt, en, ru, hint) in enumerate(list_data["words"]):
                word = Word(
                    lithuanian=lt,
                    translation_en=en,
                    translation_ru=ru,
                    hint=hint,
                )
                session.add(word)
                session.flush()  # get word.id

                item = WordListItem(
                    word_list_id=wl.id,
                    word_id=word.id,
                    position=position,
                )
                session.add(item)

        session.commit()
        print(f"Seeded {len(WORD_LISTS)} word lists.")
        for ld in WORD_LISTS:
            print(f"  - {ld['title']}: {len(ld['words'])} words")


if __name__ == "__main__":
    seed()
