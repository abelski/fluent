"""Seed 8 grammar articles about Lithuanian verbs.

Content is derived directly from the Russian introduction
of '365 глаголов литовского языка' (Stumbriene, Vilkiene, Prosniakova, 2015).

Usage (from repo root):
    python backend/scripts/seed_verb_articles.py             # insert drafts
    python backend/scripts/seed_verb_articles.py --publish   # insert and publish
    python backend/scripts/seed_verb_articles.py --reset     # delete & reinsert
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import Article
from sqlmodel import Session, select


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


ARTICLES = [
    {
        "slug": "verb-intro",
        "title_ru": "Глагол в литовском языке: введение",
        "title_en": "Lithuanian Verbs: Introduction",
        "tags": "глаголы,грамматика",
        "body_ru": """\
## Что такое глагол в литовском языке?

Глагол — самостоятельная часть речи, которая обозначает:

| Действие | Состояние |
|----------|-----------|
| *statyti namą* — строить дом | *jausti* — чувствовать |
| *važiuoti* — ехать | *džiaugtis* — радоваться |
| *rašyti laišką* — писать письмо | *lyja* — идёт дождь |
| *valytis dantis* — чистить зубы | *turėti duonos* — иметь хлеб |

## Переходные и непереходные глаголы

**Переходные** (*tranzityviniai*) глаголы указывают на действие, направленное на определённый объект:
*rašyti, piešti, statyti, auginti*

Переходные глаголы управляют **винительным падежом**: *rašyti laišką, auginti gėles*.

С отрицанием переходные глаголы требуют **родительного падежа**: *nerašyti laiško, neauginti gėlių*.

**Непереходные** (*intranzityviniai*) глаголы не требуют объекта в каком-либо падеже: *eiti, miegoti, sėdėti*.

## Возвратные глаголы

Возвратный суффикс **-si** (-s) соответствует русской частице **-ся (-сь)**. Возвратные глаголы обозначают:

1. Взаимное действие: *kalbėtis* (разговаривать), *pyktis* (злиться друг на друга)
2. Действие, направленное на себя: *praustis* (умываться), *šukuotis* (причёсываться)
3. Изменение положения: *stotis* (вставать), *sėstis* (садиться)
4. Изменение состояния: *kankintis* (мучиться), *žemintis* (унижаться)
5. Действие «в свою пользу»: *pirktis* (покупать для себя), *neštis* (нести себе)
6. Самопроизвольное действие: *baigtis* (заканчиваться), *suktis* (крутиться)

Некоторые глаголы бывают **только возвратными**: *juoktis* (смеяться), *domėtis* (интересоваться), *elgtis* (вести себя).

## Вид глагола

В литовском языке, как и в русском, есть два вида глагола:

- **Несовершенный вид** (*eigos veikslas*): обозначает **процесс** действия — *eiti* (идти), *skaityti* (читать), *augti* (расти)
- **Совершенный вид** (*įvykio veikslas*): обозначает **законченное действие**, результат — *išeiti* (выйти), *perskaityti* (прочитать), *užaugti* (вырасти)

Несовершенный вид обычно **не имеет приставок**, совершенный — **образуется с приставками**: *pa-, iš-, su-, at-, per-* и др.

## Спрягаемые и неспрягаемые формы

**Спрягаемые формы** включают три наклонения:
- изъявительное (*tiesioginė nuosaka*)
- условное (*tariamoji nuosaka*)
- повелительное (*liepiamoji nuosaka*)

Глаголы изменяются по **трём лицам** и **двум числам** (единственное и множественное).

**Неспрягаемые формы** — это причастия, деепричастия и полупричастие (*pusdalyvis*). Они могут изменяться по родам и склоняться.
""",
        "body_en": """\
## What is a verb in Lithuanian?

A verb (*veiksmažodis*) is a part of speech denoting action or state.
Lithuanian verbs are divided into **transitive** and **intransitive**, and many have a **reflexive** suffix *-si* (-s).
There are two aspects: imperfective (*eigos veikslas*) and perfective (*įvykio veikslas*).
Verbs have conjugated (indicative, conditional, imperative) and non-conjugated (participles, gerunds) forms.
""",
    },
    {
        "slug": "verb-present-tense",
        "title_ru": "Настоящее время (esamasis laikas)",
        "title_en": "Present Tense (esamasis laikas)",
        "tags": "глаголы,грамматика,времена",
        "body_ru": """\
## Что выражает настоящее время?

Настоящее время (*esamasis laikas*) обозначает:

- Действие, которое происходит **в момент речи**: *Aš **rašau** laišką.* — Я **пишу** письмо.
- Постоянное или повторяющееся действие: *Ši vaistinė **dirba** naktimis.* — Эта аптека **работает** по ночам.
- Действие, которое произойдёт **в скором времени**: *Rytoj **važiuoju** prie ežero.* — Завтра **еду** к озеру.

## Основные формы глагола

Для образования всех форм необходимо знать **три основных формы** глагола:
1. **Неопределённая форма** (инфинитив): *kalbėti*
2. **3-е лицо настоящего времени**: *kalba*
3. **3-е лицо прошедшего однократного времени**: *kalbėjo*

## Спряжение в настоящем времени

**Глаголы, 3-е лицо которых оканчивается на -а или -ia:**

| Лицо | Ед. число | Мн. число |
|------|-----------|-----------|
| aš (я) | kalb**u**, klaus**iu** | — |
| tu (ты) | kalb**i**, klaus**i** | — |
| jis, ji, jie, jos (он, она, они) | kalb**a**, klaus**ia** | kalb**a**, klaus**ia** |
| mes (мы) | kalb**ame**, klaus**iame** | |
| jūs (вы) | kalb**ate**, klaus**iate** | |

**Глаголы, 3-е лицо которых оканчивается на -i:**

| aš | gal**iu** | mes | gal**ime** |
|----|-----------|-----|------------|
| tu | gal**i** | jūs | gal**ite** |
| jis, ji, jie, jos | gal**i** | | gal**i** |

**Глаголы, 3-е лицо которых оканчивается на -o:**

| aš | raš**au** | mes | raš**ome** |
|----|-----------|-----|------------|
| tu | raš**ai** | jūs | raš**ote** |
| jis, ji, jie, jos | raš**o** | | raš**o** |

## Возвратные глаголы в настоящем времени

Возвратные глаголы с суффиксом **-si** перед 3-м лицом на **-a/-ia**:

| aš | perk**uosi**, džiaug**iuosi** | mes | perk**amės**, džiaug**iamės** |
|----|-------------------------------|-----|-------------------------------|
| tu | perk**iesi**, džiaug**iesi** | jūs | perk**atės**, džiaug**iatės** |
| jis | perk**asi**, džiaug**iasi** | jie | perk**asi**, džiaug**iasi** |

## Важное правило

Все формы настоящего времени **производны от 3-го лица**. Поэтому достаточно знать эту форму, чтобы образовать все остальные.
""",
        "body_en": """\
## Present Tense (esamasis laikas)

The present tense is formed from the 3rd-person stem. There are three conjugation types based on the 3rd-person ending: **-a/-ia**, **-i**, or **-o**.
All other persons are derived from this stem by adding personal endings.
Reflexive verbs add **-si** suffix after each personal ending.
""",
    },
    {
        "slug": "verb-past-tenses",
        "title_ru": "Прошедшее время: картинное и многократное",
        "title_en": "Past Tenses: Simple and Habitual",
        "tags": "глаголы,грамматика,времена",
        "body_ru": """\
## Прошедшее однократное время (būtasis kartinis laikas)

Обозначает:
- **Однократное** действие в прошлом: *Vakar **buvau** kine.* — Вчера **был** в кино.
- **Повторявшееся** в прошлом действие: *Kiekvieną vasarą mes **važiavome** prie jūros.* — Каждое лето мы **ездили** к морю.

### Спряжение

**Глаголы, 3-е лицо которых оканчивается на -о:**

| aš | kalbėj**au** | mes | kalbėj**ome** |
|----|--------------|-----|---------------|
| tu | kalbėj**ai** | jūs | kalbėj**ote** |
| jis, ji, jie, jos | kalbėj**o** | | kalbėj**o** |

**Глаголы, 3-е лицо которых оканчивается на -ė:**

| aš | raš**iau** | mes | raš**ėme** |
|----|------------|-----|------------|
| tu | raš**ei** | jūs | raš**ėte** |
| jis, ji, jie, jos | raš**ė** | | raš**ė** |

## Прошедшее многократное время (būtasis dažninis laikas)

Обозначает **обычное, повторяющееся** действие в прошлом:

*Vaikystėje labai **mėgdavau** žaisti lauke.* — В детстве я очень **любил** играть на улице.

### Образование

Это время образуется от **неопределённой формы** с суффиксом **-dav-**:

| Инфинитив | + суффикс | 3-е лицо |
|-----------|-----------|----------|
| kalbė**ti** | + **-dav-** + **-o** | kalbė**davo** |
| klausy**ti** | + **-dav-** + **-o** | klausy**davo** |
| rašy**ti** | + **-dav-** + **-o** | rašy**davo** |

### Спряжение (одинаково для всех глаголов)

| aš | rašy**davau** | mes | rašy**davome** |
|----|---------------|-----|----------------|
| tu | rašy**davai** | jūs | rašy**davote** |
| jis, ji, jie, jos | rašy**davo** | | rašy**davo** |

Возвратные глаголы: *mokydavausi, mokydavaisi, mokydavosi, mokydavomės, mokydavotės, mokydavosi*
""",
        "body_en": """\
## Past Tenses

Lithuanian has two simple past tenses:
- **Būtasis kartinis laikas** (simple past): one-time or repeated past action
- **Būtasis dažninis laikas** (habitual past): habitual/repeated past action, formed with suffix *-dav-*
""",
    },
    {
        "slug": "verb-future-tense",
        "title_ru": "Будущее время (būsimasis laikas)",
        "title_en": "Future Tense (būsimasis laikas)",
        "tags": "глаголы,грамматика,времена",
        "body_ru": """\
## Что выражает будущее время?

Будущее время (*būsimasis laikas*) обозначает действие, которое произойдёт в будущем:

*Rytoj **eisiu** į svečius.* — Завтра **пойду** в гости.

## Образование

Будущее время образуется от **неопределённой формы** с суффиксом **-s-**:

| Инфинитив | Основа будущего времени |
|-----------|------------------------|
| kalbė**ti** | kalbė**s** |
| klaus**ti** | klau**s** |
| važiuo**ti** | važiuo**s** |
| neš**ti** | ne**š** |
| zyz**ti** | zy**s** |
| rašy**ti** | rašy**s** |
| ly**ti** | li**s** |

⚠️ **Обратите внимание**: если основа инфинитива оканчивается на **-s-, -š-, -z-, -ž-**, в основе будущего времени остаётся только **-s-** или **-š-**:
*klaustı → klau**s**, nešti → ne**š**, vežti → ve**š***

## Спряжение (одинаково для всех глаголов)

| aš | rašy**siu** | mes | rašy**sime** |
|----|-------------|-----|--------------|
| tu | rašy**si** | jūs | rašy**site** |
| jis, ji, jie, jos | rašy**s** | | rašy**s** |

## Возвратные глаголы

| aš | moky**siuosi** | mes | moky**simės** |
|----|----------------|-----|---------------|
| tu | moky**siesi** | jūs | moky**sitės** |
| jis | moky**sis** | jie | moky**sis** |
""",
        "body_en": """\
## Future Tense (būsimasis laikas)

Formed from the infinitive stem + suffix **-s-**. Conjugation pattern is the same for all verbs.
Note: stems ending in -s, -š, -z, -ž before the infinitive ending keep only **-s** or **-š** in the future stem.
""",
    },
    {
        "slug": "verb-imperative",
        "title_ru": "Повелительное наклонение (liepiamoji nuosaka)",
        "title_en": "Imperative Mood (liepiamoji nuosaka)",
        "tags": "глаголы,грамматика,наклонение",
        "body_ru": """\
## Что выражает повелительное наклонение?

Повелительное наклонение (*liepiamoji nuosaka*) выражает **волю говорящего**: побуждение, требование, приказание:

*Kalbė**kite** lėčiau!* — **Говорите** помедленнее!

## Образование

Формы 1-го и 2-го лица образуются от **неопределённой формы** с суффиксом **-k-**:

*kalbė**ti** + **-k** = kalbė**k***

## Спряжение (одинаково для всех глаголов)

| Лицо | Ед. число | Мн. число |
|------|-----------|-----------|
| aš (я) | — | — |
| tu (ты) | kalbė**k** | — |
| jis, ji (он, она) | **tegu** kalba | **tegu** kalba |
| mes (мы) | — | kalbė**kime** |
| jūs (вы) | — | kalbė**kite** |

💡 Форма 3-го лица совпадает с **настоящим временем изъявительного наклонения**, но к ней добавляется частица **tegu** (или **te**).

## Возвратные глаголы

| tu | moky**kis** | mes | moky**kimės** |
|----|-------------|-----|---------------|
| jis | **tegu** mokosi | jūs | moky**kitės** |

## Примеры

- *Ateik čia!* — Иди сюда!
- *Sėskitės, prašom.* — Садитесь, пожалуйста.
- *Tegu jis kalba.* — Пусть он говорит.
- *Mokykimės kartu!* — Давайте учиться вместе!
""",
        "body_en": """\
## Imperative Mood (liepiamoji nuosaka)

Formed from the infinitive + suffix **-k**. The 3rd-person form uses the particle **tegu** (let) + present tense form.
Reflexive imperatives use the suffix **-kis** for 2nd person singular.
""",
    },
    {
        "slug": "verb-conditional",
        "title_ru": "Условное наклонение (tariamoji nuosaka)",
        "title_en": "Conditional Mood (tariamoji nuosaka)",
        "tags": "глаголы,грамматика,наклонение",
        "body_ru": """\
## Что выражает условное наклонение?

Условное наклонение (*tariamoji nuosaka*) обозначает действия, которые **возможны или желаемы**:

*Jis **norėtų** čia pabūti ilgiau.* — Он **хотел бы** побыть здесь подольше.

## Образование

Условное наклонение образуется от **неопределённой формы** с суффиксом **-t-**, причём перед окончанием **-iau** суффикс -t- превращается в **-č-**:

## Спряжение

| Лицо | Ед. число | Мн. число |
|------|-----------|-----------|
| aš | kalbė**čiau** | — |
| tu | kalbė**tum** | — |
| jis, ji, jie, jos | kalbė**tų** | kalbė**tų** |
| mes | kalbė**tume** / kalbė**tumėme** | |
| jūs | kalbė**tute** / kalbė**tumėte** | |

Формы 1-го и 2-го лица множественного числа могут быть **полными или краткими**.

## Составное условное наклонение

Составные формы образуются из глагола **būti** в условном наклонении + причастие прошедшего времени действительного залога:

*Jei **būtų buvęs** geras oras, **būtume važiavę** į ekskursiją.*
— Если бы погода **была** хорошей, мы бы **поехали** на экскурсию.

*Jei **būčiau buvusi** jaunesnė, **būčiau šokusi** visą vakarą.*
— Если бы я **была** моложе, я бы **танцевала** весь вечер.

## Возвратные глаголы

| aš | moky**čiausi** | mes | moky**tumėmės** |
|----|----------------|-----|-----------------|
| tu | moky**tumeisi** | jūs | moky**tumėtės** |
| jis | moky**tųsi** | jie | moky**tųsi** |
""",
        "body_en": """\
## Conditional Mood (tariamoji nuosaka)

Formed from the infinitive + suffix **-t-** (becomes **-č-** before **-iau**). Expresses possibility, desire, or unreal conditions.
Compound conditional uses **būti** (conditional) + active past participle.
""",
    },
    {
        "slug": "verb-participles",
        "title_ru": "Причастия и деепричастия в литовском языке",
        "title_en": "Participles and Gerunds in Lithuanian",
        "tags": "глаголы,грамматика,причастия",
        "body_ru": """\
## Неспрягаемые формы глагола

В книге «365 глаголов» для каждого глагола приводятся **9 неспрягаемых форм**:

| № | Форма | Описание |
|---|-------|----------|
| 1 | Причастие действ. настоящего времени | *kalbantis / kalbąs*, *kalbanti* |
| 2 | Причастие действ. прошедшего однократного | *kalbėjęs*, *kalbėjusi* |
| 3 | Причастие действ. прошедшего многократного | *kalbėdavęs*, *kalbėdavusi* |
| 4 | Причастие действ. будущего времени | *kalbėsiantis / kalbėsiąs*, *kalbėsianti* |
| 5 | Причастие страдат. настоящего времени | *kalbamas*, *kalbama*, *kalbama* |
| 6 | Причастие страдат. прошедшего времени | *kalbėtas*, *kalbėta*, *kalbėta* |
| 7 | Полупричастие (*pusdalyvis*) | *kalbėdamas*, *kalbėdama* |
| 8 | Деепричастие настоящего времени | *kalbant* |
| 9 | Деепричастие прошедшего времени | *kalbėjus* |

## Действительные причастия настоящего времени

Образуются от **3-го лица настоящего времени**:

*kalba* + **-ntis/-nti** = *kalb**antis** / kalb**anti***

Обозначают состояние человека или предмета **в настоящем**:

*Dainuojanti moteris patiko visiems.* — **Поющая** женщина понравилась всем.
*Ant stalo gulinti knyga yra mokytojo.* — **Лежащая** на столе книга принадлежит учителю.

## Причастия прошедшего времени

От **3-го лица прошедшего однократного времени** + **-ęs/-usi**:

*kalbėj**ęs***, *kalbėj**usi*** — говоривший, говорившая

*Parėjęs namo brolis skaitė knygą.* — **Пришедший** домой брат читал книгу.

## Полупричастие (pusdalyvis)

Форма, обозначающая **дополнительное**, второстепенное действие того же субъекта:

*Brolis, **eidamas** iš darbo namo, sutiko savo seną pažįstamą.*
— Брат, **идя** домой с работы, встретил своего старого знакомого.

Образуется от инфинитива + **-damas/-dama**.

## Деепричастия

- **Деепричастие настоящего времени** (*padalyvis*): от 3-го лица настоящего → + **-nt**: *kalbant*, *rašant*
  - Выражает **одновременное** действие: *Tėvams žiūrint televizorių, vaikai žaidė.*
- **Деепричастие прошедшего времени**: от 3-го лица прошедшего → + **-us**: *kalbėjus*, *rašius*
  - Выражает **предшествующее** действие: *Tėvui parėjus namo, visa šeima sėdo valgyti.*
""",
        "body_en": """\
## Participles and Non-Conjugated Forms

Lithuanian has 9 non-conjugated verb forms: 4 active participles, 2 passive participles,
a half-participle (*pusdalyvis*), and 2 gerunds (*padalyviai*).
These forms agree in gender and number, or are indeclinable.
""",
    },
    {
        "slug": "verb-governance",
        "title_ru": "Управление глаголов и приставочные образования",
        "title_en": "Verb Governance and Prefix Forms",
        "tags": "глаголы,грамматика,управление,приставки",
        "body_ru": """\
## Управление глаголов

**Управление** (*valdymas*) — это способность глагола требовать определённого падежа от зависимого слова.

Примеры вопросов, которыми управляют литовские глаголы:

| Вопрос | Падеж | Пример |
|--------|-------|--------|
| **ką?** (кого? что?) | Винительный | *Aš skaitau **knygą**.* — Читаю книгу. |
| **ko?** (кого? чего?) | Родительный | *Jis laukia **draugo**.* — Ждёт друга. |
| **kam?** (кому? чему?) | Дательный | *Ji padeda **mamai**.* — Помогает маме. |
| **kuo?** (кем? чем?) | Творительный | *Jis domisi **muzika**.* — Интересуется музыкой. |
| **kur?** (где?) | Местный | *Gyvenu **Vilniuje**.* — Живу в Вильнюсе. |
| **apie ką?** (о чём?) | Вин. с предлогом | *Kalba **apie kelionę**.* — Говорит о поездке. |

В книге «365 глаголов» управление каждого глагола показано на **реальных примерах предложений** с переводом на русский язык.

## Приставочные глаголы

Приставки изменяют **значение** глагола, а нередко и **управление** (падеж зависимого слова):

| Приставка | Значение | Пример |
|-----------|----------|--------|
| **pa-** | начало/небольшое действие | *gauti* → *pa**gauti*** (поймать) |
| **ap-** | обман / охват | *gauti* → *ap**gauti*** (обмануть) |
| **su-** | завершение / совместность | *gauti* → *su**gauti*** (поймать, словить) |
| **iš-** | исчерпанность / выход | *eiti* → *iš**eiti*** (выйти) |
| **at-** | возврат / удаление | *eiti* → *at**eiti*** (прийти) |
| **per-** | через / сверх меры | *skaityti* → *per**skaityti*** (прочитать) |

### Изменение управления с приставками

Сравните: *rinkti uogas* (собирать ягоды) vs. *pri**sirinkti** uogų* — наполниться ягодами.

Глаголы с приставками **pri-**, **iš-** и др. нередко меняют падеж объекта с **винительного на родительный**.

## Совет для изучающих

При изучении каждого глагола обращайте внимание:
1. **Какой падеж** требует глагол (управление)
2. **Как меняется управление** с отрицанием (*ne-*)
3. **Какие приставочные формы** наиболее распространены и как они меняют смысл

Все эти данные приведены в книге «365 глаголов» для каждого из 365 глаголов.
""",
        "body_en": """\
## Verb Governance and Prefixes

Lithuanian verbs require specific cases from dependent words (governance).
Common case questions: *ką?* (accusative), *ko?* (genitive), *kam?* (dative), *kuo?* (instrumental), *kur?* (locative).
Prefixes (*pa-, ap-, su-, iš-, at-, per-* etc.) can change both meaning and case governance.
""",
    },
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true", help="Publish articles (default: draft)")
    parser.add_argument("--reset", action="store_true", help="Delete existing articles before inserting")
    args = parser.parse_args()

    published = args.publish
    now = _utcnow()

    with Session(engine) as session:
        if args.reset:
            for art_data in ARTICLES:
                existing = session.exec(
                    select(Article).where(Article.slug == art_data["slug"])
                ).first()
                if existing:
                    session.delete(existing)
            session.commit()
            print("Deleted existing verb articles.")

        created = skipped = 0
        for art_data in ARTICLES:
            existing = session.exec(
                select(Article).where(Article.slug == art_data["slug"])
            ).first()
            if existing:
                skipped += 1
                continue

            article = Article(
                slug=art_data["slug"],
                title_ru=art_data["title_ru"],
                title_en=art_data["title_en"],
                body_ru=art_data["body_ru"],
                body_en=art_data["body_en"],
                tags=art_data["tags"],
                published=published,
                show_in_footer=False,
                created_at=now,
                updated_at=now,
            )
            session.add(article)
            created += 1

        session.commit()

    status = "published" if published else "draft"
    print(f"Done: {created} articles created ({status}), {skipped} already existed")
    if not published:
        print("Tip: use --publish to make articles visible, or publish via admin panel")


if __name__ == "__main__":
    main()
