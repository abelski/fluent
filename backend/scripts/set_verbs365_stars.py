"""One-off backfill for issue #143: assign difficulty stars to verbs_365 words.

The verb→group mapping was provided by the product owner (2026-07-17):
group 1 = core verbs (star 1), group 2 = extended (star 2),
group 3 = reflexive/rare (star 3). Word.star then drives the existing
star_level study filter and the ★/★★/★★★ selector on /dashboard/lists.

Accent marks in the source lists are stripped before matching because
word.lithuanian stores clean forms.

Safe to re-run. Usage from the backend directory:
    python scripts/set_verbs365_stars.py [--dry-run]
"""

import sys
import unicodedata

sys.path.insert(0, ".")

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import Session, col, select  # noqa: E402
from database import engine  # noqa: E402
from models import Word, WordList, WordListItem  # noqa: E402

GROUP_1 = """
būti, turėti, galėti, norėti, reikėti, duoti, imti, gauti, daryti, eiti, dirbti,
gyventi, gerti, kalbėti, sakyti, baigti, pradėti, grįžti, likti, tapti, rasti,
ieškoti, padėti, suprasti, dėti, laikyti, laukti, leisti, keisti, naudoti,
privalėti, grąžinti, veikti, riñkti, prašyti, klausti, atsakyti, rašyti,
skaityti, skambinti, klausyti, girdėti, matyti, rodyti, siųsti, kviesti,
vadinti, tylėti, kartoti, žadėti, važiuoti, bėgti, nešti, vežti, skristi,
plaũkti, keliauti, kelti, lipti, vairuoti, mesti, kristi, vesti, šokti, liesti,
valgyti, miegoti, pusryčiauti, pietauti, vakarieniauti, pabusti, gulėti,
sėdėti, sėsti, stovėti, pirkti, dėvėti, sirgti, vartoti, spėti, vėluoti,
jaũsti, mylėti, mėgti, patikti, bijoti, pykti, svajoti, tingėti, galvoti,
manyti, mokėti, pamiršti, tikėti, spręsti, atrodyti, bandyti, pažinti, sutikti,
sveikinti, kirpti, lankyti, dėkoti, atleisti, dalyvauti, švęsti, siūlyti,
dovanoti, draugauti, bučiuoti, laimėti, trukdyti, kepti, virti, plauti,
skalbti, valyti, tvarkyti, taisyti, šluoti, jungti, dažyti, šildyti, maitinti,
mokyti, studijuoti, išmokti, planuoti, parduoti, kainuoti, skaičiuoti, statyti,
kurti, žaisti, sportuoti, piešti, dainuoti, siūti, skirti, sapnuoti, sukti,
pilti, pjauti, puošti, šalti, šilti, lyti, snigti, tekėti, pūsti, degti, kasti,
gydyti, sodinti, didėti, mažėti, senti, mirti, gimti, ginti, kąsti, mušti,
stoti, augti, auginti, tikti
"""

GROUP_2 = """
aiškinti, pãsakoti, pranešti, informuoti, šnekėti, šaũkti, tarti, reikšti,
teigti, skelbti, liepti, linkėti, rėkti, meluoti, pristatyti, spausdinti,
vykti, vaikščioti, važinėti, nešioti, judėti, bėgioti, griūti, skubėti,
stabdyti, leñkti, lydėti, užmigti, atostogauti, vilkėti, pavargti, pakuoti,
maudyti, šukuoti, mauti, segti, skusti, rūkyti, kosėti, skaudėti, liūdėti,
nustebti, nervinti, nekęsti, pavydėti, rūpėti, stebėti, pastebėti, nuspręsti,
abejoti, priprasti, vertinti, siekti, supažindinti, reikalauti, vaišinti,
juokauti, raminti, skolinti, auklėti, nugalėti, draũsti, skųsti, kovoti,
teisti, ruošti, šluostyti, rakinti, kabinti, džiauti, džiovinti, tepti,
maišyti, lupti, laistyti, praũsti, dėstyti, registruoti, taupyti, tirti,
vadovauti, saugoti, gaminti, versti, plaukioti, tapyti, groti, vaidinti,
megzti, šviesti, trukti, trūkti, skęsti, plyšti, sekti, tupėti, tilpti,
reñgti, kalti, rišti, tirpti, žaibuoti, gesinti, lūžti, griauti, klijuoti,
kloti, kvėpuoti, sveikti, gimdyti, įžeisti, lyginti, sverti, šauti,
triukšmauti, vogti, žãdinti, džiūti
"""

GROUP_3 = """
keistis, naudotis, riñktis, prasidėti, kalbėtis, klausytis, teirautis,
atsiliepti, pasirašyti, pasiklysti, apsistoti, keltis, gultis, stotis,
ilsėtis, reñgtis, vilktis, ruoštis, praũstis, maudytis, šukuotis, matuotis,
puoštis, aũtis, dažytis, mautis, jaũstis, džiaũgtis, jaudintis, stebėtis,
pyktis, nervintis, juoktis, šypsotis, atsimiñti, laikytis, tikėtis, domėtis,
susitikti, susipažinti, sveikintis, pasitikti, atsiprašyti, rūpintis,
atsisakyti, bučiuotis, skųstis, tuoktis, plautis, mokytis, draũstis, galioti,
nuomoti, skirtis, suktis, sektis, melstis, lauktis, slidinėti, medžioti,
uogauti, jodinėti, joti, čiuožinėti, rungtyniauti, įgalioti, importuoti,
pažeisti, šerti, ūkininkauti, ėsti, laidoti
"""

# Lithuanian letters that must survive normalization (they are NOT stress marks)
_KEEP = set("ąčęėįšųūž")


def clean(word: str) -> str:
    """Strip stress/accent marks but keep proper Lithuanian diacritics."""
    out = []
    for ch in word.strip().lower():
        if ch in _KEEP:
            out.append(ch)
            continue
        decomposed = unicodedata.normalize("NFD", ch)
        out.append("".join(c for c in decomposed if not unicodedata.combining(c)))
    return "".join(out)


def parse(group: str) -> list[str]:
    return [clean(w) for w in group.replace("\n", " ").split(",") if w.strip()]


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    star_by_verb: dict[str, int] = {}
    for star, group in ((1, GROUP_1), (2, GROUP_2), (3, GROUP_3)):
        for verb in parse(group):
            star_by_verb[verb] = star
    print(f"parsed groups: {sum(1 for s in star_by_verb.values() if s == 1)} / "
          f"{sum(1 for s in star_by_verb.values() if s == 2)} / "
          f"{sum(1 for s in star_by_verb.values() if s == 3)} (total {len(star_by_verb)})")

    with Session(engine) as session:
        words = session.exec(
            select(Word)
            .join(WordListItem, col(WordListItem.word_id) == col(Word.id))
            .join(WordList, col(WordList.id) == col(WordListItem.word_list_id))
            .where(WordList.subcategory == "verbs_365")
            .distinct()
        ).all()
        print(f"verbs_365 words in DB: {len(words)}")

        matched = unmatched_db = changed = 0
        seen_verbs: set[str] = set()
        for word in words:
            key = clean(word.lithuanian)
            seen_verbs.add(key)
            star = star_by_verb.get(key)
            if star is None:
                unmatched_db += 1
                print(f"  !! no group for DB word: {word.lithuanian!r}")
                continue
            matched += 1
            if word.star != star:
                changed += 1
                if not dry_run:
                    word.star = star
                    session.add(word)
        missing_in_db = sorted(set(star_by_verb) - seen_verbs)
        for verb in missing_in_db:
            print(f"  !! group verb not found in DB: {verb!r}")

        if not dry_run:
            session.commit()
        print(f"matched: {matched}, updated: {changed}, "
              f"db-words without group: {unmatched_db}, group verbs missing in db: {len(missing_in_db)}"
              + (" [DRY RUN — no writes]" if dry_run else ""))


if __name__ == "__main__":
    main()
