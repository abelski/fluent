"""Seed script: creates the Skaitymas reading practice program.

Run from the backend/ directory:
    python scripts/seed_skaitymas.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from models import PracticeCategory, PracticeTest, PracticeQuestion
from sqlmodel import Session, select

LESSONS = [
    {
        "title_ru": "Урок 2 — «Это мой друг»",
        "title_en": """2 skyrius — „Čia mano draugas'",
        "sort_order": 1,
        "lesson_text_lt": """\
*Lina ir Tomas apie Maiklą:*

— Tomai, ar Maiklas yra tavo draugas?
— Taip, Lina, Maiklas yra mano draugas.
— Ar jis kalba lietuviškai?
— Ne, Maiklas nekalba lietuviškai.
— Kaip jūs, tu ir Maiklas, kalbate? Angliškai?
— Taip. O tu, Lina, kalbi angliškai?
— Taip, aš kalbu angliškai ir ispaniškai. Ar Maiklas supranta ispaniškai?
— Taip, jis labai gerai kalba ispaniškai.
— O tu, Tomai?
— Aš nekalbu ispaniškai.
""",
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
        "title_en": """3 skyrius — „Koks tavo adresas?'",
        "sort_order": 2,
        "lesson_text_lt": """\
*Rita, Viktoras, Pjeras:*

— Labas, Viktorai!
— Labas, Rita! Kaip sekasi?
— Ačiū, gerai. O tau?
— Taip pat gerai. Čia Pjeras. Iš Prancūzijos.
— Malonu. Rita.
— Malonu.
— Ar jūs esate iš Paryžiaus?
— Ne. Iš Lilio.
— Jūs kalbate lietuviškai!
— Truputį kalbu. Ar jūs kalbate prancūziškai?
— Aš nekalbu prancūziškai, bet truputį suprantu. Ar jūs studijuojate Lietuvoje?
— Taip, studijuoju Lietuvoje, Vilniuje. Ar jūs taip pat studijuojate Vilniuje?
— Ne. Aš studijuoju Anglijoje, Londone.
— Aš taip pat.
""",
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
        "title_en": """4 skyrius — „Kada ir kur susitinkame?'",
        "sort_order": 3,
        "lesson_text_lt": """\
*Karolina ir Adomas (SMS žinutės):*

**[žinutė 1]** Sveika, Karolina. Einame šiandien vakare į kiną. Filmas 19.00 val. Susitinkame kavinėje prie kino teatro „Vilnis" 18.00. Gerai?

**[žinutė 2]** Sveikas, Adomai! Einame! Tik ne šiandien, o rytoj, penktadienį. Ketvirtadienį vakare visada einu į sporto klubą.

**[žinutė 3]** Tai sutarta, Karolina. Susitinkame penktadienį prie kino teatro 18.00. Iki!

**[žinutė 4]** Sutarta, Adomai! Iki!
""",
        "questions": [
            ("Karolina ir Adomas eina į kiną.", "a"),
            ("Karolina ir Adomas susitinka prie sporto klubo.", "b"),
            ("Į kiną jie eina penktadienį.", "a"),
            ("Filmas 18.00 valandą.", "b"),
        ],
    },
    {
        "title_ru": "Урок 5 — «Это моя семья»",
        "title_en": """5 skyrius — „Čia mano šeima'",
        "sort_order": 4,
        "lesson_text_lt": """\
**Mano šeima**

Mano vardas yra Rūta. Mano šeima gyvena prie Vilniaus. Mūsų namas yra prie upės. Netoli yra miškas. Aš ir mano vyras Petras dažnai vaikščiojame miške. Kasdien vakare mano vyras dirba sode, o aš žiūriu televizorių.

Paulius ir Saulius yra mūsų sūnūs. Jie jau eina į mokyklą. Berniukai labai mėgsta sportą. Antradienį ir ketvirtadienį jie žaidžia futbolą, o šeštadienį visi kartu važiuojame į baseiną.

Mano tėvai gyvena Utenoje. Savaitgalį dažnai važiuoju pas tėvus. Kartais mes kartu einame į kavinę arba vaikščiojame parke.

Aš dirbu Vilniuje, muzikos mokykloje. Mano vyras yra ekonomistas. Jis dirba Kaune. Petras kasdien rytą važiuoja į darbą, o vakare – namo.
""",
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
        "title_en": """6 skyrius — „Lino ir Kristinos šeima'",
        "sort_order": 5,
        "lesson_text_lt": """\
**Lino ir Kristinos šeima**

Mano vardas yra Linas. Mano žmonos vardas yra Kristina. Mes turime dukterį. Jos vardas – Milda. Ji yra dar maža. Milda eina į vaikų darželį. Mes turime ir sūnų. Jo vardas Mantas. Mūsų sūnus jau didelis berniukas. Jis eina į mokyklą. Vaikai turi du senelius ir dvi seneles. Seneliai gyvena netoli. Mes dažnai susitinkame.
""",
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
        "title_en": """7 skyrius — „Ką mes valgome'",
        "sort_order": 6,
        "lesson_text_lt": """\
Kasdien rytą aš valgau košę ir geriu juodą kavą. Labai mėgstu juodą kavą! Mano vyras nemėgsta kavos. Jis geria juodą arbatą.

Rytą mano vyras, kaip ir aš, visada valgo košę, bet vaikai košės nemėgsta. Sūnus visada valgo sumuštinį ir geria arbatą, duktė valgo tik bandelę ir geria pieną. Aš ir mano vyras darbo dieną pietaujame kavinėje. Vaikai valgo pietus mokyklos valgykloje. Pietūs mokyklos valgykloje labai skanūs!

Šeštadienį rytą neskubame nei į darbą, nei į mokyklą – namie valgome blynus ir geriame kakavą. Aš labai mėgstu kakavą šeštadienio rytą. Savaitgalį kartais pietaujame kavinėje arba važiuojame pas mano arba vyro tėvus. Senelių pietūs visada labai skanūs. Močiutės Agnės – vyro mamos – pyragas yra fantastiškas! Mano mamos – močiutės Viktorijos – bandelės yra skaniausios pasaulyje!

Kartais sekmadienį važiuojame į mišką. Miške žaidžiame, vaikščiojame, valgome pyragą ir geriame arbatą iš termoso.
""",
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
        'title_en': '8 skyrius — Turguje',
        "sort_order": 7,
        "lesson_text_lt": """\
*Pokalbis: pardavėjas ir pirkėja*

**Pardavėjas:** Labas rytas, ponia!
**Pirkėja:** Labas rytas!
**Pardavėjas:** Ko norėtumėte?
**Pirkėja:** Prašom duoti pomidorų.
**Pardavėjas:** Raudonų ar geltonų?
**Pirkėja:** Prašom kilogramą raudonų.
**Pardavėjas:** Dar ko nors?
**Pirkėja:** Taip. Prašom duoti du kilogramus bulvių.
**Pardavėjas:** Prašom. Gal norite braškių?
**Pirkėja:** Ar braškės saldžios?
**Pardavėjas:** Taip! Prašom paragauti!
**Pirkėja:** Mmm... Saldžios. Labai skanios! Prašom duoti kilogramą.
**Pardavėjas:** Prašom. Ar viskas?
**Pirkėja:** Taip. Ačiū. Viskas.
**Pardavėjas:** Aštuoni eurai penkiasdešimt centų.
**Pirkėja:** Prašom. Labai jums ačiū!
**Pardavėjas:** Ačiū jums! Viso gero!
**Pirkėja:** Viso gero!
""",
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
        'title_en': '10 skyrius — Žinutės',
        "sort_order": 8,
        "lesson_text_lt": """\
*SMS pokalbis — Rūta ir Marija:*

**Rūta → Marija:** Labas, Marija, kaip gyveni? Gal nori atvažiuoti pas mus į svečius? Vakar mama iškepė labai skanų medaus tortą – ji visada kepa tortą, kai dėdė atveža daug medaus iš kaimo.

**Marija → Rūta:** Labas, Rūta, gyvenu gerai, ačiū! Šeštadienį turiu laiko, galiu pas jus nuvažiuoti. Tik pamiršau, kaip pas jus reikia važiuoti... Gal gali parašyti?

**Rūta → Marija:** Kaip gerai, kad atvažiuosi! Pas mus atvažiuoti labai nesunku. Gali važiuoti iš stoties 8 trolebusu arba 34 autobusu iš centro. Išlipti reikia *Miško* stotelėje. Netoli stotelės yra maisto parduotuvė. Prie parduotuvės yra mano namas. Namo numeris – 13. Butas – 24. Labai tavęs lauksiu!

**Marija → Rūta:** Atrodo nesunku! Ačiū. Iki pasimatymo!
""",
        "questions": [
            ("Rūta kviečia Mariją į svečius.", "a"),
            ("Rūtos mama pirks tortą su medumi.", "b"),
            ("Marija atvažiuos šeštadienį.", "a"),
            ("Pas Rūtą galima nuvažiuoti autobusu.", "a"),
            ("Rūta gyvena prie parduotuvės.", "a"),
            ("Rūtos namo numeris yra 24.", "b"),
        ],
    },
    {
        "title_ru": "Урок 11 — Аренда автомобилей",
        "title_en": """11 skyrius — „Automobilių nuoma'",
        "sort_order": 9,
        "lesson_text_lt": """\
**Automobilių nuoma**

Suplanavote kelionę, bet neturite automobilio? Mes jums padėsime! Trumpalaikė ir ilgalaikė automobilių nuoma.

**Kodėl geriausia automobilį išsinuomoti pas mus?**

- Visada maža kaina.
- Galima išsinuomoti telefonu arba internetu.
- Nedidelis rezervacijos mokestis.
- Nauji automobiliai.
- Galima išsinuomoti automobilį su vairuotoju arba be vairuotojo.
- Nuomos punktai yra Vilniuje, Kaune, Klaipėdoje, Palangoje.
- Nuomos punktai dirba visą parą.

*Daugiau informacijos – www.nuomok.lt arba telefonu 268 1515.*
""",
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
        "title_ru": "Урок 12 — Аренда квартир",
        'title_en': '12 skyrius — Buto nuoma: skelbimai',
        "sort_order": 10,
        "lesson_text_lt": """\
**Nuomojami butai:**

| Nr. | Skelbimas |
|-----|-----------|
| 1 | Nuomojamas vieno kambario butas centre, netoli universiteto. Tel. 86880299 |
| 2 | Nuomojamas 2 kambarių butas prie geležinkelio stoties. Labai šiltas, nedideli mokesčiai. Tel. +3706541474 |
| 3 | Nuomojamas 3 kambarių butas naujame rajone. Netoli mokykla, autobusų stotelė, parkas. Butas su baldais ir buitine technika. Tel. 86887967 |
| 4 | Nuomojamas 86 m² butas senamiestyje. Visi baldai ir buitinė technika. Šalia kavinės, restoranai, turgus. Yra vieta automobiliui. Kaina – 900 Eur su mokesčiais. Tel. +3706753873 |

**Ieško buto:**

- **A.** Jauna šeima išsinuomotų trijų ar keturių kambarių namą arba butą. Su baldais. Ne miesto centre. Tel. 85863314
- **B.** Dvi studentės ieško kambario arba mažo buto. Geriau būtų prie universiteto. Tel. 86880280
- **C.** Ieškau buto miesto centre. Su baldais ir vieta mašinai. Galiu mokėti iki 1000 eurų per mėnesį. Tel. 86882323
""",
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
        "title_ru": "Урок 13 — «Домашние дела»",
        "title_en": """13 skyrius — „Darbai namie'",
        "sort_order": 11,
        "lesson_text_lt": """\
Mano vardas yra Inga. Aš esu dėstytoja, dirbu universitete. Man patinka mano darbas, bet būti namie su šeima taip pat labai malonu. Mano šeima didelė: aš, mano vyras Saulius ir vaikai. Turiu du sūnus ir vieną dukterį. Dar mes turime šunį ir katiną. Mums reikia namo, todėl gyvename už miesto. Netoli mūsų namų yra miškas, upė. Aš dažnai einu pasivaikščioti į mišką. Man patinka, kad ten labai tylu.

Mūsų namas didelis. Pirmame aukšte yra svetainė, didelė virtuvė, koridorius. Antrame aukšte – trys miegamieji su balkonais, vonia.

Dažnai tvarkome virtuvę – kai valgo maži vaikai ir yra naminių gyvūnų, virtuvė visada nešvari. Man taip pat nepatinka darbai namie. Bet reikia valyti dulkes, siurbti kambarius, plauti grindis. Gerai, kad kartu dirba visa šeima. Vyriausias sūnus Benas su tėčiu visada išplauna indus, nuvalo stalą. Dukrytė Karolina išneša šiukšles. Jauniausias sūnus Mykolas padeda tvarkyti vonią.

Kai dirbame kartu, namus sutvarkome greitai. Tada visi esame laimingi!
""",
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
        "title_en": """14 skyrius — „Mano kelionės ir spinta'",
        "sort_order": 12,
        "lesson_text_lt": """\
Mano vardas Vytautė. Aš esu studentė. Aš labai mėgstu keliauti. Kai galiu, visada kur nors važiuoju. Dažnai keliauju viena, bet kartais į kelionę važiuoju kartu su draugais.

Kai esu naujoje šalyje, visada noriu nueiti į turgų ar nedidelę parduotuvę ką nors nusipirkti. Mėgstu pirkti puodelius ir namie iš jų gerti arbatą. Bet labiausiai man patinka pirkti drabužius. Savo bute turiu didelę spintą. Mano spintoje yra daug drabužių ir batų iš viso pasaulio!

Kai buvau maža, su tėvais automobiliu važiavome į Taliną. Ten tėvai man nupirko gražią raudoną suknelę. Ši suknelė man labai tiko!

Aną vasarą su draugais keliavome į Prahą. Prahos senamiesčio parduotuvėje nusipirkau basutes.

Kai buvau Niujorke, nusipirkau puikų megztinį. Minkštas, šiltas ir patogus. Šį megztinį apsirengiu, kai einu į universitetą.

Paskutinė mano kelionė buvo į Londoną. Oksfordo gatvėje ieškojau vilnonio palto. Nusipirkau gražų žalią paltą su nuolaida. Kai šalta, visada šį paltą dėviu.
""",
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
        'title_en': '15 skyrius — Paslaugų skelbimai',
        "sort_order": 13,
        "lesson_text_lt": """\
| | Skelbimas |
|-|-----------|
| **A** | **Patalynės siuvimas pagal užsakymus** — Teikiame patalynės siuvimo paslaugas pagal individualius užsakymus. |
| **B** | **Drabužių valykla ŠVARA** — Išvalysime net ir labai nešvarius drabužius! Valome senas kavos, vyno, šokolado dėmes. Paėmimo punktai visame mieste! |
| **C** | **Avalynės taisykla Batukas** — Taisome avalynę. Taip pat taisome odinius gaminius: rankines, pinigines, diržus. |
| **D** | **Siuvykla „Senamiesčio siuvėjas"** — Norite visada būti madingas? Mes galime Jums padėti! Vyriškų, moteriškų, vaikiškų rūbų siuvimas. |
| **E** | **„Miesto laikas"** — Vyriški, moteriški, vaikiški laikrodžiai. Parduodame ir taisome laikrodžius. Visada gera kaina! |
| **F** | **Drabužių taisymas** — Greitai ir kokybiškai taisome drabužius. |
""",
        "questions": [
            ("„Švara" valo drabužius.", "a"),
            ("„Batukas" taiso laikrodžius.", "b"),
            ("„Senamiesčio siuvėjas" siuva tik moteriškus rūbus.", "b"),
            ("„Miesto laikas" parduoda ir taiso laikrodžius.", "a"),
            ("Skelbimas A yra apie drabužių valymą.", "b"),
            ("Sugedo piniginė — reikia eiti į C skelbimą.", "a"),
        ],
    },
    {
        "title_ru": "Урок 16 — «Если простудились, помогут природные лекарства»",
        "title_en": """16 skyrius — „Jeigu peršalote, jums padės vaistai iš gamtos'",
        "sort_order": 14,
        "lesson_text_lt": """\
Rudenį ir pavasarį mano šeima dažnai peršąla. Man skauda gerklę, silpna, nieko nenoriu daryti. Vaikai kosėja, kartais turi temperatūros. Mes labai norime greičiau pasveikti, bet į vaistinę pirkti vaistų neskubame.

Kai sergame, geriame daug arbatos. Mano vyras geria žolelių arbatą. Vaikai mėgsta arbatą su medumi. O aš geriu arbatą su citrina, imbieru ir medumi. Kai skauda gerklę, medaus į arbatą nededu: kai išgeriu arbatą, suvalgau šaukštelį medaus.

Jeigu temperatūra neaukšta, 37–38 laipsniai, vaistų nuo temperatūros mes negeriame. Geriame aviečių arbatą. Avietės ir citrinos turi daug vitamino C, jis padeda greičiau pasveikti.

Visą rudenį ir žiemą mes valgome česnaką, nes norime būti sveiki ir nesirgti gripu. Česnakas yra natūralus antibiotikas.

Jeigu jūs sergame jau keletą dienų ir natūralūs vaistai nepadeda, eikite pas šeimos gydytoją.
""",
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
        "title_ru": "Урок 17 — Инструкция по применению лекарства",
        "title_en": """17 skyrius — „Vaistų nuo skausmo informacinis lapelis'",
        "sort_order": 15,
        "lesson_text_lt": """\
**Nereceptiniai vaistai nuo skausmo.**

Šie vaistai yra suaugusiesiems ir vaikams nuo 12 metų.
Gerkite šiuos vaistus, jeigu jums skauda galvą, dantį arba karščiuojate.

**Kaip gerti vaistus?**

Vaistus nuo skausmo reikia gerti, kai valgote arba po valgio su stikline vandens.
Rekomenduojama dozė: 3 tabletės per 24 valandas.
Negalima gerti daugiau negu tris tabletes.

**Būkite atsargūs!**

Negalima gerti šių vaistų, jeigu esate alergiškas pieno produktams (laktozei).
Atsargiai gerkite šiuos vaistus, jeigu jūs esate senas ir sergat širdies ligomis.
Jeigu geriate vaistus nuo skausmo, atsargiai vairuokite automobilį.
Jeigu po trijų dienų jūs jaučiatės taip pat arba jums skauda dar labiau, eikite pas gydytoją.
Vaistus reikia laikyti ne aukštesnėje negu 25 °C temperatūroje.
""",
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
        'title_en': '18 skyrius — Darbo skelbimai',
        "sort_order": 16,
        "lesson_text_lt": """\
**Ieško darbo:**

| Nr. | Aprašymas |
|-----|-----------|
| 1 | Dirbu drabužių parduotuvėje senamiestyje, bet norėčiau dirbti prie namų. Laisvalaikiu mėgstu bėgioti parke ir žaisti tenisą. |
| 2 | Studentė ieško darbo. Gali dirbti po pietų ir savaitgalį. Norėtų dirbti centre arba netoli centro. |
| 3 | Moku dirbti kompiuteriu, puikiai kalbu angliškai ir vokiškai. Anksčiau dirbau su dokumentais. Esu greita, draugiška, linksma. |
| 4 | Norėčiau dirbti ligoninėje arba poliklinikoje. Baigiau slaugytojų kursus, noriu studijuoti mediciną. |
| 5 | Dabar studijuoju Kaune. Norėčiau dirbti ne visą darbo dieną. Turiu vairuotojo pažymėjimą ir automobilį. |

**Siūlo darbą:**

- **A.** Kavinė „Svajonė" siūlo darbą padavėjui / padavėjai. Darbas tris dienas per savaitę nuo trečios iki dešimtos valandos vakaro. Kavinė yra centre.
- **B.** Įmonei reikia vairuotojo / vairuotojos. Darbas Kauno rajone nuo šeštos iki antros valandos. Gali būti studentas / studentė.
- **C.** Ieškome pardavėjo / pardavėjos sporto prekių parduotuvėje. Jeigu jūs mėgstate sportuoti, ateikite dirbti pas mus! Mes esame toliau nuo centro, prie Skaistės parko.
- **D.** Siūlome darbą biuro administratoriui / administratorei. Darbas nuo aštuntos iki penktos valandos su pietų pertrauka.
- **E.** Miesto poliklinika siūlo darbą registratūroje slaugytojui / slaugytojai. Pacientų registravimas, medicininių dokumentų tvarkymas.
""",
        "questions": [
            ("Kavinė „Svajonė" ieško padavėjo.", "a"),
            ("1-asis ieško darbo biure.", "b"),
            ("4-asis ieško darbo ligoninėje.", "a"),
            ("Skelbimas B siūlo darbą tik studentams.", "b"),
            ("3-iasis moka angliškai ir vokiškai.", "a"),
            ("5-asis turi vairuotojo pažymėjimą.", "a"),
        ],
    },
    {
        "title_ru": "Урок 19 — «Мой брат — студент»",
        "title_en": """19 skyrius — „Mano brolis studentas'",
        "sort_order": 17,
        "lesson_text_lt": """\
Sveiki, aš Jonas. Aš mokausi mokykloje. O mano vyresnis brolis Matas jau studentas, jis studijuoja Vilniaus universitete istoriją. Dabar jau trečiame kurse.

Brolio geriausias draugas Andrius taip pat studentas, studijuoja Muzikos ir teatro akademijoje, antrame kurse. Andrius visada norėjo būti aktorius, o mano brolis norėjo būti ir aktorius, ir muzikantas, ir žurnalistas. Bet vėliau broliui buvo įdomu tik istorija.

Brolio draugė Eglė studijuoja prancūzų filologiją. Jai patinka kalbos, ji moka ne tik prancūzų, bet ir anglų, italų ir ispanų kalbas. Kai ji ateina į svečius, kalba su manimi prancūziškai!

Birželio mėnesį Matas laikys tris egzaminus. Dabar jis sėdi bibliotekoje ir mokosi. Mato pažymiai devintukai ir dešimtukai! Kai išlaikys egzaminus, Matas su Egle ir Andriumi išsinuomos automobilį ir važiuos prie jūros. O aš per atostogas važiuosiu į kaimą, pas močiutę.
""",
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
        "title_ru": "Урок 20 — Кино и семейный отдых",
        'title_en': '20 skyrius — Kinas ir šeimos laisvalaikis',
        "sort_order": 18,
        "lesson_text_lt": """\
Aš esu Kristina. Turiu vyrą, du sūnus ir dukterį. Mūsų šeima yra labai draugiška. Mums patinka būti kartu. Kai šilta, savaitgalį mes paprastai sportuojame: aš bėgioju, vyras su sūnumis žaidžia futbolą, duktė mėgsta važinėti dviračiu. Rudenį ir žiemą mes su vyru einame į operą arba baletą, vaikai eina į kiną. Kartais savaitgalį niekur neiname, esame namie. Tada klausomės muzikos, duktė groja pianinu, vyras su sūnumis žaidžia šachmatais.

Visada labai laukiame atostogų. Žiemą, gruodžio mėnesį, savaitę atostogavome kalnuose. Vyras labai mėgsta slidinėti, o aš ne. Bet per atostogas pirmą kartą slidinėjau! Truputį bijojau, bet po dviejų dienų slidinėjau kartu su visais.

Vasarą mes mėgstame keliauti. Šią vasarą važiuosime į Italiją, į Sorentą. Skrisime lėktuvu, nes važiuoti automobiliu per ilga kelionė. Gyvensime viešbutyje prie jūros.

Mūsų seneliai gyvena kaime, sodyboje prie miško. Per atostogas visada važiuojame pas senelius. Mano sūnus su seneliu žvejoja ežere, o dukra su močiute labai mėgsta grybauti. Rytą jos išeina į mišką, o vakare jau verdame grybus su bulvėmis.
""",
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
        'title_en': '21 skyrius — Atvirukai ir lietuviškos šventės',
        "sort_order": 19,
        "lesson_text_lt": """\
*Kevinas ir Inga kalbasi apie lietuviškas šventes:*

**Kevinas:** Inga, kodėl šiandien ant jūsų namo yra vėliava?

**Inga:** Šiandien, Kevinai, yra Vasario šešiolikta – Lietuvos valstybės atkūrimo diena. Džiaugiamės, kad Lietuva yra laisva respublika. Vėliavos yra ant namų ir dar vieną dieną – Kovo vienuoliktą.

**Kevinas:** O ką švenčiate Kovo vienuoliktą?

**Inga:** Kovo vienuoliktą yra Lietuvos nepriklausomybės atkūrimo diena. Tą dieną einame į miesto aikštę paklausyti prezidento sveikinimo kalbos, vakare – į koncertą.

**Kevinas:** Aš girdėjau, kad vasarą yra viena šventė, kai visi žmonės vakare, devintą valandą gieda Lietuvos himną.

**Inga:** Taip, mes švenčiame ir Liepos šeštą – Lietuvos valstybės dieną. Seniai, 1253 metais, liepos šeštą dieną didysis kunigaikštis Mindaugas tapo Lietuvos karaliumi.

**Inga (apie Kalėdas):** Prieš Kalėdas mums labai svarbi yra Kūčios. Tą vakarą susitinkame visa šeima ir valgome Kūčių vakarienę. Visi patiekalai yra be mėsos, be pieno, be kiaušinių. Visada kepame kūčiukus.

**Kevinas:** Žinau, aš ragavau kūčiukų, tokie maži skanūs sausainiukai su aguonomis!

**Inga:** Taip, juos valgome su aguonų pienu. O Kalėdų rytą vaikai bėga prie eglutės ieškoti Kalėdų senelio dovanų.

**Inga (apie Velykas):** O ar žinai, Kevinai, kad prieš Velykas mes dažome kiaušinius? Ant Velykų stalo dedame spalvingus margučius, juos valgome ir linkime sveikatos. Vaikai ridena margučius, žaidžia su jais.
""",
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
            print(f"Category 'Skaitymas' already exists (id={existing.id}). Skipping.")
            return

        # Create category
        category = PracticeCategory(
            name_ru="Чтение",
            name_en="Skaitymas",
            description_ru="Тексты для чтения и понимания из учебников «Sėkmės!» 1 и 2. Каждый урок: текст → тест на понимание.",
            sort_order=10,
        )
        session.add(category)
        session.commit()
        session.refresh(category)
        print(f"Created category id={category.id}")

        for lesson in LESSONS:
            test = PracticeTest(
                category_id=category.id,
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

            for idx, (statement, correct) in enumerate(lesson["questions"]):
                q = PracticeQuestion(
                    test_id=test.id,
                    question_lt=statement,
                    question_ru=statement,
                    option_a="Teisingas",
                    option_b="Neteisingas",
                    option_c="",
                    option_d="",
                    correct_option=correct,
                    is_active=True,
                    sort_order=idx,
                )
                session.add(q)
            session.commit()
            print(f"  Created test '{lesson['title_en']}' with {len(lesson['questions'])} questions")

        print(f"\nDone! Created 1 category + {len(LESSONS)} tests.")


if __name__ == "__main__":
    main()
