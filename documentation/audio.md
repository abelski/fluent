# Word audio — local prototype (#38)

> **Prototype only.** Lives on branch `proto/word-audio`, not merged, not deployed. See
> `plans/improvements/implemented/IMPLEMENTED-plan_38_word-audio-prototype.md` for the full plan and checklist.

## Decisions

**Voice: ElevenLabs, premade voice "Jessica" (`cgSgspJ2msm6clMCkdW9`), model `eleven_v3`.**
The user tried the default `eleven_v3` Lithuanian sample on elevenlabs.io/text-to-speech/lithuanian
and it sounded right; the Azure neural-voice samples generated earlier (`temp_files/tts-sample/`)
sounded "basic" by comparison. `eleven_multilingual_v2` was tried first and rejected outright — it
returns "does not support language_code 'lt'" for Lithuanian, so `eleven_v3` is not a preference,
it is the only ElevenLabs model that works for this language at all. The request body also sends
`language_code: "lt"` explicitly (confirmed working, not just implied by the voice).

**Lazy, per-lesson generation — not a batch job over the whole catalogue.** Fluent has 4,392
words. Generating audio for all of them up front would burn free-tier credits (10k chars/month,
non-commercial) on words a given user may never study, and would need a long-running batch/queue
this prototype has no reason to build yet. Instead, the button generates a word only when a lesson
that contains it starts (prefetch) or the user presses play — so credit spend tracks actual usage,
which is also the data point the production plan needs (real chars/lesson, not a worst-case
estimate over the whole catalogue).

**Disk cache (`backend/.audio_cache/`), not a DB table — because local dev's `DATABASE_URL`
points at the production Neon DB.** `backend/.env`'s `DATABASE_URL` is the real production
database; `database.create_db_and_tables()` runs `create_all()` on every local boot. Any new
SQLModel table defined for this prototype would therefore be created **in production** the moment
someone ran the local server, before a single line of the production plan had been reviewed. Local
disk carries no such risk and needs no migration to throw away later. This is a prototype-only
constraint, not a recommendation for production: Render's own disk is ephemeral (wiped on every
deploy/restart), so the production plan will very likely need the DB (or S3/R2) for real — this
decision is scoped to "how do we prototype locally without touching prod," not "how should this
be stored for real users."

**Autoplay preference in `localStorage`, not `/api/me/settings`.** Same reasoning as the cache:
adding a `User` column needs an Alembic migration, and migrations run against the same production
DB. `fluent_audio_autoplay` follows the exact pattern `fluent_complexity` already uses. The
production plan moves this server-side once a real migration path exists.

**Generation serialized behind one process-wide `threading.Lock`.** A prefetch and a manual click
for the same word can race; re-checking the cache inside the lock means only one of them ever
actually calls ElevenLabs. `# ponytail: global lock, not per-text — fine for one local user,
would need per-text locks if concurrent users made it a bottleneck.`

## Findings

Filled in from the manual local run (see the plan's Validation section for the steps).

| Sample | Chars sent | Miss (generate) | Hit (cache) | Notes |
| --- | --- | --- | --- | --- |
| "Šeštadienis" (step 0, `model_id=eleven_v3`, no `language_code`) | 11 | 1.8s | — | 4 KB file |
| "Laba diena, kaip sekasi?" (step 0, same) | 24 | 1.3s | — | 7 KB file |
| Azure Leonas via edge-tts, lesson words (n=46 misses, 2026-09-22) | avg 8.1 | median 0.98s, p90 1.2s, max 1.6s | ~0 ms (disk or memory) | ~13 KB per clip |
| Chars for one lesson (10 words × ~8 chars) | ~80 | — | — | S0 cost ≈ $0.0013 per new lesson |
| Browser revalidation after the ETag change | — | — | empty 304 | no clip read at all |

Qualitative notes:
- Pronunciation (Azure Leonas): the user listened through the local lists and found **one**
  misread word, `siųsti` (fixed via `backend/data/pronunciation.json`). Every other word they checked
  sounds right. ElevenLabs had failed on `jausti` («джаусти»), which drove the switch.
- Miss latency (~1s) is hidden by the lesson prefetch; list pages fetch on click, so the first
  click on an unheard word waits ~1s.
- Autoplay impression (stage 1 / stage 2 "what does it mean?" timing, whether it felt intrusive):

## Open questions for the production plan

- **Storage:** DB (Neon) vs. object storage (S3/R2/Cloudflare) — Render's own disk is ephemeral,
  so `backend/.audio_cache/` as shipped here cannot survive a deploy in production.
- **Key + billing on Render:** superseded by the Azure pivot below. Production uses the official
  Azure Speech API on a paid S0 key (`AZURE_SPEECH_KEY` + region on Render), ~$16/1M chars.
- **Free-user upsell — decided 2026-09-22 (mockups `card-badgeD-*` / `card-badgeDopen-*` in
  `temp_files/screenshots/plan_38_word-audio-prototype/mockups/`):**
  - on the lesson card, free users see a small amber pill **«🔊 Послушать в Premium» / "Listen
    with Premium"** sitting 6px *above* the card's top-right edge (`absolute bottom-full right-0`,
    same amber as the practice page's locked-test Premium badge);
  - the pill has a 44px invisible tap area on mobile;
  - clicking it opens the standard `PremiumOfferCard` in place, under the card («Произношение — в
    Premium», perks, «Оформить Premium» → `/pricing`, price line); the lesson is not interrupted;
  - no autoplay switch for free users;
  - nothing on the list pages (a pill per row would be hundreds of them).
  - **Revised the same day (mockups `card-badgeE-*`):** free users *do* see the speaker button,
    in a disabled look (faint icon, light border), in the same places Premium users have it.
    Clicking it goes to `/pricing` (the user: "redirect to the plans"). The label above the card stays,
    since the grey button alone has no call to action. Both lead to `/pricing`, one destination,
    which replaces the in-place offer card above. The list pages get the same disabled `sm`
    button → `/pricing`, not the pill.
  Rejected:
  - a lock on a grey speaker button: it says "no" but not why, and the grey button looks broken;
  - a bare «Premium» pill: no call to action;
  - the pill inside the card next to or under the word: felt pushy, competing with the word;
  - the pill in the card's top-right corner: on 375px it collides with «НОВОЕ СЛОВО».
- **Listening article + send-out (user request, 2026-09-22):**
  - write an article with scientific references on why listening/pronunciation practice helps
    vocabulary learning (bilingual RU + EN, in `/dashboard/articles`);
  - send it to everyone as a **personal message only** (in-app inbox broadcast to all users via
    `inbox_service.send`: one message plus bulk delivery rows, with a CTA link to the article).
    The article itself is not emailed;
  - **email = a separate, short announcement of the new feature** (pronunciation in Premium,
    link to `/pricing`/the article), sent **only** to users with `User.email_consent` True. It
    goes through the existing `email_service.send_email`, with the same consent skip that
    `scheduler.py` and the admin `send_email_to_user` already apply. Bilingual by the user's
    language;
  - the send happens only after the user approves the final text (it is outward-facing).
- **Pricing page (user request, 2026-09-22):** `/pricing` must list pronunciation as a Premium perk
  (and the `PremiumOfferCard` perks everywhere else), with RU + EN copy.
- **Phrases:** `PhraseSession` was explicitly out of scope here (words only). Same endpoint shape
  should work, but phrase text is longer (more chars/request) and worth costing out separately.
- **Autoplay server-side:** move `fluent_audio_autoplay` into `/api/me/settings` once there's a
  real migration path, so the preference follows the user across devices.
- **Pre-generation strategy:** whether production should eagerly generate audio for a list the
  moment it's published (admin-side), rather than lazily on first student visit — trades upfront
  credit spend for a guaranteed-instant first play.

## Autoplay default and the in-card switch (follow-up, 2026-09-22)

After trying the prototype the user asked for two changes:

- **The word should play as soon as the card opens.** So autoplay is **on by default**: only an
  explicit `'false'` in `localStorage.fluent_audio_autoplay` turns it off.
- **A quick switch on the card itself.** It sits in the flashcard's top-right corner, styled as a
  mini copy of the header's RU/EN segmented pill (🔊 / 🔇), and writes the same key as the
  Settings checkbox.

Browser autoplay policy: Chrome only lets a page play sound after the user has interacted with
it. Opening a lesson by clicking a link inside the app counts. Loading a lesson URL cold (typed
or bookmarked) may block the first card's autoplay until the first click. The button still works.

## Word-list page buttons (follow-up, 2026-09-22)

`/dashboard/lists/[id]` shows a small listen button after each Lithuanian word (Premium/admin
only). Unlike the study session it is **click-only, with no prefetch**: a list can hold hundreds
of words, and prefetching them all would spend the TTS quota on words nobody plays.

The shared `SpeakButton` cache stores the in-flight **promise**, not the finished object URL. So
a click or autoplay that lands while the prefetch for the same word is still running joins that
request instead of sending a duplicate. The server's generation lock already prevented paying
twice; this also stops the duplicate HTTP round trip.

## Gotcha: stress marks in `word.lithuanian` break the pronunciation (2026-09-22)

12 non-archived words carry a **stress mark in the plain text field**, e.g. `jaũsti` (the `ũ` is
U+0169). A stress mark is not a Lithuanian letter, and ElevenLabs misread it: `jaũsti` should
sound like «яусти» and didn't. Found by the user on list 298.

Fix in `routers/audio.py`: `spoken_text()` decomposes the text (NFD) and drops only grave/acute/
tilde (U+0300/0301/0303) before the TTS call. Real Lithuanian diacritics are different combining
marks and survive untouched: ogonek ą ę į ų, caron č š ž, dot ė, macron ū. The display text
keeps its stress mark.

The cache key is `sha1(spoken_text(text))`, not the raw display text. So `jaũsti` and `jausti`
share one clip, and any future `spoken_text()` fix misses the old, wrongly spoken clip on its own
instead of serving it forever. Old vs fixed samples: `temp_files/tts-sample/9_*`.

## Decision: engine switched to Azure `lt-LT-LeonasNeural` (2026-09-22)

**Why:** even with stress marks stripped, ElevenLabs v3 read `jausti` as «джаусти». The Lithuanian
`j` came out as English /dʒ/: its premade voices are English voices speaking Lithuanian. The
user compared 5 variants of the same word (`temp_files/tts-sample/10_*`): ElevenLabs Jessica
(with and without `language_code: lt`), ElevenLabs Alice, and Azure Leonas / Ona. **Azure Leonas
was the best.** Azure's lt-LT voices are native Lithuanian voices, so the phonetics are right even
though the voice is less "lively". ElevenLabs Brian's voice id 404'd, and `eleven_flash_v2_5` does
not support `lt`.

**Local prototype:** `routers/audio.py` calls the same Azure voice through `edge-tts` (no key,
unofficial endpoint, installed in the local venv only and deliberately not in
`requirements.txt`). `AUDIO_TTS=elevenlabs` switches back for comparisons. The cache key is
`sha1("<engine>:<voice>|<spoken text>")`, so switching engines never serves the other engine's
clip.

**Production must use the official Azure Speech API on a paid S0 key**, not `edge-tts`:
- Microsoft's Product Terms grant commercial use of prebuilt-neural-voice output to
  **paid-tier** customers only. Microsoft Q&A answers conflict on whether the free F0 tier
  (500k chars/month) allows it, so F0 is not safe for a paid Premium feature.
- S0 pay-as-you-go is ~$16 per 1M characters. The whole catalogue (~53k chars) costs **under
  $1 once**, and new words cost cents. So the ElevenLabs "buy one month" plan is no longer needed.
- The call is a plain REST POST (`https://<region>.tts.speech.microsoft.com/cognitiveservices/v1`,
  SSML body, `Ocp-Apim-Subscription-Key`, `X-Microsoft-OutputFormat`), so it stays an httpx call
  like the ElevenLabs one.

## Pronunciation fixes: `backend/data/pronunciation.json` (2026-09-22)

**Why:** Leonas misreads some words even when the text is clean. `siųsti` is stored without stress
marks, yet it does not come out as «сюсти». This is the voice's own letter-to-sound error, so it
can repeat across a whole root (`išsiųsti`, `nusiųsti`…). A per-case workaround in the frontend
would not scale.

**How:**
- A config file, not code (the user's call): `{"fixes": [{"from", "to", "note"}]}`. `from` is the
  substring, `to` the spelling the voice should read, `note` the why.
- `routers/audio.py` re-reads it whenever its mtime changes, so an edit applies on the next
  request with no restart. Keys are normalized on load (stress marks stripped, lower-cased).
- A missing file means no fixes. `test_the_shipped_config_is_valid` catches broken JSON before a
  deploy.
- `spoken_text()` applies it after stress marks are stripped. The replace is case-insensitive,
  longest key first, in one pass.
- The screen keeps the original word; only the TTS input changes.
- A key also matches inside longer words, deliberately, so one root fix covers its derivatives.
- Keys should be whole words or roots, never a bare letter pair.
- The variants to compare are in `temp_files/tts-sample/13_*` (siųsti / siūsti / sjūsti / siusti).

**Why the cache stays correct:** the cache key is `sha1(voice | spoken text)`. A new or changed
entry therefore misses the old, wrong clip and generates a fresh one. There is no purge step.

**Browser cache: `private, no-cache` + `ETag` (was `max-age=86400`).**
- The URL carries the *display* text, but the clip follows the *spoken* text. With a 24h max-age,
  a fix would stay unheard for a day for anyone who already played the word.
- Now the ETag is the cache key. The browser revalidates every play and gets an empty 304 while
  nothing changed. The 304 comes back before any disk/DB clip read, still behind auth and the
  Premium check.
- The frontend fetch also sets `cache: 'no-cache'`, which overrides clips cached under the old
  header.

**Production:**
- Keep this file for systemic, reviewed fixes.
- If the admin needs to fix single words without a deploy, add a nullable `Word.pronunciation`
  override editable in the admin word editor, applied before the config's fixes.
  **Decided 2026-09-22:** stay on the config file for now. There is one entry in the whole
  catalogue and the admin is the developer. Move to a DB table plus admin screen when fixes
  become frequent (more than ~1/week) or a non-developer admin needs to make them. The JSON is
  already shaped as `from → to` rows.
- A DB change, so it belongs in the production plan and never goes in from local (local dev hits
  the production DB).
