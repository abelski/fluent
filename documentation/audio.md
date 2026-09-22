# Word audio — prototype (#38) and production (#39)

> **#38** was the local prototype (frozen on branch `proto/word-audio`, see
> `plans/improvements/implemented/IMPLEMENTED-plan_38_word-audio-prototype.md`). **#39** made it
> production-ready on `feature/word-audio`: see "Production (#39)" at the end of this file, which
> supersedes the prototype's storage, engine and gating notes below.

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
- **The switch on every stage (#39, 2026-09-22).** On stage 1 alone, a user who changed their mind
  mid-lesson had to leave for Settings. Every other stage now shows the same switch at the right
  edge of the mascot row. Not in the header row: with the review label («Повторение выученных ·
  Пишу») it did not fit at 375px. It is safe on the stages that hide the answer: the autoplay
  effect fires only on stages 1–2, so switching it on there never plays the word.

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

## Production (#39)

Plan: `plans/improvements/active/plan_39_word-audio-production.md`.

### What ships

- **Engine: the official Azure Speech REST API on a paid S0 key**, voice `lt-LT-LeonasNeural`.
  Commercial use of prebuilt neural voices is explicit only on the paid tier (see "engine switched"
  above), and S0 costs ~$16/1M chars, so the whole catalogue is under $1. `_generate()` in
  `backend/routers/audio.py` is one httpx POST to
  `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` with SSML, output
  `audio-24khz-48kbitrate-mono-mp3` (~13 KB/word), timeout 10s. The spoken text is XML-escaped
  (`xml.sax.saxutils.escape`, `&<>`), which is enough for element content, so no SSML injection.
  Only HTTP 200 with a non-empty `audio/*` body is accepted; anything else is a 502 and nothing is
  stored.
- **Env:** `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (e.g. `westus2`), read at call time and never
  logged. Optional: `AUDIO_MONTHLY_CHAR_CAP` (default `200000`), `AUDIO_MONTHLY_BYTE_CAP`
  (default `52428800`), `AUDIO_MEM_MAX_BYTES` (default 50 MB).
- **Lookup order** for `GET /api/audio?text=` (401 without a token, 403 unless Premium/admin,
  `text` ≤ 60 chars):
  1. `If-None-Match` equals the ETag (the cache key) → empty 304;
  2. the in-process byte-capped LRU (50 MB);
  3. the `audio_clip` row → added to memory;
  4. miss → Word check (404), key check (503), end the transaction, semaphore (503 "busy"), global
     lock with a 10s timeout (503 "busy"), re-check + monthly caps (503 "Audio limit reached"),
     Azure, `INSERT … ON CONFLICT DO NOTHING`, memory.
- **Logging:** one line per request (`audio <source> user=<id> chars=<n> ms=<n>`); errors log the
  Azure status code only. Never headers, never the request object, never the key.
- **Frontend:** Premium/admin as in the prototype. Free users see a locked speaker in the same
  places and, on the lesson card, the «Послушать в Premium» pill, both → `/pricing` (new tab in a
  lesson). A failed `/api/me/quota` renders no audio control at all, so a paying user never sees
  the lock. See the component library's "Word audio" section.

### Why a DB table, created by `create_all()`, and no Alembic

Render's disk is wiped on every deploy, so the prototype's disk cache could not ship. Clips go in a
new table `audio_clip` (`key` sha1 PK, `spoken_text`, `data` bytea, `created_at`). Nothing runs
Alembic on Render; `create_all()` runs on every boot and creates **missing tables** (never new
columns), which is how every table so far got created (e.g. the inbox tables). A new, additive,
empty table is the established safe path. There is no `voice` column: the key already encodes the
voice (`sha1("azure:lt-LT-LeonasNeural|" + spoken text)`).

Gotcha: local dev's `DATABASE_URL` is production Neon, so the first local boot with the model
creates the table in production early, and `uvicorn --reload` re-runs `create_all()` on every save.
**Stop any local backend before editing the `AudioClip` model**, and compare the production columns
(`information_schema.columns`) with the model before deploying (the plan's Launch step 1). Local
runs with the real key write real clips into production; that is fine, they are the same clips
production would make.

`backend/cache.py` was not used: it deepcopies on every hit and caps by entry count. The
prototype's byte-capped LRU stayed.

### Why the Word check on the miss path

`?text=` used to accept any string, so a Premium user could make us pay to synthesize anything.
On a miss the endpoint now requires `text` to equal the `lithuanian` of a non-archived `Word`
(404 otherwise). It sits on the miss path only, so the frontend's `?text=` contract is unchanged
and hits cost no extra query. Hits only ever serve clips that were generated from a real word, and
a private word's clip can only be fetched by someone who already knows its exact text.

This is **not** a money bound on its own: Premium users can add and edit their own words without
limit, and those are `Word` rows too. The monthly caps are the hard stop.

### Why a monthly cap *and* an Azure budget alert

Pay-as-you-go Azure has **no spending limit**, only budget alerts, and those only email and can lag
by up to a day. So the app enforces its own hard stop: on a miss, inside the lock and before
calling Azure, one query sums `LENGTH(spoken_text)` and `LENGTH(data)` over this month's rows
(UTC). If `chars + len(new text) > AUDIO_MONTHLY_CHAR_CAP` (≈ $3.20 at 200k) or
`bytes >= AUDIO_MONTHLY_BYTE_CAP` (50 MB), the request is a 503 and Azure is not called. Stored
clips keep playing; only *new* words stop. The first time a cap trips in a month, Telegram alerts
the admin once (an in-process flag keyed by `YYYY-MM`; a restart may re-send it once). Both caps
are env vars, so they can be raised on Render without a deploy. The Azure budget
(`fluent-speech-budget`, $2, 50%/100%) is the second, independent line: it catches anything the
app-side approximation misses. `LENGTH(spoken_text)` approximates billed characters and ignores
per-request SSML overhead; the cap is a safety net, not an invoice.

The byte cap exists because the char cap alone does not protect storage: a script cycling short
texts through its own words stays under the char cap while filling Neon Free's ~0.5 GB, and a full
DB fails every write app-wide.

### Storage and transfer numbers (2026-09-22)

- Production DB: **22 MB** in total.
- Full catalogue as clips: **≈ 52 MB** (4,392 words × ~13 KB, measured on the prototype's clips).
  Lazy generation means only words someone actually studies get stored.
- Neon Free storage: **≈ 0.5 GB**.
- Each clip is read from Neon once per process, then served from memory; a repeat play in the
  browser is an empty 304.

### Security & architecture audit

Two passes before approval: A1 (the plan author's) and A2 (an independent cold audit with access
to the plan and the code only). Accepted fixes:

- **A1-1 / A2-1 — the announcement email logs to no DB table.** `PreparedMessage` is read by
  `scheduler.py` (skips re-engagement for anyone with a `draft`/`sent` row of any type) and
  `routers/admin.py` (flags `deletion_warning` for a `sent` row 7+ days old). A new FK table would
  break user deletion: `_delete_user_data` deletes from a hand-written table list, so Postgres would
  reject deleting any recipient (SQLite tests don't enforce FKs). The one-off send uses an
  append-only local ledger file instead (`backend/.announcements/audio_2026_09.sent`, gitignored).
- **A1-2 / A2-5 — no starvation while generating.** The DB pool is 5+10 and sync endpoints share
  FastAPI's 40-thread pool. The request commits (ends its transaction) before waiting, so no pooled
  connection is held; a non-blocking `BoundedSemaphore(4)` returns 503 at once when 4 generations
  are already in flight or waiting; the lock waits at most 10s; the Azure timeout is 10s.
  `user_id` is captured before the commit, since `expire_on_commit` would re-SELECT it.
- **A1-3 / A2-3 — schema drift** from local boots creating the table early: stop the local backend
  before editing the model, check the production columns before deploy, and the purge query below.
- **A1-4 — `max_length` 60**, not 200: the catalogue max is 42 chars and p99 is 28.
- **A1-5 — store only real audio** (200, non-empty, `audio/*`), otherwise 502 and nothing stored.
- **A2-2 — the monthly byte cap** next to the char cap (see above).
- **A2-4 — concurrent insert of the same key.** Local dev and prod, or two Render instances during a
  deploy, share the DB but not the lock: `INSERT … ON CONFLICT DO NOTHING` (the dialect switch from
  `inbox_service._record_keys`).
- **A2-7 — tests can never spend money or send mail.** Autouse guards in `backend/conftest.py`
  unset the Azure env and replace `email_service.send_email` with a spy (`_email_spy`).
- **A2-8 — test isolation.** The audio test fixture deletes `audio_clip` rows and seeds real `Word`
  rows.
- **A2-9 — a failed quota fetch never shows the lock to a paying user** (the frontend tri-state).
- **A2-10 — the locked controls in a lesson open `/pricing` in a new tab**, so a free user doesn't
  lose the session they spent one of their daily sessions on.
- **A2-11 — email content:** Premium/admin recipients get a no-upsell variant, every email carries
  a reply-to-unsubscribe line (`email_consent` defaults to True), and consent is re-read
  (`session.refresh(user)`) right before each send.
- **A2-12 — plan fixes:** the missing-key 503 is on the miss path only (stored clips play without
  a key); `escape()` (`&<>`) is enough for element content; no `voice` column; the old "never log
  the word text" rule was dropped (uvicorn's access log already records `?text=`, and the text is
  not secret; the key is what must never be logged).

Deferred, deliberately:
- **A per-user generation limit and an `AudioClip.created_by` column.** There are 4 paying Premium
  users. Money is bounded by the char cap and storage by the byte cap, the Telegram alert says when
  either trips, both caps can be raised without a deploy, and the log line carries the user id, so
  an abuser is identifiable for free. Revisit if a cap ever trips from one account.
- **A negative cache for failed words and an in-process "chars sent" counter.** Azure errors are
  not billed; only a rare "synthesized, then timed out" is, and the cap has margin for that.
- **The existence oracle.** A Premium user can learn whether *some* `Word` has an exact text (404
  vs 200). It reveals near nothing, and closing it costs a list-membership join per miss.

### Purging bad clips

Clips are regenerable, so deleting rows is always safe: the next play regenerates them (and counts
against this month's caps again). Use it when a local branch stored clips that production should not
serve, e.g. from an experimental `spoken_text()` or voice change that never shipped (A1-3):

```sql
DELETE FROM audio_clip WHERE created_at >= :t;  -- :t = when the local experiment started (UTC)
```

A pronunciation fix does **not** need a purge: it changes the spoken text and therefore the key,
so the old clip is simply never looked up again (it stays as a dead row, ~13 KB). Restart the
backend (or wait for LRU eviction) after a purge if the purged clips may still be in a process's
memory cache.

### Removed from the prototype

- `edge-tts` (unofficial endpoint; it was never in `requirements.txt`, only in the local venv).
- The ElevenLabs path, `AUDIO_TTS` and the `ELEVENLABS_*` env vars (the code no longer reads them;
  `backend/.env` may still hold the two unused keys, which can be deleted by hand).
- The disk cache `backend/.audio_cache/`, `AUDIO_CACHE_DIR`, and its `.gitignore` entry.
- The up-front 503 check for a missing key (now on the miss path only).
