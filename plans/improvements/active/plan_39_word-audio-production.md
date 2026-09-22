---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: medium
confirmed_model: opus
confirmed_effort: medium
---

# #39 — Word audio in production

> Builds on the finished local prototype #38: `documentation/audio.md` and
> `plans/improvements/implemented/IMPLEMENTED-plan_38_word-audio-prototype.md`.
>
> **Branches:**
> - `proto/word-audio` is the frozen prototype snapshot (commit `ff62278`). Do not add work
>   there.
> - Implement #39 on **`feature/word-audio`**, branched from it. That is the one branch to merge
>   into `main` later.
> - Nothing is pushed without the user's explicit directive.
>
> `ff62278` also carries the dead-code cleanup #40 (`api/` and `scripts/seed.py` deleted), so it
> reaches `main` with this branch.

## Context

Prototype #38 proved the feature locally:
- Azure `lt-LT-LeonasNeural` sounds right (1 misread word in the lists the user checked);
- about 1s per new word, hidden by the lesson prefetch;
- the user signed off on the UI.

The prototype has three pieces that cannot ship:
- `edge-tts`, an unofficial endpoint;
- clips on local disk, which Render wipes on every deploy;
- `?text=` accepts any string, so a Premium user could make us pay to synthesize anything.

This plan also adds the parts the user asked for on top: a visible-but-locked speaker for free
users, the pricing perk, an article on listening with scientific references, and two send-outs.

Decided with the user (2026-09-22). Do not re-open these:

- **Engine:** official Azure Speech REST API on a **paid S0** key. Commercial use of prebuilt
  neural voices is explicit only on the paid tier. Cost is ~$16/1M chars, so the whole catalogue
  is under $1.
- **Generation:** lazy only (no catalogue pre-generation), with the per-lesson prefetch as in the
  prototype.
- **Phrases:** out of scope.
- **Autoplay preference:** stays in `localStorage` (`fluent_audio_autoplay`), default ON.
- **Pronunciation fixes:** stay in the config `backend/data/pronunciation.json`, hot-reloaded on
  mtime. Not a DB table.
- **Free users:**
  - they see the speaker in a disabled look wherever Premium users have it (lesson card and the
    two list pages); clicking it goes to `/pricing`;
  - on the lesson card they also see a small amber pill «🔊 Послушать в Premium» / "Listen with
    Premium", 6px above the card's top-right edge, also linking to `/pricing`;
  - no autoplay switch.
  - Mockups: `temp_files/screenshots/plan_38_word-audio-prototype/mockups/card-badgeE-*` (the
    locked speaker plus the pill) and `card-badgeD-*` (the pill position).
- **Send-outs:**
  - the article goes to **all users** as an in-app personal message;
  - a short **feature announcement email** goes **only** to users with `User.email_consent`;
  - both are sent only after the user approves the final texts.

Found while exploring:

- **Schema:** nothing runs Alembic on Render. `create_all()` runs on every boot
  (`database.py:41`, `main.py:66`) and creates **new tables**, never new columns. Every table so
  far came from `create_all()`; for example the inbox tables (`documentation/inbox.md:22`).
  - A new, additive, empty table is the established safe path.
  - Local dev's `DATABASE_URL` is production Neon. So the first local boot with the model creates
    the (empty) table in production early, which is harmless.
  - Local test runs with a real Azure key will also write real clips into it. That is fine: same
    key and voice, so they are the clips production would make anyway.
- **`backend/cache.py` is the wrong tool for clips.** It deepcopies on every hit and caps by
  entry count. The prototype's own byte-capped LRU (`routers/audio.py`) stays.
- **Word validation:** `Word` (`models.py:85`) has `lithuanian` and `archived`. Validating on the
  **miss path only** (`select Word where lithuanian == text and not archived`) stops arbitrary
  synthesis without changing the frontend's `?text=` contract.
  - Hits (ETag, memory, DB) only ever serve clips that were generated from a real word.
  - A private word's clip can only be fetched by someone who already knows its exact text, so it
    leaks nothing new.
- **Pricing copy** is in `tr.pricing.premiumFeatures` (`PricingClient.tsx:278`) and the daily wall
  is in `tr.lists.wallPerks` (`DailyLimitBanner.tsx:58`, rendered on lists and phrases).
  - Existing strings are matched by exact text in `quota.spec.ts:41`,
    `daily-limit-banner.spec.ts:62` and `extension-page.spec.ts:45`, so **add** entries and never
    edit existing ones.
- **Premium badges:** the amber practice badge (`practice/[id]/page.tsx:405`) is a
  `Link href="/pricing"`, per the component library rule that Premium badges link to `/pricing`.
  The prototype's settings tag (`settings/page.tsx:350`) is an emerald `<span>` and should become
  the same amber link.
- **QuizSession** (`QuizSession.tsx`):
  - audio state is derived at lines 261–264 and set by the quota fetch at lines 364–376;
  - the stage-1 card wrapper at line 1100 is already `relative`, with no `overflow-hidden`;
  - stage 2 "what does it mean" (line 1136) has no card wrapper.
- **List pages:** `lists/[id]/page.tsx:43,65,135` and `vocabulary/page.tsx:36,57,209` use the
  same `audioEnabled` pattern.
- **Existing tests:** `audio-button.spec.ts` asserts `speak-btn` count 0 for free users at lines
  146, 359 and 416. The locked variant gets its own test id, `speak-btn-locked`. Those assertions
  stay, and new ones are added.
- **Articles:**
  - `Article` model at `models.py:220`: bilingual Markdown bodies, `category`, `published`;
  - `POST /admin/articles/import` takes a `.md` with frontmatter, the RU body, `---EN---`, then
    the EN body;
  - rendered by ReactMarkdown with remark-gfm;
  - the reference style is set by `temp_files/articles/why-review-beats-new-words.md`: an APA list
    under `## Источники` / `## Sources`, with DOI URLs.
- **Inbox:** `POST /admin/inbox` (superadmin; audience `all`; `dry_run`; internal `cta_url` only)
  with the composer in `/dashboard/admin`. The body is plain text.
- **Email:**
  - `email_service.send_email(to, subject, body)` is plain-text SMTP; `SMTP_*` are present in
    `backend/.env`;
  - there is no bulk announcement path; the scheduler loops skip `not user.email_consent` and pick
    `user.lang`;
  - `PreparedMessage` (`models.py:466`) logs sent emails with a `message_type`; it must not be
    used for the announcement (A1-1);
  - there is no unsubscribe link anywhere; opt-out is the consent toggle in Settings.

Model/effort **opus / medium**: a new production table, a paid API key, and emails to real users
need care, while the UI part follows the prototype's patterns.

## Goals

- Premium/admin users hear Azure Leonas in production, in the same places as the prototype, with
  clips stored in the DB and surviving deploys.
- The endpoint synthesizes only existing, non-archived `Word` rows of at most 60 characters.
  That covers the catalogue and Premium users' own words, which can hold any text, so it is **not**
  a hard money bound on its own. The monthly caps are the hard stops: 200k chars (≈ $3) for money
  and 50 MB for DB storage. Telegram alerts the admin when either is hit.
- Free users see a locked speaker (lesson card stages 1–2, list pages) and, on the lesson card,
  the «Послушать в Premium» pill; both go to `/pricing`.
- `/pricing` and the daily-limit wall list pronunciation as a Premium perk.
- An RU + EN article on why listening helps vocabulary learning, with verified scientific
  references, is ready to publish.
- An in-app message to all users links to the article, and a consent-only announcement email is
  ready to send; both are gated on the user's approval.

## Non-Goals

- Phrases audio (`PhraseSession`), a follow-up.
- Server-side autoplay preference: it stays in `localStorage`.
- Pre-generating the catalogue.
- A DB table or admin UI for pronunciation fixes: the config file stays.
- A generic admin "email all users" feature: the announcement is a one-off script.
- An unsubscribe link system: opt-out stays the Settings consent toggle, which the email mentions.
- Alembic migrations: one new table only (`audio_clip`), created by `create_all()`.
- A DB table for the announcement send log: a local ledger file is enough (A2-1).

## Security & architecture audit (2026-09-22)

Two passes, both before approval:
- A1 was the author's own audit.
- A2 was an independent cold audit: a fresh agent with access to the plan and the code only.

The accepted fixes are folded into Requirements and Implementation below; the tags (A1-n, A2-n)
trace them.

Accepted:
- **A1-1 / A2-1 — no `PreparedMessage`, and no new table either, for the announcement.**
  - `scheduler.py:92-100` skips re-engagement for any user with a `draft`/`sent` row of *any*
    type, and `routers/admin.py:64-98` flags `deletion_warning` for anyone with a `sent` row 7+
    days old. Logging there would stop re-engagement emails and mark recipients "for deletion".
  - A new FK table (the first fix) breaks user deletion instead. `_delete_user_data`
    (`admin.py:549-557`) deletes from a hand-written table list, so Postgres would reject deleting
    any recipient. SQLite tests don't enforce FKs, so the suite stays green.
  - The send is a one-off to ~150 users, so an **append-only local ledger file** gives the same
    idempotency with no schema at all.
- **A1-2 / A2-5 — no starvation while generating.**
  - The DB pool is 5+10 (`database.py:32-38`); sync endpoints share FastAPI's 40-thread pool.
  - End the transaction before the lock, so no pooled connection is held while waiting.
  - A non-blocking `BoundedSemaphore(4)` in front of the lock returns 503 at once when 4
    generations are already in flight or waiting, so a burst of parallel requests cannot pin
    threads.
  - Lock `acquire(timeout=10)` → 503. Azure timeout 10s (the prototype's was 60s).
  - Capture `user_id = user.id` *before* the commit: `expire_on_commit` would otherwise re-SELECT
    it (the same gotcha as `inbox.py:118`).
- **A1-3 / A2-3 — schema drift.** The first local boot creates `audio_clip` in production with
  whatever model exists then, and `uvicorn --reload` re-runs `create_all()` on every save.
  - **Stop any local backend before editing `models.py`.**
  - The real guard is the Launch step 1 column check.
  - `documentation/audio.md` gets a purge query for bad clips that local dev may have stored.
- **A1-4 — `max_length` 60**, not 200. The measured catalogue max is 42 and p99 is 28 (prod,
  read-only, 2026-09-22).
- **A1-5 — store only real audio:** HTTP 200, a non-empty body, `Content-Type: audio/*`;
  otherwise 502 and nothing stored.
- **A2-2 — monthly *byte* cap next to the char cap.** Premium users can add and edit their own
  words without limit (`word_lists.py:354-449`). A script cycling short texts stays under the char
  cap while filling Neon Free's ~0.5 GB, and a full DB fails every write app-wide. The same cap
  query also sums `LENGTH(data)`.
- **A2-4 — concurrent insert of the same key.** Local dev and prod, or two Render instances during
  a deploy, share the DB but not the lock. Insert with `ON CONFLICT DO NOTHING`, using the
  dialect-switch pattern of `inbox_service._record_keys` (`inbox_service.py:414`).
- **A2-7 — tests can never spend money or send mail.** Autouse guards in `backend/conftest.py`
  (next to `_telegram_spy`) unset the Azure env and replace `email_service.send_email` with a spy.
- **A2-8 — test isolation.** The audio fixture deletes `audio_clip` rows; the tests seed `Word`
  rows (the prototype tests' "labas"/"rytas" are not words and would now 404).
- **A2-9 — a failed quota fetch never shows the lock to a paying user.**
  - `null` (render nothing) on error;
  - `'locked'` only after a 200 with `premium_active: false` and not admin, or when there is no
    token.
- **A2-10 — the locked controls in a lesson open `/pricing` in a new tab**
  (`target="_blank" rel="noopener"`), so a free user doesn't lose the session they already paid
  one of 5 daily sessions for. The list pages keep normal navigation.
- **A2-11 — email content:**
  - Premium/admin recipients get a variant with no `/pricing` upsell ("it's already on for
    you");
  - every email carries a reply-to-unsubscribe line, because `email_consent` defaults to True;
  - the consent re-check is a fresh read (`session.refresh(user)`).
- **A2-12 — plan fixes:**
  - the article frontmatter needs `title_ru`/`title_en`;
  - the missing-key 503 applies on the miss path only, so stored clips keep playing without a
    key;
  - `escape()` covers `&<>` only, and that is enough for element content;
  - the `voice` column is dropped, since the key already encodes it;
  - Barcroft & Sommers 2005 is dropped from the candidate sources: it is about *several* voices,
    and this is a single-voice feature;
  - the old "never log the word text" rule is dropped: uvicorn's access log already records
    `?text=`, and the text is not secret. The key is what must never be logged.

Deferred, deliberately:
- **A per-user generation limit and an `AudioClip.created_by` column.** There are 4 paying
  Premium users.
  - Money is bounded by the char cap (~$3) and storage by the byte cap, and the Telegram alert
    says when either trips.
  - Both caps are env vars that can be raised without a code deploy.
  - The miss log line carries the user id, so an abuser is identifiable for free.
  - Revisit if a cap ever trips from one account.
- **A negative cache for failed words and an in-process "chars sent" counter.** Azure errors are
  not billed; only a rare "synthesized, then timed out" is, and the cap has margin for that.
- **The existence oracle.** A Premium user can learn whether *some* `Word` has an exact text
  (404 vs 200). It reveals near nothing, and closing it costs a list-membership join per miss.

## Requirements

- `GET /api/audio?text=` (keeps the prototype contract):
  - 401 without a token; 403 unless `user.is_admin or is_premium_active(user)`;
  - `text` max length 60 (A1-4).
- Lookup order:
  1. ETag match → 304, still behind auth;
  2. memory LRU (50 MB byte cap);
  3. `AudioClip` row → add to memory;
  4. miss:
     - **404 unless `text` is the `lithuanian` of a non-archived `Word`**;
     - 503 if `AZURE_SPEECH_KEY` or `AZURE_SPEECH_REGION` is unset (read at call time, never
       logged). This is checked **here only**, so stored clips play without a key (A2-12);
     - capture `user_id = user.id`, then **end the transaction (`session.commit()`)** (A1-2);
     - take the `BoundedSemaphore(4)` **non-blocking**; if it is full → 503 "busy" (A2-5);
     - take the global lock with `acquire(timeout=10)`; on timeout → 503 "busy", no Azure call;
     - inside the lock: re-check the DB and run the cap query in one short transaction, then
       commit; call Azure; insert with `ON CONFLICT DO NOTHING` (A2-4) and commit; add to
       memory;
     - release the lock and then the semaphore in `finally`.
  - A generation failure returns 502 and stores nothing. A failure is anything but HTTP 200 with
    a non-empty body and `Content-Type: audio/*` (A1-5).
- Logging:
  - the miss line carries `user_id`, chars and ms;
  - errors log the Azure status code only;
  - **never the key**: don't log headers, and don't log the request object.
- **Monthly caps (user request + A2-2):** a hard stop for the Azure bill and for DB storage,
  because pay-as-you-go Azure has no spending limit, only budget alerts.
  - `AUDIO_MONTHLY_CHAR_CAP` env, default `200000` (≈ $3.20/month at ~$16/1M), and
    `AUDIO_MONTHLY_BYTE_CAP` env, default `52428800` (50 MB). Both are read at call time.
  - On the miss path, inside the lock and before calling Azure, one query:
    `SELECT COALESCE(SUM(LENGTH(spoken_text)),0), COALESCE(SUM(LENGTH(data)),0) FROM audio_clip
    WHERE created_at >= <1st of this month, UTC>`.
  - If `chars + len(spoken_text) > char cap` or `bytes >= byte cap` → 503 "Audio limit
    reached", with no Azure call.
  - Existing clips (304, memory, DB) keep being served; only *new* words stop.
  - One query per miss only; misses are rare, since each word is generated once ever.
  - When a cap is first hit in a month, send one `telegram_service.send_telegram` alert
    ("audio monthly cap reached: chars used/cap, bytes used/cap"). An in-process flag keyed by
    `YYYY-MM` is enough; a restart may re-send it once.
  - ponytail: `LENGTH(spoken_text)` approximates billed characters; any per-request SSML overhead
    is ignored. The cap is a safety net, not an invoice.
- Azure call:
  - `POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  - headers `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`,
    `X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3` (the same ~13 KB/word as the
    prototype), `User-Agent: fluent`;
  - body `<speak version='1.0' xml:lang='lt-LT'><voice name='lt-LT-LeonasNeural'>{escaped}</voice></speak>`;
  - `spoken_text()` is **XML-escaped** with `xml.sax.saxutils.escape` (`&<>`), which is enough
    for element content: no SSML injection;
  - timeout 10s (typical is ~1s).
- Cache key unchanged: `sha1("azure:lt-LT-LeonasNeural|" + spoken_text)`, with stress marks
  stripped and the pronunciation config applied.
- `AudioClip` table (`audio_clip`):
  - `key` (sha1 hex, primary key), `spoken_text`, `data`
    (`sa_column=Column(LargeBinary, nullable=False)`), `created_at`;
  - no `voice` column: the key encodes it;
  - the `models` import in `main.py` already registers it;
  - **stop any local backend before editing `models.py`** (A1-3).
- Removed: `edge-tts`, the ElevenLabs path and its env vars, the disk cache and `AUDIO_CACHE_DIR`.
- Frontend quota state (A2-9):
  - `null` (render nothing audio-related) until the quota answers, **and on any fetch error**;
  - `'on'` for premium/admin;
  - `'locked'` only after a 200 with `premium_active: false` and not admin, or with no token.
- Email announcement script (A1-1, A2-1, A2-11):
  - dry-run by default, printing the recipient count and one rendered sample per variant
    (RU/EN × free/premium);
  - `--send` actually sends;
  - recipients are only users with `email_consent`;
  - idempotent via an **append-only ledger file** `backend/.announcements/audio_2026_09.sent`
    (gitignored), one user id per line. **Never `PreparedMessage`, and no DB table.**
  - per user, in order:
    1. `session.refresh(user)` and re-check `email_consent`;
    2. send;
    3. append the id to the ledger and flush.
  - a user already in the ledger is skipped;
  - an SMTP failure writes nothing, so a rerun retries it; failures are counted;
  - a summary at the end (sent / skipped / failed);
  - 1s between sends;
  - the language comes from `user.lang`, normalized to ru/en;
  - Premium/admin recipients get the no-upsell variant;
  - the body ends with the opt-out lines: the Settings link, and "reply 'unsubscribe' and we'll
    turn emails off".

### Standing constraints
- All validation must be server-side (never frontend-only).
- This plan touches markup:
  - read `documentation/design system/Component Library (as-built).html` and
    `documentation/IMPLEMENTATION.md` first;
  - use named tokens (the amber badge classes as used on the practice page), no shadows;
  - run `frontend/tests/design-system-parity.spec.ts`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.
- Never log `AZURE_SPEECH_KEY`, SMTP secrets or tokens. Nothing is pushed without the user's
  explicit directive.

## Prerequisite: Azure Speech key (human, step by step)

Done by the user, not by Claude. Never paste passwords, card details or the key itself into the
chat. Once the key is in `backend/.env`, just say "key is in". Button names are the ones in the
English Azure portal UI. Microsoft renames menu items from time to time; if something isn't where
described, look for it by meaning.

**A. Azure account** (skip if you already have a Pay-As-You-Go subscription)
1. Open https://azure.microsoft.com/free and click **Start free** (or **Try Azure for free**).
2. Sign in with a Microsoft account. You can create one with your own email.
3. Enter a phone number and a bank card. The card is for verification only: the free account
   charges nothing. It comes with a credit (~$200) for 30 days.
4. **Upgrade the subscription to Pay-As-You-Go right away.** The free subscription is disabled
   after 30 days (or when the credit runs out), and audio on the site would simply stop working.
   - Portal https://portal.azure.com → **Subscriptions** → your subscription → **Upgrade**
     (or the "Upgrade" banner at the top).
   - Any remaining credit is kept until day 30; after that you pay per character only.
   - Pay-As-You-Go has no spending limit. The budget (step D) and the in-app cap protect
     against that.

**B. Speech resource**
5. In the portal: **Create a resource** → search `Speech` → pick **Speech** (publisher Microsoft;
   it may be called "Speech service" or sit under "Foundry Tools") → **Create**.
   - If the portal only offers **Azure AI services** / **Foundry resource**, take that: the key
     and region work the same way.
6. Fill in the **Basics** tab:
   - **Subscription:** the Pay-As-You-Go subscription from step 4.
   - **Resource group:** **Create new** → `fluent`.
   - **Region:** **West US 2**. It is the closest to our Render server (Oregon) and supports
     neural voices.
   - **Name:** `fluent-speech`. It must be unique across Azure; if taken, add digits, e.g.
     `fluent-speech-39`.
   - **Pricing tier:** **Standard S0**. Not **Free F0**: commercial use is not guaranteed on
     the free tier (see `documentation/audio.md`).
7. Leave the other tabs (**Network**, **Identity**, **Tags**) at their defaults →
   **Review + create** → **Create**. Wait about a minute → **Go to resource**.

**C. Key and region**
8. In the resource's left menu: **Resource Management** → **Keys and Endpoint**.
9. Copy **KEY 1** and **Location/Region**. You need the short code such as `westus2`, not
   "West US 2".
10. Locally, open `backend/.env` and add two lines:
    ```
    AZURE_SPEECH_KEY=<KEY 1>
    AZURE_SPEECH_REGION=westus2
    ```
11. On Render: https://dashboard.render.com → the Fluent service → **Environment** →
    **Add Environment Variable**. Add the same two variables with the same values → save.
    - If Render offers a choice, **Save only** is enough. If it deploys anyway, nothing breaks:
      the current code does not read these variables.
    - `AUDIO_MONTHLY_CHAR_CAP` is not needed; it defaults to `200000`. Add it only if you want a
      different cap.

**D. Budget alert**
12. Portal → **Cost Management + Billing** → **Cost Management** → **Budgets** → **+ Add**.
13. **Scope:** the subscription from step 4. **Name:** `fluent-speech-budget`, **Reset period:**
    **Monthly**, **Amount:** `2` (in the billing currency) → **Next**.
14. **Alert conditions:** type **Actual**, thresholds `50` and `100` %. **Alert recipients
    (email):** your email → **Create**.
    - A budget only sends emails, and its data can lag by up to a day. It does not stop
      spending; the in-app `AUDIO_MONTHLY_CHAR_CAP` does.

**E. Check**
15. Tell Claude "key is in". Claude makes one request for "Šeštadienis" (the key is never
    printed or logged) and plays the result.
16. If the key leaks (chat, git, logs): **Keys and Endpoint** → **Regenerate Key 1**, then
    update `backend/.env` and Render.

## Implementation

> **The Azure key is not needed to implement or to pass the Definition of Done.** Every test
> mocks `_generate`, and the conftest guard unsets the Azure env. The key (see Prerequisite) is
> needed only for the manual Validation item and for Launch, so coding can start before the user
> has created it.
>
> The article is **not** in this checklist. `ralph-implementer` has no web
> access to verify DOIs, so it is written in the main session: see "Main-session tasks" below.

- [x] 1. `backend/models.py` — `AudioClip` table per Requirements. No `voice` column, and no
  other new table.
  - **Stop any running local backend before editing `models.py`.** `--reload` re-runs
    `create_all()` against production on every save (A1-3).
  - `backend/conftest.py` gets autouse guards next to `_telegram_spy` (A2-7):
    - `monkeypatch.delenv` of `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`;
    - `email_service.send_email` replaced by a spy, so no test can ever bill Azure or send mail.
- [x] 2. `backend/routers/audio.py` — production rewrite per Requirements:
  - `_generate()` becomes the Azure REST httpx call with escaped SSML. It accepts only HTTP 200
    with a non-empty `audio/*` body;
  - the disk read/write becomes `session.get(AudioClip, key)` and an `ON CONFLICT DO NOTHING`
    insert (the dialect switch from `inbox_service._record_keys`);
  - the miss path, in order:
    1. the Word-exists check;
    2. the missing-key 503 (miss path only);
    3. capture `user_id`, then `session.commit()`;
    4. the non-blocking `BoundedSemaphore(4)` → 503;
    5. the lock with `acquire(timeout=10)` → 503;
    6. the re-check and caps query (chars + bytes, Telegram alert once a month), then Azure,
       insert and memory;
    7. release everything in `finally`;
  - `max_length=60`; Azure timeout 10s;
  - logging: user id, chars and ms; never headers or the request object;
  - delete the edge-tts, ElevenLabs and disk code, and the up-front 503 check;
  - keep: stress stripping, the pronunciation config, the memory LRU, the ETag, `served()`, and
    the lock's `ponytail:` note.
- [x] 3. `backend/tests/test_audio.py` — replace the disk/ElevenLabs cases with DB ones.
  - `_generate` (or its HTTP layer) is monkeypatched. The autouse fixture clears memory and
    deletes `audio_clip` rows, and the tests seed `Word` rows (A2-8).
  - Cases:
    - a miss inserts a row, and a repeat is served from memory;
    - after a memory clear, a repeat is served from the DB without generating;
    - an unknown or archived word → 404, no generation;
    - `max_length`: 61 chars → 422;
    - no Azure env:
      - a miss → 503;
      - an already-stored clip → 200 (the 503 is on the miss path only);
    - semaphore full → immediate 503, and `_generate` is not called;
    - the lock is busy (hold it in the test; patch the timeout to ~0.1s) → 503, and `_generate`
      is not called;
    - while `_generate` runs, the request's session has no open transaction (a spy on
      `session.in_transaction()`);
    - a duplicate insert of the same key (pre-insert the row between the re-check and the
      insert) → 200, with no IntegrityError and no 500;
    - Azure returns non-200, an empty body or a non-audio `Content-Type` → 502, nothing stored;
    - caps:
      - with the char cap set low, a miss that would exceed it → 503, and `_generate` is not
        called;
      - the same with the byte cap;
      - an already-stored clip is still served (200/304);
      - last month's rows don't count;
      - the Telegram alert fires once per month (`send_telegram` monkeypatched);
    - the SSML body escapes `&<>` (a unit test on the payload builder);
    - keep the respell, stress-mark, ETag/304 and 401/403 cases.
- [x] 4. `frontend/app/dashboard/components/SpeakButton.tsx`:
  - `export function LockedSpeakButton({ size })`: a `Link href="/pricing"` shaped like
    SpeakButton, with a faint icon and light border,
    `aria-label={tr.audio.lockedLabel}`, `data-testid="speak-btn-locked"`;
  - `export function AudioPremiumPill()`: a `Link href="/pricing"`, `data-testid="audio-premium-pill"`,
    amber practice-badge colors at 11px text with a 12px speaker icon, text `tr.audio.listenPremium`;
    the outer link carries the 44px mobile tap area and the inner span is the visual pill;
  - both take an optional `newTab` prop (`target="_blank" rel="noopener"`), used in the lesson
    only (A2-10);
  - update the header comment (production, not the prototype).
- [x] 5. `QuizSession.tsx`:
  - derive `audioState: 'on' | 'locked' | null` per Requirements. It is `null` while loading
    and on any quota fetch error (A2-9);
  - `'locked'`:
    - stage-1 card gets `<AudioPremiumPill/>` absolutely positioned `bottom-full right-0 mb-1.5`
      inside the `relative` card wrapper;
    - `LockedSpeakButton` beside the word in stage 1 and stage 2 "what does it mean";
    - both lesson variants open `/pricing` in a new tab (`target="_blank" rel="noopener"`), so
      the session isn't lost (A2-10);
    - no autoplay toggle, no prefetch, no autoplay.
  - `'on'` stays exactly as in the prototype.
- [x] 6. `lists/[id]/page.tsx`, `vocabulary/page.tsx` — the same tri-state (`null` on a fetch
  error). `'locked'` renders `<LockedSpeakButton size="sm"/>` per word: no pill, and normal
  navigation (no new tab).
- [x] 7. `settings/page.tsx` — the autoplay Premium tag becomes the amber practice-badge
  `Link href="/pricing"` (was an emerald span).
- [x] 8. i18n `types.ts` / `ru.ts` / `en.ts`:
  - `audio.listenPremium`: «Послушать в Premium» / "Listen with Premium";
  - `audio.lockedLabel`: «Произношение — в Premium» / "Pronunciation is part of Premium";
  - add «Произношение каждого слова» / "Pronunciation of every word" as a new entry:
    - in `pricing.premiumFeatures`, inserted as the 2nd item;
    - in `lists.wallPerks`, appended;
    - existing strings stay untouched (the specs match them by text).
- [x] 9. `frontend/tests/audio-button.spec.ts`:
  - free users in each surface: `speak-btn-locked` is visible and its `href` is `/pricing`;
    `audio-premium-pill` is visible on stage 1 only, not on list pages; zero `/api/audio`
    requests; `speak-btn` and `autoplay-toggle` counts stay 0;
  - a failed `/api/me/quota` (500) → neither `speak-btn` nor `speak-btn-locked` nor the pill
    renders (A2-9);
  - the lesson-card locked controls have `target="_blank"`; the list-page ones don't (A2-10);
  - the settings tag links to `/pricing`;
  - the pricing page shows the new perk (RU + EN);
  - screenshots of the free states `free-card-*`, `free-select-*`, `free-list-*`,
    `free-vocabulary-*`, `pricing-*`, RU/EN × 1280/375, with no horizontal scroll at 375;
  - screenshots go to `temp_files/screenshots/plan_39_word-audio-production/`.
- [x] 10. `documentation/design system/Component Library (as-built).html` — a new section after
  PremiumOfferCard (line ~824): SpeakButton (md/sm, playing), AutoplayToggle, LockedSpeakButton,
  AudioPremiumPill, each with why and where. Map them in `documentation/IMPLEMENTATION.md`.
- [x] 11. `documentation/audio.md` — a "Production (#39)" section covering:
  - Azure S0 and why;
  - DB table via `create_all()`, and why no Alembic;
  - the Word-exists check on the miss path, and why;
  - the monthly character cap and the Azure budget alert, and why both (pay-as-you-go has no
    spending limit);
  - the storage/transfer numbers (prod DB 22 MB on 2026-09-22; the full catalogue ≈ 52 MB of
    clips; Neon free storage ≈ 0.5 GB);
  - the audit: what was fixed and what was deferred, with why (copy the audit section);
  - a purge query for bad clips, e.g. ones stored by a local branch:
    `DELETE FROM audio_clip WHERE created_at >= :t` (A1-3), plus when to use it;
  - what was removed.
  - Also remove `backend/.audio_cache/` from `.gitignore`.
- [x] 12. `backend/scripts/send_audio_announcement.py` — per Requirements. Add
  `backend/.announcements/` to `.gitignore`.
  - Subject and body RU/EN × free/premium in the `email_templates.py` style: a greeting, then 3–4
    short lines on what's new, then a link to the article.
    - Free users: `👉 https://fluent.lt/pricing`.
    - Premium/admin: "it's already on for you", with no upsell.
    - Then the sign-off and the opt-out lines: "Отключить письма можно в настройках:
      https://fluent.lt/dashboard/settings" and "or reply 'unsubscribe'".
  - Test `backend/tests/test_audio_announcement.py` (`send_email` is already a spy via the
    conftest guard; the ledger path points at `tmp_path`):
    - only consented users are included;
    - dry run sends nothing and writes nothing;
    - `--send` appends one ledger line per send, and the `PreparedMessage` count is unchanged;
    - a rerun skips users already in the ledger;
    - consent withdrawn after the run starts (committed from another session) → that user is
      skipped, thanks to `refresh`;
    - an SMTP failure writes no ledger line, and a rerun retries it;
    - ru/en by `user.lang`; the premium variant has no `/pricing` link.
- [x] 13. `documentation/CHANGELOG.md` — append `#39`.

## Main-session tasks (not for ralph)

Done by Claude in the main session, which has web access, after the ralph pass. None of these
blocks the Definition of Done.

- Article draft `temp_files/articles/lithuanian-pronunciation.md`. Retargeted on 2026-09-22 at the
  search query «литовское произношение» so it can bring Google traffic: a practical guide (letters,
  vowel length, stress, pitch accent), then the research, then the feature. See
  `documentation/articles-seo.md`.
  - importer format:
    - frontmatter `slug: lithuanian-pronunciation`, `title_ru`, `title_en` (the importer
      requires both, `articles.py:357-366`), `category: learning_materials`, `published: false`;
    - RU body, `---EN---`, EN body;
  - Fluent's plain style, with no claims beyond the sources;
  - ends with `## Источники` / `## Sources` in APA style with DOI links.
  - Candidate sources, **each to be verified by fetching its DOI/publisher page and kept only if
    it supports the sentence citing it; never invent or guess a citation**:
    - Baddeley, Gathercole & Papagno 1998 (phonological loop, *Psychological Review*);
    - Service 1992 (phonological memory and FL learning);
    - Ellis & Beaton 1993 (pronounceability and FL vocabulary, *Language Learning*);
    - MacLeod et al. 2010 (production effect, *JEP:LMC*).
    - Not Barcroft & Sommers 2005: it supports *several* voices, and this is a single-voice
      feature (A2-12).
  - Mention the new feature in one closing paragraph, pointing to `/pricing`.
  - Show the RU + EN draft to the user and iterate until approved. It is published only at
    Launch.

## Validation

- [x] Backend audio: `cd backend && .venv/bin/python -m pytest -q tests/test_audio.py tests/test_audio_announcement.py`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright: `cd frontend && PW_BASE_URL=http://localhost:3000 npx playwright test tests/audio-button.spec.ts tests/quota.spec.ts tests/daily-limit-banner.spec.ts tests/extension-page.spec.ts --reporter=list`
- [x] Design system parity: `cd frontend && PW_BASE_URL=http://localhost:3000 npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots in `temp_files/screenshots/plan_39_word-audio-production/` looked at and
  described (free locked card + pill, stage 2, list, vocabulary, pricing; RU + EN; 1280 + 375).
- [x] **Manual, with the real Azure key** (needs the Prerequisite done; local; check for
  running servers first):
  - as admin, open a lesson and hear several words;
  - confirm new rows in `audio_clip` and the timings in the backend log;
  - restart the backend and confirm a repeat comes from the DB, not Azure;
  - a free test user sees the locked speaker and the pill, and both open `/pricing`.
- [ ] Article: every reference's DOI/URL was opened and supports its sentence; the user approved
  the RU + EN text.
- [ ] Email script dry run shown to the user (count + RU/EN samples); the user approved the text.

## Launch (human-gated, after the user explicitly says to merge/deploy; not for ralph)

0. **Prerequisites:**
   - the Azure Prerequisite is done, and `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` are set on
     Render;
   - **how Render builds the frontend is confirmed.** The live Build Command is only
     `pip install -r requirements.txt`, and `backend/out` in git is a symlink to a local path, so
     the frontend deploy path is unknown until the Start Command is checked.
1. **Schema check before deploy (A1-3):**
   - read the `audio_clip` columns in production (read-only `information_schema.columns`) and
     compare them with the model;
   - on a mismatch, drop the stale table (it holds only regenerable clips), with the user's OK;
   - then deploy. `create_all()` creates it if it is missing.
2. Prod smoke as admin: a word plays; a second play is a 304; `audio_clip` has rows.
3. Publish the article (import the `.md` via the admin Articles page, or flip `published`), **then
   deploy again**. Article pages are pre-rendered only at build time; until the next build Google
   gets a client-rendered placeholder with a generic title (`documentation/articles-seo.md`).
4. Inbox broadcast: `/dashboard/admin` composer, audience `all`, CTA → `/dashboard/articles/lithuanian-pronunciation/`.
   Dry run first for the count.
5. Email: `cd backend && .venv/bin/python scripts/send_audio_announcement.py` (dry run), then
   `--send`.
6. News post via `/news-writer`. Move this plan to `implemented/`.

Deferred by the user (2026-09-22), not part of this plan:
- The live article `lithuanian-for-russian-speakers` says «ą | долгое носовое «а»». Modern standard
  Lithuanian ą is not nasal (found by the cold article review).
- Add links from `lithuanian-for-russian-speakers` and `is-lithuanian-hard-to-learn` to
  `lithuanian-pronunciation`: inbound links from indexed pages help the new page rank.

## Definition of Done

User-facing checks (all three required):
1. **Both languages (RU + EN):** the locked speaker, the pill, the settings tag and the pricing
   perk are asserted in `ru` and `en` in `audio-button.spec.ts`.
2. **Mobile at 375px:** the spec asserts the pill and the locked buttons are visible and there is
   no horizontal scroll at 375px, on the card, list, vocabulary and pricing pages.
3. **Screenshots proving each:** RU/EN × 1280/375 shots of every free-user state and pricing
   exist in `temp_files/screenshots/plan_39_word-audio-production/` and were reviewed.

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && PW_BASE_URL=http://localhost:3000 npx playwright test tests/audio-button.spec.ts tests/quota.spec.ts tests/daily-limit-banner.spec.ts tests/extension-page.spec.ts tests/design-system-parity.spec.ts --reporter=list
ls temp_files/screenshots/plan_39_word-audio-production/*.png
```
