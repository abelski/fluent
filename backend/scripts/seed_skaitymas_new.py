"""Seed script: creates the Skaitymas reading practice program."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from models import PracticeCategory, PracticeTest, PracticeQuestion
from sqlmodel import Session, select

LESSONS = [
    {
        "title_ru": "Урок 2 — «Это мой друг»",
        "title_en": "2 skyrius — Cia mano draugas",
        "sort_order": 1,
        "lesson_text_lt": (
            "*Lina ir Tomas apie Maiklą:*\n\n"
            "— Tomai, ar Maiklas yra tavo draugas?\n"
            "— Taip, Lina, Maiklas yra mano draugas.\n"
            "— Ar jis kalba lietuviškai?\n"
            "— Ne, Maiklas nekalba lietuviškai.\n"
            "— Kaip jūs, tu ir Maiklas, kalbate? Angliškai?\n"
            "— Taip. O tu, Lina, kalbi angliškai?\n"
            "— Taip, aš kalbu angliškai ir ispaniškai. Ar Maiklas supranta ispaniškai?\n"
            "— Taip, jis labai gerai kalba ispaniškai.\n"
            "— O tu, Tomai?\n"
            "— Aš nekalbu ispaniškai."
        ),
        "questions": [
            ("Tomas kalba ispaniškai.", "b"),
            ("Maiklas kalba lietuviškai.", "b"),
            ("Lina kalba angliškai.", "a"),
            ("Maiklas gerai kalba ispaniškai.", "a"),
            ("Tomas kalba angliškai.", "a"),
            ("Lina kalba ispaniškai.", "a"),
        ],
    },
    {
        "title_ru": "Урок 3 — «Какой твой адрес?»",
        "title_en": "3 skyrius — Koks tavo adresas?",
        "sort_order": 2,
        "lesson_text_lt": (
            "*Rita, Viktoras, Pjeras:*\n\n"
            "— Labas, Viktorai!\n"
            "— Labas, Rita! Kaip sekasi?\n"
            "— Ačiū, gerai. O tau?\n"
            "— Taip pat gerai. Čia Pjeras. Iš Prancūzijos.\n"
            "— Malonu. Rita.\n"
            "— Malonu.\n"
            "— Ar jūs esate iš Paryžiaus?\n"
            "— Ne. Iš Lilio.\n"
            "— Jūs kalbate lietuviškai!\n"
            "— Truputį kalbu. Ar jūs kalbate prancūziškai?\n"
            "— Aš nekalbu prancūziškai, bet truputį suprantu. Ar jūs studijuojate Lietuvoje?\n"
            "— Taip, studijuoju Lietuvoje, Vilniuje. Ar jūs taip pat studijuojate Vilniuje?\n"
            "— Ne. Aš studijuoju Anglijoje, Londone.\n"
            "— Aš taip pat."
        ),
        "questions": [
            ("Pjeras yra iš Paryžiaus.", "b"),
            ("Pjeras kalba lietuviškai.", "a"),
            ("Rita kalba prancūziškai.", "b"),
            ("Pjeras yra studentas.", "a"),
            ("Rita studijuoja Vilniuje.", "b"),
            ("Viktoras studijuoja Anglijoje.", "a"),
        ],
    },
    {
        "title_ru": "Урок 4 — «Когда и где встречаемся?»",
        "title_en": "4 skyrius — Kada ir kur susitinkame?",
        "sort_order": 3,
        "lesson_text_lt": (
            "*Karolina ir Adomas (SMS žinutės):*\n\n"
            "**[žinutė 1]** Sveika, Karolina. Einame šiandien vakare į kiną. "
            "Filmas 19.00 val. Susitinkame kavinėje prie kino teatro „Vilnis” 18.00. Gerai?\n\n"
            "**[žinutė 2]** Sveikas, Adomai! Einame! Tik ne šiandien, o rytoj, penktadienį. "
            "Ketvirtadienį vakare visada einu į sporto klubą.\n\n"
            "**[žinutė 3]** Tai sutarta, Karolina. Susitinkame penktadienį prie kino teatro 18.00. Iki!\n\n"
            "**[žinutė 4]** Sutarta, Adomai! Iki!"
        ),
        "questions": [
            ("Karolina ir Adomas eina į kiną.", "a"),
            ("Karolina ir Adomas susitinka prie sporto klubo.", "b"),
            ("Į kiną jie eina penktadienį.", "a"),
            ("Filmas 18.00 valandą.", "b"),
        ],
    },
    {
        "title_ru": "Урок 5 — «Это моя семья»",
        "title_en": "5 skyrius — Cia mano seima",
        "sort_order": 4,
        "lesson_text_lt": (
            "**Mano šeima**\n\n"
            "Mano vardas yra Rūta. Mano šeima gyvena prie Vilniaus. Mūsų namas yra prie upės. "
            "Netoli yra miškas. Aš ir mano vyras Petras dažnai vaikščiojame miške. "
            "Kasdien vakare mano vyras dirba sode, o aš žiūriu televizorių.\n\n"
            "Paulius ir Saulius yra mūsų sūnūs. Jie jau eina į mokyklą. Berniukai labai mėgsta sportą. "
            "Antradienį ir ketvirtadienį jie žaidžia futbolą, o šeštadienį visi kartu važiuojame į baseiną.\n\n"
            "Mano tėvai gyvena Utenoje. Savaitgalį dažnai važiuoju pas tėvus. "
            "Kartais mes kartu einame į kavinę arba vaikščiojame parke.\n\n"
            "Aš dirbu Vilniuje, muzikos mokykloje. Mano vyras yra ekonomistas. Jis dirba Kaune. "
            "Petras kasdien rytą važiuoja į darbą, o vakare – namo."
        ),
        "questions": [
            ("Rūta gyvena Vilniuje.", "b"),
            ("Rūta dažnai vaikščioja miške.", "a"),
            ("Kasdien vakare Petras žiūri televizorių.", "b"),
            ("Paulius ir Saulius eina į mokyklą.", "a"),
            ("Šeštadienį vaikai žaidžia futbolą.", "b"),
            ("Rūta dažnai važiuoja pas tėvus.", "a"),
            ("Petras dirba Kaune.", "a"),
        ],
    },
    {
        "title_ru": "Урок 6 — «Семья Линаса и Кристины»",
        "title_en": "6 skyrius — Lino ir Kristinos seima",
        "sort_order": 5,
        "lesson_text_lt": (
            "**Lino ir Kristinos šeima**\n\n"
            "Mano vardas yra Linas. Mano žmonos vardas yra Kristina. Mes turime dukterį. "
            "Jos vardas – Milda. Ji yra dar maža. Milda eina į vaikų darželį. Mes turime ir sūnų. "
            "Jo vardas Mantas. Mūsų sūnus jau didelis berniukas. Jis eina į mokyklą. "
            "Vaikai turi du senelius ir dvi seneles. Seneliai gyvena netoli. Mes dažnai susitinkame."
        ),
        "questions": [
            ("Tėčio vardas yra Linas.", "a"),
            ("Dukters vardas yra Marta.", "b"),
            ("Milda eina į vaikų darželį.", "a"),
            ("Mantas eina į mokyklą.", "a"),
            ("Seneliai gyvena netoli.", "a"),
        ],
    },
    {
        "title_ru": "Урок 7 — «Что мы едим»",
        "title_en": "7 skyrius — Ka mes valgome",
        "sort_order": 6,
        "lesson_text_lt": (
            "Kasdien rytą aš valgau košę ir geriu juodą kavą. Labai mėgstu juodą kavą! "
            "Mano vyras nemėgsta kavos. Jis geria juodą arbatą.\n\n"
            "Rytą mano vyras, kaip ir aš, visada valgo košę, bet vaikai košės nemėgsta. "
            "Sūnus visada valgo sumuštinį ir geria arbatą, duktė valgo tik bandelę ir geria pieną. "
            "Aš ir mano vyras darbo dieną pietaujame kavinėje. Vaikai valgo pietus mokyklos valgykloje. "
            "Pietūs mokyklos valgykloje labai skanūs!\n\n"
            "Šeštadienį rytą neskubame nei į darbą, nei į mokyklą – namie valgome blynus ir geriame kakavą. "
            "Aš labai mėgstu kakavą šeštadienio rytą. Savaitgalį kartais pietaujame kavinėje arba "
            "važiuojame pas mano arba vyro tėvus. Senelių pietūs visada labai skanūs. "
            "Močiutės Agnės – vyro mamos – pyragas yra fantastiškas! "
            "Mano mamos – močiutės Viktorijos – bandelės yra skaniausios pasaulyje!\n\n"
            "Kartais sekmadienį važiuojame į mišką. Miške žaidžiame, vaikščiojame, "
            "valgome pyragą ir geriame arbatą iš termoso."
        ),
        "questions": [
            ("Moteris mėgsta juodą kavą.", "a"),
            ("Vyras rytą geria kavą.", "b"),
            ("Vaikai rytą valgo košę.", "b"),
            ("Vyras ir žmona darbo dieną pietauja namie.", "b"),
            ("Vaikai pietauja kavinėje.", "b"),
            ("Šeštadienį šeima pusryčiauja namie.", "a"),
            ("Sekmadienį seneliai važiuoja pietauti pas vaikus.", "b"),
            ("Močiutės Agnės pyragas yra labai skanus.", "a"),
            ("Moters mamos bandelės labai skanios.", "a"),
            ("Sekmadienį šeima kartais važiuoja į mišką.", "a"),
        ],
    },
    {
        "title_ru": "Урок 8 — На рынке",
        "title_en": "8 skyrius — Turguje",
        "sort_order": 7,
        "lesson_text_lt": (
            "*Pokalbis: pardavėjas ir pirkėja*\n\n"
            "**Pardavėjas:** Labas rytas, ponia!\n"
            "**Pirkėja:** Labas rytas!\n"
            "**Pardavėjas:** Ko norėtumėte?\n"
            "**Pirkėja:** Prašom duoti pomidorų.\n"
            "**Pardavėjas:** Raudonų ar geltonų?\n"
            "**Pirkėja:** Prašom kilogramą raudonų.\n"
            "**Pardavėjas:** Dar ko nors?\n"
            "**Pirkėja:** Taip. Prašom duoti du kilogramus bulvių ir braškių.\n"
            "**Pardavėjas:** Kiek braškių?\n"
            "**Pirkėja:** Kilogramą, prašom.\n"
            "**Pardavėjas:** Braškės labai saldžios! Štai, prašom. Pomidorai, bulvės ir braškės.\n"
            "**Pirkėja:** Kiek tai kainuoja?\n"
            "**Pardavėjas:** Pomidorai – 2 €, bulvės – 1,50 €, braškės – 5 €. Viso 8,50 €.\n"
            "**Pirkėja:** Prašom."
        ),
        "questions": [
            ("Pirkėja perka pomidorus.", "a"),
            ("Pirkėja perka geltonus pomidorus.", "b"),
            ("Pirkėja perka kilogramą braškių.", "a"),
            ("Braškės yra nesaldžios.", "b"),
            ("Pirkėja perka du kilogramus bulvių.", "a"),
            ("Pirkėja sumoka 8,50 €.", "a"),
        ],
    },
    {
        "title_ru": "Урок 10 — Сообщения",
        "title_en": "10 skyrius — Zinutės",
        "sort_order": 8,
        "lesson_text_lt": (
            "*SMS žinutės: Rūta ir Marija*\n\n"
            "**[1]** Sveika, Marija! Šeštadienį aš turiu gimtadienį. Ateik į svečius! "
            "Mama iškepė tortą. Laukiame tavęs 18.00.\n\n"
            "**[2]** Labas, Rūta! Ačiū už kvietimą! Žinoma, ateisiu. Kaip pas tave nuvažiuoti?\n\n"
            "**[3]** Labai paprasta! Iš centro autobusas Nr. 7. "
            "Išlipk stotelėje „Parduotuvė”. Aš gyvenu name Nr. 13, bute Nr. 24. Iki šeštadienio!\n\n"
            "**[4]** Puiku! Iki šeštadienio!"
        ),
        "questions": [
            ("Rūta kviečia Mariją į svečius.", "a"),
            ("Rūtos mama pirks tortą.", "b"),
            ("Marija atvažiuos šeštadienį.", "a"),
            ("Pas Rūtą galima nuvažiuoti autobusu.", "a"),
            ("Rūta gyvena prie parduotuvės.", "a"),
            ("Rūtos namo numeris yra 24.", "b"),
        ],
    },
    {
        "title_ru": "Урок 11 — Аренда автомобиля",
        "title_en": "11 skyrius — Automobiliu nuoma",
        "sort_order": 9,
        "lesson_text_lt": (
            "**Automobilių nuoma „AutoDraugas”**\n\n"
            "Norite išsinuomoti automobilį? Skambinkite mums arba rezervuokite internetu!\n\n"
            "Mūsų automobiliai nauji ir patogūs. Turime visų klasių automobilius.\n\n"
            "Nuomos punktai Vilniuje, Kaune ir Klaipėdoje dirba visą parą.\n\n"
            "Rezervacijos mokestis – nedidelis. Galite mokėti kortele arba grynaisiais.\n\n"
            "Taip pat galite išsinuomoti automobilį su vairuotoju."
        ),
        "questions": [
            ("Automobilį galima išsinuomoti tik telefonu.", "b"),
            ("Automobiliai yra nauji.", "a"),
            ("Nuomos punktai dirba tik dieną.", "b"),
            ("Rezervacijos mokestis yra didelis.", "b"),
            ("Galima išsinuomoti automobilį su vairuotoju.", "a"),
            ("Nuomos punktai yra Kaune.", "a"),
        ],
    },
    {
        "title_ru": "Урок 12 — Аренда квартиры",
        "title_en": "12 skyrius — Buto nuoma",
        "sort_order": 10,
        "lesson_text_lt": (
            "**Skelbimai: butai nuomai**\n\n"
            "**A** — 2 kambarių butas netoli universiteto. Šiltas, šviesus. 450 €/mėn.\n\n"
            "**B** — Jaukus 1 kambarių butas senamiestyje, su baldais. 500 €/mėn.\n\n"
            "**C** — 3 kambarių butas su baldais naujame rajone. 700 €/mėn.\n\n"
            "**D** — Erdvus butas su baldais. Netoli universiteto. 350 €/mėn.\n\n"
            "---\n\n"
            "**Ieškotojai:**\n\n"
            "**Ieškotoja B:** Noriu nuomoti butą netoli universiteto, iki 500 €/mėn.\n\n"
            "**Ieškotojas C:** Ieškau buto su baldais. Galiu mokėti iki 1000 €/mėn."
        ),
        "questions": [
            ("1-asis butas yra netoli universiteto.", "a"),
            ("2-asis butas yra labai šaltas.", "b"),
            ("3-asis butas yra be baldų.", "b"),
            ("4-asis butas yra naujame rajone.", "b"),
            ("Ieškotoja B nori buto prie universiteto.", "a"),
            ("Ieškotojas C gali mokėti iki 1000 eurų.", "a"),
        ],
    },
    {
        "title_ru": "Урок 13 — «Дела дома»",
        "title_en": "13 skyrius — Darbai namie",
        "sort_order": 11,
        "lesson_text_lt": (
            "**Darbai namie**\n\n"
            "Mano vardas Inga. Aš dirbu universitete. Man labai patinka mano darbas, "
            "bet labiausiai mėgstu būti namie su šeima. Mes turime tris vaikus.\n\n"
            "Mes dažnai tvarkome namus kartu. Ypač tvarkome virtuvę. "
            "Man nepatinka tvarkyti namus, bet mūsų namai visada švarūs, "
            "nes visa šeima padeda.\n\n"
            "Mano vyras visada plauna indus po vakarienės. "
            "Mano sūnus išneša šiukšles. Duktė valosi savo kambarį.\n\n"
            "Aš gaminu maistą ir skalbiu drabužius."
        ),
        "questions": [
            ("Inga dirba namie.", "b"),
            ("Ingai patinka būti su šeima.", "a"),
            ("Inga turi tris vaikus.", "a"),
            ("Ingos šeima virtuvę tvarko retai.", "b"),
            ("Ingai patinka tvarkyti namus.", "b"),
            ("Namus Inga tvarko viena.", "b"),
            ("Ingos vyras plauna indus.", "a"),
            ("Šiukšles išneša Ingos duktė.", "a"),
        ],
    },
    {
        "title_ru": "Урок 14 — «Мои путешествия и шкаф»",
        "title_en": "14 skyrius — Mano keliones ir spinta",
        "sort_order": 12,
        "lesson_text_lt": (
            "**Mano kelionės ir spinta**\n\n"
            "Aš esu Vytautė. Studijuoju universitete. Man labai patinka keliauti. "
            "Dažnai keliauju viena.\n\n"
            "Kai keliauju, mėgstu pirkti drabužius. Mano spinta yra labai didelė. "
            "Turiu daug drabužių iš kelionių.\n\n"
            "Iš Talino tėvai man nupirko gražią raudoną suknelę. "
            "Prahoje nusipirkau patogias basutes, ne žieminius batus. "
            "Mano megztinis – iš Kopenhagos. Dėviu jį universitete. "
            "Paltą nusipirkau Londone. Jis labai šiltas.\n\n"
            "Drabužius iš kelionių dėviu dažnai."
        ),
        "questions": [
            ("Vytautė studijuoja.", "a"),
            ("Vytautei patinka kelionės.", "a"),
            ("Vytautė dažnai keliauja su draugais.", "b"),
            ("Kai keliauja, Vytautė mėgsta pirkti drabužius.", "a"),
            ("Vytautės spinta yra maža.", "b"),
            ("Raudoną suknelę tėvai nupirko Taline.", "a"),
            ("Prahoje Vytautė nusipirko žieminius batus.", "b"),
            ("Megztinį Vytautė dėvi universitete.", "a"),
            ("Paltą Vytautė nusipirko Londone.", "a"),
            ("Vytautė retai dėvi drabužius iš kelionių.", "b"),
        ],
    },
    {
        "title_ru": "Урок 15 — Объявления об услугах",
        "title_en": "15 skyrius — Paslaugu skelbimai",
        "sort_order": 13,
        "lesson_text_lt": (
            "**Skelbimai**\n\n"
            "**A** — „Patalynės siuvėja” — siuvame patalynę pagal užsakymą. Kokybiškai ir greitai.\n\n"
            "**B** — „Batukas” — taiso avalynę ir odinius gaminius: piniginės, diržai, krepšiai.\n\n"
            "**C** — „Senamiesčio siuvėjas” — siuvame vyriškus, moteriškus ir vaikiškus rūbus.\n\n"
            "**D** — „Miesto laikas” — parduodame ir taisome laikrodžius.\n\n"
            "**E** — „Švara” — valome drabužius. Greitas aptarnavimas."
        ),
        "questions": [
            ('"Švara" valo drabužius.', "a"),
            ('"Batukas" taiso laikrodžius.', "b"),
            ('"Senamiesčio siuvėjas" siuva tik moteriškus rūbus.', "b"),
            ('"Miesto laikas" parduoda ir taiso laikrodžius.', "a"),
            ("Skelbimas A yra apie drabužių valymą.", "b"),
            ("Sugedo piniginė — reikia eiti į B skelbimą.", "a"),
        ],
    },
    {
        "title_ru": "Урок 16 — «Если простудились...»",
        "title_en": "16 skyrius — Jeigu persalote...",
        "sort_order": 14,
        "lesson_text_lt": (
            "**Jeigu peršalote...**\n\n"
            "Mūsų šeima dažnai peršąla rudenį ir pavasarį. "
            "Kai peršąlame, geriam žolelių arbatą su medum. "
            "Kai skauda gerklę, nevalgome medaus su arbata – valgome šaukštelį medaus po arbatos.\n\n"
            "Kai sergate gripu, temperatūra visada aukšta. "
            "Tada reikia gerti daug skysčių ir ilsėtis.\n\n"
            "Mes žinome, kad česnakas yra natūralus antibiotikas. "
            "Jei natūralūs vaistai nepadeda, eikite pas gydytoją."
        ),
        "questions": [
            ("Šeima dažnai peršąla rudenį ir vasarą.", "b"),
            ("Vyras geria žolelių arbatą.", "a"),
            ("Kai skauda gerklę, medų deda į arbatą.", "b"),
            ("Gripu sergant temperatūra yra aukšta.", "a"),
            ("Česnakas yra natūralus antibiotikas.", "a"),
            ("Jei natūralūs vaistai nepadeda, reikia eiti pas gydytoją.", "a"),
        ],
    },
    {
        "title_ru": "Урок 17 — Инструкция к лекарству",
        "title_en": "17 skyrius — Vaistu informacinis lapelis",
        "sort_order": 15,
        "lesson_text_lt": (
            "**Vaistų informacinis lapelis**\n\n"
            "**Vaistai nuo karščiavimo ir skausmo**\n\n"
            "Šiuos vaistus galite pirkti be recepto.\n\n"
            "**Kam skirti vaistai:**\n"
            "Tinka, kai turite temperatūros, skauda galvą arba raumenys.\n\n"
            "**Kas negali vartoti:**\n"
            "Vaikai iki 12 metų. Žmonės, alergiški laktozei.\n\n"
            "**Kaip vartoti:**\n"
            "Gerti po valgio arba valgant. Negerti prieš valgį.\n\n"
            "**Laikymo sąlygos:**\n"
            "Laikyti ne aukštesnėje kaip 25°C temperatūroje. Nereikia šaldytuvo.\n\n"
            "Jei vaistai nepadeda, kreipkitės į gydytoją."
        ),
        "questions": [
            ("Vaistus galite pirkti be recepto.", "a"),
            ("Vaikai iki 12 metų negali gerti šių vaistų.", "a"),
            ("Šie vaistai tinka, kai turite temperatūros.", "a"),
            ("Vaistus reikia gerti prieš valgį.", "b"),
            ("Šie vaistai tinka alergiškiems laktozei žmonėms.", "b"),
            ("Jei vaistai nepadeda, reikia eiti pas gydytoją.", "a"),
            ("Vaistai turi būti šaldytuve.", "b"),
        ],
    },
    {
        "title_ru": "Урок 18 — Объявления о работе",
        "title_en": "18 skyrius — Darbo skelbimai",
        "sort_order": 16,
        "lesson_text_lt": (
            "**Darbo skelbimai**\n\n"
            "**A** — Kavinė „Svajonė” ieško padavėjo (-os). "
            "Reikalinga patirtis. Tel. 8 600 11111.\n\n"
            "**B** — Ieškome pardavėjo (-os) sporto prekių parduotuvėje. "
            "Tinka ir studentai. El. p.: darbas@sportas.lt\n\n"
            "**C** — Reikalingas vertėjas (-a), mokantis angliškai ir vokiškai.\n\n"
            "**D** — Ligoninė ieško slaugytojo (-os). Siųsti CV.\n\n"
            "**E** — Reikalingas vairuotojas (-a). Būtinas vairuotojo pažymėjimas.\n\n"
            "---\n\n"
            "**Ieškantieji darbo:**\n\n"
            "**1-asis:** Noriu dirbti sporto parduotuvėje.\n\n"
            "**3-iasis:** Moku angliškai ir vokiškai.\n\n"
            "**4-asis:** Studijuoju mediciną, noriu dirbti ligoninėje.\n\n"
            "**5-asis:** Turiu vairuotojo pažymėjimą."
        ),
        "questions": [
            ('Kavinė "Svajonė" ieško padavėjo.', "a"),
            ("1-asis ieško darbo biure.", "b"),
            ("4-asis ieško darbo ligoninėje.", "a"),
            ("Skelbimas B siūlo darbą tik studentams.", "b"),
            ("3-iasis moka angliškai ir vokiškai.", "a"),
            ("5-asis turi vairuotojo pažymėjimą.", "a"),
        ],
    },
    {
        "title_ru": "Урок 19 — «Мой брат — студент»",
        "title_en": "19 skyrius — Mano brolis studentas",
        "sort_order": 17,
        "lesson_text_lt": (
            "*Pokalbis: Eglė ir Jonas*\n\n"
            "— Labas, Jonai! Kaip sekasi?\n"
            "— Gerai, ačiū. O tau?\n"
            "— Ačiū, gerai. Ar tavo brolis Matas dar mokosi mokykloje?\n"
            "— Ne, Matas jau studijuoja universitete. Trečiame kurse.\n"
            "— Ką jis studijuoja?\n"
            "— Istoriją.\n"
            "— Įdomu! O tu ką planuoji studijuoti?\n"
            "— Dar nežinau. Gal chemiją.\n"
            "— Aš studijuoju prancūzų kalbą. Gal ir tu rinktum prancūzų?\n"
            "— Ne, prancūziškai nemoku. Mes su Matu kalbame prancūziškai tik juokais!\n"
            "— Haha! O kur Matas vasarą atostogaus?\n"
            "— Po egzaminų važiuos prie jūros.\n"
            "— O tu?\n"
            "— Aš atostogausiu pas močiutę kaime."
        ),
        "questions": [
            ("Jonas yra mokinys.", "a"),
            ("Matas studijuoja antrame kurse.", "b"),
            ("Matas studijuoja istoriją.", "a"),
            ("Eglė su Jonu kalba prancūziškai.", "a"),
            ("Jonas nori studijuoti chemiją.", "a"),
            ("Po egzaminų Matas važiuos į kaimą.", "b"),
            ("Jonas atostogaus pas močiutę.", "a"),
        ],
    },
    {
        "title_ru": "Урок 20 — Кино и досуг",
        "title_en": "20 skyrius — Kinas ir laisvalaikis",
        "sort_order": 18,
        "lesson_text_lt": (
            "**Kinas ir laisvalaikis**\n\n"
            "Mano vardas Kristina. Turiu du sūnus ir dukterį. Mano šeimai patinka sportuoti.\n\n"
            "Rudenį su vyru einame į operą arba į teatrą. Vaikai į operą neina – jiems neįdomu.\n\n"
            "Žiemą šeima kartu slidinėja. Pirmą kartą slidinėjau per Kalėdų atostogas – man labai patiko!\n\n"
            "Vasarą važiuojame prie jūros. Šią vasarą skriskim į Italiją lėktuvu. "
            "Mano vyras su sūnumis labai mėgsta prie jūros žvejoti. "
            "Dukteriai ir man labai patinka grybauti. "
            "Kaime, pas senelius, mes kartu renkame grybus ir uogas, valgome šviežius grybus."
        ),
        "questions": [
            ("Kristina turi tris vaikus.", "a"),
            ("Šeimai patinka sportuoti.", "a"),
            ("Rudenį šeima su vaikais eina į operą.", "b"),
            ("Kristinos šeima nemėgsta muzikos.", "b"),
            ("Kristina pirmą kartą slidinėjo per atostogas.", "a"),
            ("Šią vasarą šeima važiuos į Italiją automobiliu.", "b"),
            ("Kristinos vyras su sūnumis mėgsta būti prie jūros.", "a"),
            ("Sūnūs nemėgsta žvejoti.", "b"),
            ("Močiutei ir anūkei patinka grybauti.", "a"),
            ("Kaime šeima valgo grybus.", "a"),
        ],
    },
    {
        "title_ru": "Урок 21 — Открытки и литовские праздники",
        "title_en": "21 skyrius — Atvirukai ir lietuviskas sventes",
        "sort_order": 19,
        "lesson_text_lt": (
            "**Lietuviškos šventės**\n\n"
            "**Vasario 16-oji** — Lietuvos valstybės atkūrimo diena. "
            "1918 metais Lietuva paskelbė nepriklausomybę.\n\n"
            "**Kovo 11-oji** — Lietuvos nepriklausomybės atkūrimo diena. "
            "Šią dieną žmonės eina į miesto aikštę.\n\n"
            "**Liepos 6-oji** — Valstybės (Lietuvos karaliaus Mindaugo karūnavimo) diena. "
            "Mindaugas buvo pirmasis Lietuvos karalius.\n\n"
            "**Kūčios (gruodžio 24 d.)** — Kūčių vakarienė be mėsos. "
            "Valgome Kūčiukus su aguonų pienu.\n\n"
            "**Velykos** — Pavasario šventė. Vaikai ridena margučius."
        ),
        "questions": [
            ("Vasario 16-oji yra Lietuvos nepriklausomybės atkūrimo diena.", "b"),
            ("Kovo 11-ąją žmonės eina į miesto aikštę.", "a"),
            ("Liepos 6-oji yra susijusi su Mindaugu.", "a"),
            ("Per Kūčias valgo patiekalus su mėsa.", "b"),
            ("Kūčiukus valgome su aguonų pienu.", "a"),
            ("Per Velykas vaikai ridena margučius.", "a"),
        ],
    },
]


def main():
    with Session(engine) as session:
        # Check if already seeded
        existing = session.exec(
            select(PracticeCategory).where(PracticeCategory.name_en == "Skaitymas")
        ).first()
        if existing:
            print(f"Skaitymas category already exists (id={existing.id}). Skipping.")
            return

        # Create category
        cat = PracticeCategory(
            name_ru="Чтение",
            name_en="Skaitymas",
            sort_order=10,
        )
        session.add(cat)
        session.commit()
        session.refresh(cat)
        print(f"Created category: id={cat.id}")

        total_q = 0
        for lesson in LESSONS:
            test = PracticeTest(
                category_id=cat.id,
                title_ru=lesson["title_ru"],
                title_en=lesson["title_en"],
                lesson_text_lt=lesson["lesson_text_lt"],
                question_count=len(lesson["questions"]),
                pass_threshold=0.7,
                status="published",
                sort_order=lesson["sort_order"],
            )
            session.add(test)
            session.commit()
            session.refresh(test)

            for text, correct in lesson["questions"]:
                q = PracticeQuestion(
                    test_id=test.id,
                    question_lt=text,
                    question_ru=text,
                    option_a="Teisingas",
                    option_b="Neteisingas",
                    option_c="",
                    option_d="",
                    correct_option=correct,
                    is_active=True,
                )
                session.add(q)
                total_q += 1

            session.commit()
            print(f"  Created test: {lesson['title_ru']} ({len(lesson['questions'])} questions)")

        print(f"\nDone! Created 1 category, {len(LESSONS)} tests, {total_q} questions.")


if __name__ == "__main__":
    main()
