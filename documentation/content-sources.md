# Open content sources for exercises (#62)

Research done 2026-10-08 for idea #62 (`plans/ideas/idea_62_exercise-formats-map-and-gap-check.md`):
where new Practice/Grammar content (sentences, dialogues, texts, notices, images) can legally come
from. Counts are from the sources' own pages on that date.

## Text

| Source | What | Licence | Use for | Notes |
| --- | --- | --- | --- | --- |
| [Tatoeba](https://tatoeba.org/en/stats/sentences_by_language) | 158,713 Lithuanian sentences; ~115.8k have a Russian translation, ~101.4k an English one | CC BY 2.0 FR (some CC0) | Grammar sentences (#62f–#62h) with ready RU/EN translations; dialogue lines (#62c); statements (#62b) | Attribution: say the sentences are from Tatoeba, link https://tatoeba.org, name the licence; best practice is to keep each sentence's id (`source: tatoeba:<id>`) in the seed JSON. Quality varies: filter to A2, check grammar, prefer native-owned sentences. No ShareAlike, so our edited content can stay under our terms. |
| Mozilla Common Voice text corpus (Lithuanian) | ~134k sentences (~129k validated), per the dataset listing | CC0 (public domain) | Raw sentences for grammar topics | No attribution needed. Mostly Wikipedia-style, formal, no translations — we add RU/EN. Dataset page moved to mozilladatacollective.com. |
| [Wikivoyage Lithuanian phrasebook](https://en.wikivoyage.org/wiki/Lithuanian_phrasebook) | ~350 travel phrases by situation (shopping, eating, transport, lodging, problems) | CC BY-SA | Checklist of situations and phrasing for dialogues | ShareAlike: don't copy the compiled list into our content; single common phrases aren't copyrightable. |
| NŠA exam samples (nsa.smm.lt, beta.etestavimas.lt) | Official state-language exam task samples | Not openly licensed | **Format reference only** (task types, length, level) | Lithuanian Copyright Law art. 5 excludes only legal/administrative/normative official documents — exam tasks are not that, so never copy their texts. |

## Images (signs and notices, #62e)

| Source | What | Licence | Notes |
| --- | --- | --- | --- |
| [Commons: SVG road signs in Lithuania](https://commons.wikimedia.org/wiki/Category:SVG_road_signs_in_Lithuania) | Official road-sign designs | Public domain (official normative designs, copyright law art. 5) | Usable as-is; few carry Lithuanian text (plates, parking, pedestrian). |
| [Commons: Street signs in Vilnius](https://commons.wikimedia.org/wiki/Category:Street_signs_in_Vilnius) and related categories | ~30 photos | Mostly CC BY-SA | Needs a visible credit per image; no good category of shop-hour notices was found. |
| Unsplash / Pexels | Free-licence photos | Unsplash/Pexels licence (no attribution required) | Almost no Lithuanian-text signs found (one "no swimming" sign) — not a reliable source. |
| Own SVG mock-ups | Drawn for Fluent | Ours | No licence or privacy issue; matches the exam booklet, which prints notices as boxed texts. |
| User's own photos | Real Vilnius notices | Ours | Most realistic; blur faces and licence plates. |

Realism data (facts, not content to copy): OpenStreetMap opening hours (ODbL — credit
"© OpenStreetMap contributors" if a dataset extract is used) and the official Vilnius public-transport
GTFS feed (`stops.lt`, licence not stated — use only as a reference for plausible timetables).

## Decision (2026-10-08, user: "Tatoeba + real photos")

- **Sentences and dialogue lines** (#62c, #62f–#62h): start from Tatoeba (translations included) and
  Common Voice; adapt to A2; the user reviews. Work from the per-language exports at
  https://downloads.tatoeba.org/exports/ kept in `temp_files/` (not in git); only the chosen,
  edited items go into the seed JSON, each with `"source": "tatoeba:<id>" | "commonvoice" | "own"`.
- **Credit**: a short «Источники» / "Sources" section at the end of the `about-team` article (RU + EN):
  "Example sentences: Tatoeba (tatoeba.org), CC BY 2.0 FR; Mozilla Common Voice (CC0)." Added by the
  first plan that ships such content; appended at the end so the meta description is untouched.
- **Signs and notices** (#62e): real photos — the user's own first; Wikimedia Commons CC BY / BY-SA
  photos where needed, each with a credit line under the photo (`image_credit`) and a row in
  `frontend/public/img/signs/CREDITS.md`; public-domain official road signs (SVG) for traffic items.
- **Texts** for True/False/Not stated (#62b) and gap texts (#62d): written for Fluent.
- **NŠA exam samples**: format reference only.
