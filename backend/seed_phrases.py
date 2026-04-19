"""Seed script: creates ONE phrase program "Sékmės! A1.1" with all 9 chapters.

Run once from the backend/ directory:
    python seed_phrases.py

Safe to run multiple times — deletes all existing programs and re-inserts.
"""

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import Session, select, delete
from database import engine, create_db_and_tables
from models import Phrase, PhraseProgram, UserPhraseProgramEnrollment, UserPhraseProgress

# ---------------------------------------------------------------------------
# Chapter phrase data — (lithuanian_text, russian_translation)
# Source: Sékmės! A1.1, Frazės sections
# ---------------------------------------------------------------------------

CHAPTERS = [
    {
        "title": "Глава 1: Как вас зовут?",
        "title_en": "Chapter 1: What is your name?",
        "description": "Приветствия, прощания и вежливые выражения. Как представиться и спросить имя.",
        "description_en": "Greetings, farewells and polite phrases. How to introduce yourself and ask someone's name.",
        "difficulty": 1,
        "phrases": [
            ("Labas rytas!", "Доброе утро!"),
            ("Laba diena!", "Добрый день!"),
            ("Labas vakaras!", "Добрый вечер!"),
            ("Labas!", "Привет!"),
            ("Viso gero!", "Всего хорошего!"),
            ("Iki!", "Пока!"),
            ("Iki pasimatymo!", "До встречи!"),
            ("Atsiprašau!", "Извините!"),
            ("Ačiū!", "Спасибо!"),
            ("Prašom!", "Пожалуйста!"),
            ("Koks tavo vardas?", "Как тебя зовут?"),
            ("Mano vardas yra...", "Меня зовут..."),
            ("Kokia jūsų pavardė?", "Какова ваша фамилия?"),
            ("Labai malonu!", "Очень приятно!"),
            ("Malonu susipažinti.", "Приятно познакомиться."),
        ],
    },
    {
        "title": "Глава 2: Это мой друг",
        "title_en": "Chapter 2: This is my friend",
        "description": "Знакомства и представление других людей. Вопросы о происхождении и языках.",
        "description_en": "Introductions and presenting others. Questions about origin and languages.",
        "difficulty": 1,
        "phrases": [
            ("Kaip sekasi?", "Как дела?"),
            ("Ačiū, gerai.", "Спасибо, хорошо."),
            ("Labai gerai!", "Очень хорошо!"),
            ("Neblogai.", "Неплохо."),
            ("Iš kur jūs esate?", "Откуда вы?"),
            ("Aš esu iš Rusijos.", "Я из России."),
            ("Čia mano draugas.", "Это мой друг."),
            ("Čia mano draugė.", "Это моя подруга."),
            ("Ar tu supranti lietuviškai?", "Ты понимаешь по-литовски?"),
            ("Taip, suprantu.", "Да, понимаю."),
            ("Ne, nesuprantu.", "Нет, не понимаю."),
            ("Ar tu kalbi angliškai?", "Ты говоришь по-английски?"),
            ("Aš kalbu rusiškai.", "Я говорю по-русски."),
            ("Prašom pakartoti!", "Пожалуйста, повторите!"),
            ("Prašom kalbėti lėčiau!", "Пожалуйста, говорите медленнее!"),
            ("Kaip tai lietuviškai?", "Как это по-литовски?"),
            ("Nesuprantu. Gal galite paaiškinti?", "Не понимаю. Можете объяснить?"),
        ],
    },
    {
        "title": "Глава 3: Какой у тебя адрес?",
        "title_en": "Chapter 3: What is your address?",
        "description": "Адреса, телефоны и ориентирование в городе. Как спросить дорогу.",
        "description_en": "Addresses, phone numbers and navigating the city. How to ask for directions.",
        "difficulty": 1,
        "phrases": [
            ("Kur tu gyveni?", "Где ты живёшь?"),
            ("Aš gyvenu Vilniuje.", "Я живу в Вильнюсе."),
            ("Koks tavo adresas?", "Какой у тебя адрес?"),
            ("Parko gatvė 4-10.", "Улица Парко, 4-10."),
            ("Koks tavo telefono numeris?", "Какой у тебя номер телефона?"),
            ("Atsiprašau, kur yra bankas?", "Извините, где находится банк?"),
            ("Atsiprašau, kur yra vaistinė?", "Извините, где находится аптека?"),
            ("Atsiprašau, kur yra paštas?", "Извините, где находится почта?"),
            ("Atsiprašau, kur yra stotelė?", "Извините, где находится остановка?"),
            ("Eikite tiesiai.", "Идите прямо."),
            ("Sukite į kairę.", "Поверните налево."),
            ("Sukite į dešinę.", "Поверните направо."),
            ("Čia arti.", "Это близко."),
            ("Tai toli.", "Это далеко."),
            ("Koks jūsų el. pašto adresas?", "Какой у вас адрес электронной почты?"),
        ],
    },
    {
        "title": "Глава 4: Когда и где встретимся?",
        "title_en": "Chapter 4: When and where shall we meet?",
        "description": "Договориться о встрече: место, день, время. Приглашения и ответы на них.",
        "description_en": "Arranging a meeting: place, day, time. Invitations and responses.",
        "difficulty": 1,
        "phrases": [
            ("Sveikas!", "Привет! (м.)"),
            ("Sveika!", "Привет! (ж.)"),
            ("Sveiki!", "Привет! (мн.)"),
            ("Gero savaitgalio!", "Хороших выходных!"),
            ("Kviečiu į svečius!", "Приглашаю в гости!"),
            ("Kur susitinkame?", "Где встречаемся?"),
            ("Prie kavinės.", "У кафе."),
            ("Kavinėje.", "В кафе."),
            ("Kada susitinkame?", "Когда встречаемся?"),
            ("Rytoj.", "Завтра."),
            ("Pirmadienį.", "В понедельник."),
            ("Kelintą valandą susitinkame?", "В котором часу встречаемся?"),
            ("Penktą valandą.", "В пять часов."),
            ("Kur einame?", "Куда идём?"),
            ("Einame į parką.", "Идём в парк."),
            ("Malonu matyti!", "Приятно видеть!"),
            ("Man taip pat!", "Мне тоже!"),
            ("Labai ačiū už kvietimą!", "Большое спасибо за приглашение!"),
        ],
    },
    {
        "title": "Глава 5: Это моя семья",
        "title_en": "Chapter 5: This is my family",
        "description": "Рассказать о членах семьи. Спросить, есть ли братья и сёстры.",
        "description_en": "Talk about family members. Ask about brothers and sisters.",
        "difficulty": 1,
        "phrases": [
            ("Ar tu turi brolį?", "У тебя есть брат?"),
            ("Taip, aš turiu brolį.", "Да, у меня есть брат."),
            ("Ne, aš neturiu brolio.", "Нет, у меня нет брата."),
            ("Aš turiu du brolius.", "У меня два брата."),
            ("Aš turiu tris brolius.", "У меня три брата."),
            ("Ar tu turi seserį?", "У тебя есть сестра?"),
            ("Taip, aš turiu seserį.", "Да, у меня есть сестра."),
            ("Ne, aš neturiu sesers.", "Нет, у меня нет сестры."),
            ("Aš turiu dvi seseris.", "У меня две сестры."),
            ("Ar čia yra tavo mama?", "Это твоя мама?"),
            ("Taip, čia mano mama.", "Да, это моя мама."),
            ("Ar čia yra tavo tėvas?", "Это твой отец?"),
            ("Ne, čia yra mano dėdė.", "Нет, это мой дядя."),
            ("Ar tu turi vaikų?", "У тебя есть дети?"),
            ("Aš turiu vieną vaiką.", "У меня один ребёнок."),
            ("Kiek tau metų?", "Сколько тебе лет?"),
            ("Man dvidešimt penkeri metai.", "Мне двадцать пять лет."),
        ],
    },
    {
        "title": "Глава 6: Мою сестру зовут Лина",
        "title_en": "Chapter 6: My sister's name is Lina",
        "description": "Описать семью и внешность. Спросить об именах родственников.",
        "description_en": "Describe family and appearance. Ask about relatives' names.",
        "difficulty": 2,
        "phrases": [
            ("Kokia yra tavo šeima?", "Какая у тебя семья?"),
            ("Mano šeima yra didelė.", "У меня большая семья."),
            ("Mano šeima yra maža.", "У меня маленькая семья."),
            ("Ar tavo šeima didelė?", "У тебя большая семья?"),
            ("Koks tavo brolio vardas?", "Как зовут твоего брата?"),
            ("Mano brolio vardas yra Liudas.", "Моего брата зовут Людас."),
            ("Kokia tavo sesers pavardė?", "Какая фамилия у твоей сестры?"),
            ("Ar tavo brolis yra tas aukštas vaikinas?", "Твой брат — тот высокий парень?"),
            ("Taip, tas aukštas šviesus vaikinas.", "Да, тот высокий светловолосый парень."),
            ("Ne, mano brolis tas tamsus vaikinas.", "Нет, мой брат — тот тёмный парень."),
            ("Ar čia tavo sesuo?", "Это твоя сестра?"),
            ("Taip. Koks jos vardas?", "Да. Как её зовут?"),
            ("Jos vardas Rūta.", "Её зовут Рута."),
            ("Lina, čia yra mano broliai.", "Лина, это мои братья."),
            ("Malonu.", "Приятно."),
            ("Jis yra aukštas ir tamsus.", "Он высокий и темноволосый."),
            ("Ji yra graži ir draugiška.", "Она красивая и дружелюбная."),
        ],
    },
    {
        "title": "Глава 7: Очень вкусно!",
        "title_en": "Chapter 7: Very delicious!",
        "description": "Угощать гостей едой и напитками. Выражения за столом.",
        "description_en": "Offering food and drinks to guests. Table expressions.",
        "difficulty": 2,
        "phrases": [
            ("Prašom sėstis!", "Присаживайтесь, пожалуйста!"),
            ("Prašom prie stalo!", "Прошу к столу!"),
            ("Prašom valgyti!", "Кушайте, пожалуйста!"),
            ("Valgyk!", "Ешь!"),
            ("Prašom gerti!", "Пейте, пожалуйста!"),
            ("Gerk!", "Пей!"),
            ("Prašom ragauti!", "Попробуйте, пожалуйста!"),
            ("Ragauk!", "Попробуй!"),
            ("Valgykite pyrago!", "Угощайтесь пирогом!"),
            ("Prašom torto!", "Пожалуйста, торт!"),
            ("Imkite mėsos!", "Берите мяса!"),
            ("Prašom kavos!", "Кофе, пожалуйста!"),
            ("Gal kavos?", "Может, кофе?"),
            ("Gal vandens?", "Может, воды?"),
            ("Gal norite kavos?", "Может, хотите кофе?"),
            ("Ko tu nori? Kavos ar arbatos?", "Чего ты хочешь? Кофе или чай?"),
            ("Man patinka kava.", "Мне нравится кофе."),
            ("Taip, ačiū. Mielai!", "Да, спасибо. С удовольствием!"),
            ("Skanaus!", "Приятного аппетита!"),
            ("Ačiū. Ir tau!", "Спасибо. И тебе!"),
            ("Ar skanu?", "Вкусно?"),
            ("Labai skanu!", "Очень вкусно!"),
            ("Gal dar ko nors?", "Может, ещё что-нибудь?"),
            ("Ne, ačiū, nieko.", "Нет, спасибо, ничего."),
            ("Ačiū, buvo labai skanu!", "Спасибо, было очень вкусно!"),
            ("Į sveikatą!", "На здоровье!"),
            ("Tavo pyragas labai skanus!", "Твой пирог очень вкусный!"),
            ("Ačiū. Malonu girdėti!", "Спасибо. Приятно слышать!"),
        ],
    },
    {
        "title": "Глава 8: Сегодня пойду на рынок",
        "title_en": "Chapter 8: Today I will go to the market",
        "description": "Покупки на рынке: овощи, фрукты, мясо, цены и количество.",
        "description_en": "Shopping at the market: vegetables, fruits, meat, prices and quantities.",
        "difficulty": 2,
        "phrases": [
            ("Kiek kainuoja?", "Сколько стоит?"),
            ("Kiek kainuoja obuoliai?", "Сколько стоят яблоки?"),
            ("Kiek kainuoja kilogramas?", "Сколько стоит килограм?"),
            ("Ar obuoliai yra saldūs?", "Яблоки сладкие?"),
            ("Ar obuoliai yra rūgštūs?", "Яблоки кислые?"),
            ("Prašom duoti obuolių.", "Дайте, пожалуйста, яблок."),
            ("Prašom duoti kriaušių.", "Дайте, пожалуйста, груш."),
            ("Prašom duoti bananų.", "Дайте, пожалуйста, бананов."),
            ("Prašom duoti braškių.", "Дайте, пожалуйста, клубники."),
            ("Prašom duoti bulvių.", "Дайте, пожалуйста, картофеля."),
            ("Prašom duoti burokėlių.", "Дайте, пожалуйста, свёклы."),
            ("Prašom duoti morkų.", "Дайте, пожалуйста, моркови."),
            ("Prašom duoti agurkų.", "Дайте, пожалуйста, огурцов."),
            ("Prašom duoti pomidorų.", "Дайте, пожалуйста, помидоров."),
            ("Prašom duoti svogūnų.", "Дайте, пожалуйста, лука."),
            ("Kiek?", "Сколько?"),
            ("Prašom vieną kilogramą.", "Один килограмм, пожалуйста."),
            ("Prašom du kilogramus.", "Два килограмма, пожалуйста."),
            ("Prašom pusę kilogramo.", "Полкилограмма, пожалуйста."),
            ("Prašom duoti jautienos.", "Дайте, пожалуйста, говядины."),
            ("Prašom duoti kiaulienos.", "Дайте, пожалуйста, свинины."),
            ("Prašom duoti vištienos.", "Дайте, пожалуйста, курятины."),
            ("Norėčiau truputį daugiau.", "Я бы хотел немного больше."),
            ("Norėčiau mažiau.", "Я бы хотел меньше."),
            ("Ko norėtumėte?", "Что вы хотите?"),
            ("Dar ko nors?", "Что-нибудь ещё?"),
            ("Viskas?", "Всё?"),
            ("Ar reikia maišelio?", "Нужен пакет?"),
            ("Pusantro kilogramo.", "Полтора килограмма."),
        ],
    },
    {
        "title": "Глава 9: Я бы хотел кофе",
        "title_en": "Chapter 9: I would like some coffee",
        "description": "Заказать еду и напитки в кафе или ресторане. Спросить счёт.",
        "description_en": "Order food and drinks in a cafe or restaurant. Ask for the bill.",
        "difficulty": 2,
        "phrases": [
            ("Norėčiau arbatos su citrina.", "Я бы хотел чаю с лимоном."),
            ("Ar turite šviežiai spaustų apelsinų sulčių?", "У вас есть свежевыжатый апельсиновый сок?"),
            ("Su kuo yra pyragas?", "С чем пирог?"),
            ("Ar turite salotų be česnakų ir be svogūnų?", "У вас есть салат без чеснока и лука?"),
            ("Ar turite vegetariškų patiekalų?", "У вас есть вегетарианские блюда?"),
            ("Ar turite veganiškų patiekalų?", "У вас есть веганские блюда?"),
            ("Ar turite dienos pietų?", "У вас есть бизнес-ланч?"),
            ("Kokia yra dienos sriuba?", "Какой суп дня?"),
            ("Prašom sąskaitą!", "Счёт, пожалуйста!"),
            ("Laba diena. Ar jau išsirinkote?", "Добрый день. Вы уже выбрали?"),
            ("Laba diena. Dar ne.", "Добрый день. Ещё нет."),
            ("Laba diena. Ko norėtumėte?", "Добрый день. Что вы желаете?"),
            ("Norėčiau sriubos ir salotų.", "Я бы хотел супа и салата."),
            ("Norėčiau juodos arbatos ir sumuštinio su kumpiu.", "Я бы хотел чёрного чая и бутерброда с ветчиной."),
            ("Prašom juodos kavos su pienu.", "Чёрный кофе с молоком, пожалуйста."),
            ("Gersite čia ar norėsite išsinešti?", "Будете здесь или возьмёте с собой?"),
            ("Gersiu čia.", "Буду здесь."),
            ("Ko gersite?", "Что будете пить?"),
            ("Negazuoto vandens.", "Негазированную воду."),
            ("Dar ko nors?", "Что-нибудь ещё?"),
            ("Ne ačiū. Viskas.", "Нет, спасибо. Всё."),
            ("Mokėsite grynaisiais ar kortele?", "Будете платить наличными или картой?"),
            ("Kortele.", "Картой."),
            ("Ar čia laisva?", "Здесь свободно?"),
            ("Taip, prašom.", "Да, пожалуйста."),
            ("Ne. Čia užimta.", "Нет. Занято."),
        ],
    },
]


def main():
    create_db_and_tables()
    with Session(engine) as session:
        print("Deleting existing phrase programs and related data...")
        existing_programs = session.exec(select(PhraseProgram)).all()
        for prog in existing_programs:
            phrases = session.exec(select(Phrase).where(Phrase.program_id == prog.id)).all()
            for phrase in phrases:
                session.exec(delete(UserPhraseProgress).where(UserPhraseProgress.phrase_id == phrase.id))
            session.exec(delete(Phrase).where(Phrase.program_id == prog.id))
            session.exec(delete(UserPhraseProgramEnrollment).where(UserPhraseProgramEnrollment.program_id == prog.id))
            session.delete(prog)
        session.commit()
        print(f"Deleted {len(existing_programs)} existing program(s).")

        # One program for the whole textbook
        program = PhraseProgram(
            title="Sékmės! A1.1 — Фразы",
            title_en="Sékmės! A1.1 — Phrases",
            description="Фразы из учебника литовского языка Sékmės! A1.1, главы 1–9.",
            description_en="Phrases from the Lithuanian textbook Sékmės! A1.1, chapters 1–9.",
            difficulty=1,
            is_public=True,
        )
        session.add(program)
        session.commit()
        session.refresh(program)
        print(f"Created program: {program.title} (id={program.id})")

        position = 0
        total = 0
        for chapter_num, chapter in enumerate(CHAPTERS, start=1):
            chapter_title = chapter.get("title_en", f"Chapter {chapter_num}")
            for text, translation in chapter["phrases"]:
                phrase = Phrase(
                    program_id=program.id,
                    text=text,
                    translation=translation,
                    position=position,
                    chapter=chapter_num,
                    chapter_title=chapter_title,
                )
                session.add(phrase)
                position += 1
                total += 1
            print(f"  Chapter {chapter_num} ({chapter_title}): {len(chapter['phrases'])} phrases")
        session.commit()
        print(f"\nDone. 1 program, {total} phrases across {len(CHAPTERS)} chapters.")


if __name__ == "__main__":
    main()
