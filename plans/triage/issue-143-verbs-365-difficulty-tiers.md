# Issue #143 — /programs/verbs_365/

**Reported:** 2026-07-16 14:36:43
**Status:** open
**Description:** в этой программе инфинитивы нужно выделить в сложность 1 сложность 2 будущее и прошлое время и все остальные формы в сложность 3
(Translation: "in this program, infinitives should be difficulty 1, difficulty 2 should be future and past tense, and all other forms should be difficulty 3")

**Note: this is a content/feature request, not a pure bug** — see judgment calls below that need your confirmation before implementation.

## Root cause / current behavior

`/programs/verbs_365/` (`frontend/app/programs/[key]/page.tsx`) is a browse/enroll
page — it lists the themed word lists under the `verbs_365` subcategory with no
quiz or difficulty selector. Actual studying happens later from `/dashboard/lists`
via `GET /api/lists/{id}/study` in `backend/routers/words.py`.

Tracing how `verbs_365` content was seeded
(`backend/scripts/seed_verbs_vocabulary.py`, superseded by
`backend/scripts/reseed_verbs_by_theme.py`): for every row in the rich `Verb`
table (which stores `infinitive`, `past_3p`, and a `conjugations` JSON blob with
present/past/future/conditional/imperative forms), only **one** `Word` row is
ever created — the bare infinitive at `star=1`. None of `past_3p`,
`conjugations`, `non_conjugated`, `prefix_forms`, or `case_governance` are ever
surfaced to the vocabulary quiz. That richer data is only used by a separate,
unrelated grammar program ("Спряжение глаголов", via `grammar_service.py`).

**The difficulty mechanism the request wants already exists and is designed for
exactly this.** `Word.star: int` (default 1, documented as `1=base form,
2=inflected/multi-form, 3=phrase`) is already wired end-to-end: `GET
/api/lists/{id}/study?star_level=1|2|3` filters by it, `/api/lists` computes
per-list star counts, and the frontend's global difficulty selector
(`frontend/lib/starLevel.ts`) already has a star2 label reading **"Несколько
форм (глаголы, склонения)"** ("Multiple forms (verbs, declensions)") — i.e. this
slot was always meant for verb forms, it was just never populated.

**Tense-key mapping** (confirmed from `extract_verbs_pdf.py` /
`grammar_service.py`): `Verb.conjugations` keys are `indicative_present,
indicative_past_simple, indicative_past_habitual, indicative_future,
conditional, imperative`, each keyed by person. Future tense =
`conjugations["indicative_future"]["jis, ji, jie, jos"]` (3rd person) — the only
place it lives. Past tense the request wants is already a dedicated field,
`Verb.past_3p`.

## Design

**No new column/table/endpoint needed.** Reuse `Word.star` + the existing
`star_level` study filter. The fix is a **content backfill**: for each verb
already seeded into `verbs_365`, add new `Word` + `WordListItem` rows in the
same themed `WordList` — `star=2` for past/future 3rd-person forms, `star=3` for
a defined subset of remaining forms — leaving the existing infinitive row
untouched at `star=1`. Because this is purely additive data, **zero changes**
are needed to `words.py`'s study/filter/progress logic or any frontend
study-flow component — the star1/2/3 selector already surfaces new rows
automatically.

## ⚠️ Judgment calls — need your confirmation before implementing

1. **Scope of tier 3 ("all other forms") is ambiguous.** Read literally it would
   include every remaining person × tense (present other persons, past-habitual,
   conditional, imperative) *plus* participles (`non_conjugated`) *plus* derived
   prefixed verbs (`prefix_forms`) *plus* case-governance example sentences
   (`case_governance`) — potentially dozens of extra flashcards per verb × 365
   verbs. The last two are structurally different content (full sentences /
   case-question exercises) that don't fit a simple LT→RU flashcard and are
   already covered by the separate grammar programs. **Recommendation:** bound
   tier 3 to present-other-persons + conditional 3rd person + imperative 2nd
   person + participles, and exclude `prefix_forms`/`case_governance` from this
   vocabulary program.
2. **Real correctness risk: reused translations would break the "type it" quiz
   stage.** In `QuizSession.tsx` (`handleStage3Submit`), any other word in the
   same session sharing the same `translation_ru` is accepted as an equally
   valid typed answer (session-synonym tolerance). If infinitive/past/future
   forms of a verb kept the *same* Russian translation, a session at
   star_level 2/3 could contain both `kalbėti` and `kalbėjo`, and typing either
   would be accepted for both — defeating the whole point of tiering by tense.
   **Each new form needs its own grammatically distinct Russian translation**
   (e.g. "говорить" vs. "говорил" vs. "будет говорить") — non-trivial
   content-authoring cost (365 verbs × 2+ forms), likely needing LLM-assisted
   generation with spot-checking rather than a mechanical transform.
3. **`hint` field reuse** for tense labels (e.g. "прошедшее время") is
   consistent with the existing convention (`hint="глагол"` today) but means
   EN-locale users will still see Russian hints — a pre-existing minor gap, not
   introduced by this fix.

## Fix plan (pending confirmation of the above)

1. Confirm with user: exact tier-3 form list, and translation-generation
   approach (recommend against reusing the base translation, per judgment call 2).
2. Write `backend/scripts/seed_verb_forms.py` (new one-off backfill, modeled on
   `reseed_verbs_by_theme.py`'s idempotent pattern): for each themed `Verb`,
   locate its existing infinitive `Word`/`WordListItem`, then insert
   `Word(lithuanian=verb.past_3p, translation_ru=<curated>, hint="прошедшее время", star=2)`
   and the future-tense form similarly at `star=2`, plus the agreed tier-3 forms
   at `star=3` — each as a new `Word` + `WordListItem` in the same `WordList`.
   Support `--dry-run`/`--reset` flags per repo convention; skip forms already
   present so it's safely re-runnable.
3. No backend router or frontend study-flow changes required.
4. Optional: add a short explanatory line to `/programs/[key]/page.tsx` for
   `verbs_365` (e.g. "★ инфинитив · ★★ прошедшее/будущее · ★★★ остальные формы"),
   since that page currently never mentions difficulty tiers.
5. Verify: reload `verbs_365` lists, confirm `star_counts` in `/api/lists`
   reflects the new 1/2/3 breakdown, and manually run star levels 1→2→3 in
   `/dashboard/lists/[id]/study` confirming correct forms appear at each tier
   and the "type it" stage does not cross-accept a wrong-tense form as correct.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (study session at star_level=2 shows past/future forms; star_level=3 shows the agreed additional forms; typed-answer stage does not cross-accept forms across tenses).
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #143 — в этой программе инфинитивы нужно выделить в сложность 1 сложность 2 будущее и прошлое время и все остальные формы в сложность 3. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 143;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-143-verbs-365-difficulty-tiers.md` → `plans/triage/implemented/IMPLEMENTED-issue-143-verbs-365-difficulty-tiers.md`).
