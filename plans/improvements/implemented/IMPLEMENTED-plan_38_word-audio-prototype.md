---
kind: feature
status: done
iteration: 2
max_iterations: 30
suggested_model: sonnet
suggested_effort: medium
confirmed_model: sonnet
confirmed_effort: medium
---

# #38 — Word audio: local prototype (lazy, per lesson)

> **Local only. Not deployed, not merged.** Lives on branch `proto/word-audio`. A production plan
> follows once the prototype answers the questions below.

## Context

Fluent has no sound anywhere. Every competitor has it, and the A2 exam tests listening. All 4
paying users bought at the daily-limit wall, so audio is planned as a **Premium perk**.

Decided with the user (2026-09-21):
- **Voice: ElevenLabs, premade voice "Jessica"** (`cgSgspJ2msm6clMCkdW9`, the default on
  elevenlabs.io/text-to-speech/lithuanian; the user tried it and it sounds right). The Azure samples
  (`temp_files/tts-sample/`) sounded "basic" to the user.
- **Lazy, per lesson.** Show the button, and generate only what the current lesson needs, not the
  whole 4,392-word catalogue up front.
- **Prototype first**, locally, to see how it behaves: latency, credits per lesson, how it sounds
  inside a real session.
- **Engine for the prototype: ElevenLabs free tier.** No card, 10k chars/month (~1,000 words),
  non-commercial use, which is fine for a local test.
- Premium only (the free-user lock + offer is in the production plan, not here).
- **Words only** in the prototype, no phrases.
- **Autoplay is a user option** (checkbox in Settings → Vocabulary, under «Таймер на ответ»).
  When it is on, the word plays by itself as soon as it appears (stage 1, and stage 2 "what does
  it mean?"). In stages where the user has to produce the Lithuanian, it plays **after** the
  answer, so it never gives the answer away. The mockups the user reviewed are in
  `temp_files/screenshots/plan_38_word-audio-prototype/mockups/`.
- **Competitor check:** saunuole.lt has no audio at all. None of its 122 JS bundles uses
  `speechSynthesis`, `Audio` or mp3, and its own copy tells users to practise listening
  elsewhere.

Found while exploring:
- **Local dev talks to the production Neon DB** (`backend/.env` `DATABASE_URL` → neon.tech;
  `database.create_db_and_tables()` runs `create_all()` on boot). A new table in the prototype
  would be **created in production** the moment the local server starts. So the prototype stores
  clips on **local disk** (`backend/.audio_cache/`, gitignored) and makes no DB changes at all.
  Reading lesson words from Neon is the normal local-dev path.
- `QuizSession.tsx` already fetches `/api/me/quota` into `premiumActive` / `isAdminUser`
  (line ~350) and shows the Lithuanian word in stage 1 (flashcard, ~line 1062) and stage 2
  (multiple choice, ~line 1084). Both are safe spots for a play button (the word is already
  visible).
- `word.lithuanian` can hold several forms split by `parseForms()`. Separators must be spoken as
  a pause, not read out.
- Premium gate pattern: `_require_list_creator` in `backend/routers/word_lists.py`
  (`user.is_admin or is_premium_active(user)`); `require_user` in `backend/auth.py`.
- `httpx` is already in `backend/requirements.txt`. There is no icon library, so the icon is an
  inline SVG.

Model/effort: **sonnet / medium**. One small router, one component, a few lines in QuizSession,
all on existing patterns. No DB, no auth changes.

## Goals

- As a Premium/admin user in a local word lesson:
  - a speaker button appears next to the Lithuanian word in stage 1 and stage 2;
  - pressing it plays the word in the ElevenLabs voice.
- When a lesson starts, the words of **that lesson** are prefetched in the background, so the
  first press is usually instant. Only those words are generated.
- Each word is generated at most once. Repeats come from the disk cache.
- The backend logs, for every request: hit/miss, characters sent, and milliseconds. That gives
  the numbers to decide the production design.
- Findings are written to `documentation/audio.md`.

## Non-Goals

- Deploying or merging anything.
- A DB table or Alembic migration (the production plan decides storage; Render's disk is
  ephemeral, so production will likely use the DB).
- Free-user lock / `PremiumOfferCard`, perk copy on the wall or `/pricing`.
- Phrases (`PhraseSession`), list pages, articles, the extension.
- A speaker *button* in the stages that ask for Lithuanian (those only get autoplay after the
  answer).
- Storing the autoplay preference on the server. Adding a `User` column would need Alembic, and
  local dev hits the production DB. So the prototype keeps it in `localStorage`
  (`fluent_audio_autoplay`), the same way `fluent_complexity` already works. The production plan
  moves it server-side.
- Budget caps and a paid ElevenLabs plan (production concerns).

## Requirements

- `GET /api/audio?text=<lithuanian>`:
  - 401 without a valid token;
  - 403 unless `user.is_admin or is_premium_active(user)`;
  - 503 if `ELEVENLABS_API_KEY` is unset;
  - cache hit → 200 `audio/mpeg` from `backend/.audio_cache/<sha1(text.strip())>.mp3`;
  - miss → call ElevenLabs, write the file, return it;
  - ElevenLabs error → 502, nothing cached.
  - `Cache-Control: private, max-age=86400`.
- The ElevenLabs call:
  `POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_22050_32`,
  header `xi-api-key`, JSON `{"text": spoken_text(text), "model_id": "eleven_v3"}`, timeout 60s.
  Never log the key.
- Generation is serialized with one module-level `threading.Lock`, re-checking the cache inside
  the lock. That way a prefetch and a click on the same word never pay twice.
  `# ponytail: global lock; per-text locks if concurrent users make it slow`.
- Frontend: one module-level `Map<text, objectURL>` shared by the button and the prefetch. The
  prefetch requests the lesson's words **one at a time** in lesson order, only for
  premium/admin, and ignores errors.

### Standing constraints
- All validation must be server-side (never frontend-only).
- This plan touches markup: read `documentation/design system/Component Library (as-built).html`
  and `documentation/IMPLEMENTATION.md` first. Use named tokens (`text-muted hover:text-ink`), no
  raw Tailwind steps, no shadow. Run `frontend/tests/design-system-parity.spec.ts`.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 0. **Human, before any code:** create a free ElevenLabs account, and create an API key with Text to
  Speech access. Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID=cgSgspJ2msm6clMCkdW9` (Jessica)
  to `backend/.env` (local only; never Render, never committed). Then send one request for
  "Šeštadienis" with `model_id: eleven_v3`, to confirm the free tier serves v3 + Lithuanian before
  building on it. If it doesn't, stop and re-plan.
  **Done 2026-09-22:** key in `backend/.env`. `eleven_v3` + Jessica returns 200 for "Šeštadienis"
  (1.8s, 4 KB) and "Laba diena, kaip sekasi?" (1.3s, 7 KB). `eleven_multilingual_v2` rejects
  Lithuanian ("does not support language_code 'lt'"), so v3 is the only model. The key has no
  `voices_read` permission, which is not needed. The first uncached play waits ~1.5s, which is
  why the lesson prefetch matters. Samples: `temp_files/tts-sample/8_eleven_eleven_v3_*.mp3`.
- [x] 1. `git checkout -b proto/word-audio`; `.gitignore` — add `backend/.audio_cache/`.
- [x] 2. `backend/routers/audio.py` — the endpoint per Requirements, plus
  `spoken_text(text)` (the separators `parseForms()` splits on become `", "`) and
  `_generate(text) -> bytes` (the httpx call, kept separate so tests can monkeypatch it). Cache
  dir from `AUDIO_CACHE_DIR` env, default `backend/.audio_cache`, created on first write.
  `logger.info("audio %s chars=%d ms=%d", "hit"|"miss", …)`.
- [x] 3. `backend/main.py` — `app.include_router(audio_router, prefix="/api")`.
- [x] 4. `backend/tests/test_audio.py` — TestClient + conftest SQLite, `tmp_path` as cache dir,
  `_generate` monkeypatched. Cases:
  - 401 no token;
  - 403 free user;
  - 503 when the key is unset;
  - premium miss → `_generate` called once and file written;
  - second request → hit, `_generate` not called again;
  - admin allowed;
  - `_generate` raising → 502 and no file;
  - `spoken_text` normalizes separators.
- [x] 5. `frontend/app/dashboard/components/SpeakButton.tsx`:
  - `export default SpeakButton({ text })`: inline SVG speaker, `aria-label={tr.audio.listen}`,
    `data-testid="speak-btn"`, `text-muted hover:text-ink`;
  - on click: take the object URL from the shared `Map`, or fetch `${BACKEND_URL}/api/audio?text=`
    with `Authorization` → blob → `URL.createObjectURL`, then `new Audio(url).play()`;
  - on 404/5xx the button hides itself;
  - `export async function prefetchAudio(texts: string[])`: sequential, same `Map`.
- [x] 6. `frontend/lib/i18n/{types,ru,en}.ts` — `audio.listen`: «Послушать» / "Listen".
- [x] 7. `frontend/app/dashboard/components/QuizSession.tsx`:
  - when `premiumActive || isAdminUser` is true, render `<SpeakButton text={word.lithuanian} />`
    beside the word in stage 1 and stage 2;
  - once the session's word list and premium state are both known, call
    `prefetchAudio(words.map(w => w.lithuanian))` once.
- [x] 7a. Autoplay:
  - `frontend/app/dashboard/settings/page.tsx`: a checkbox after the answer-timer block, same
    markup. Label «Автоматически проигрывать произношение» / "Play pronunciation automatically",
    plus a one-line hint;
  - for free users it is disabled with a small `Premium` tag;
  - value in `localStorage.fluent_audio_autoplay`.
  In `QuizSession.tsx`, when the setting is on and the user is premium/admin:
  - play on stage 1 and on stage 2 "what does it mean?" as the card appears;
  - play after the answer is graded in the stages that ask for Lithuanian (stage 2 "pick the
    Lithuanian word", assemble, type, syllable drill).
  Export a `playAudio(text)` from `SpeakButton.tsx` so the button and autoplay share one code
  path.
- [x] 8. `frontend/tests/audio-button.spec.ts`:
  - mock `/api/me/quota` (premium, and free), the study-session endpoints (copy the setup from an
    existing study spec, e.g. `issue-173-study-list-load.spec.ts`) and `/api/audio*` (small
    bytes);
  - stub `HTMLMediaElement.prototype.play` in `addInitScript`.
  Cases:
  - premium: button visible on stage 1, click → `/api/audio?text=<word>`;
  - prefetch requests every lesson word, one at a time;
  - free: no button and no `/api/audio` request;
  - autoplay on: stage 1 requests the clip without a click; autoplay on + typed stage: no
    request until the answer is submitted; autoplay off: no request without a click;
  - settings checkbox: enabled for premium, disabled with the Premium tag for free, and the value
    persists across reload;
  - RU + EN;
  - 1280 + 375 widths, no horizontal scroll at 375.
  Screenshots to `temp_files/screenshots/plan_38_word-audio-prototype/`.
- [x] 9. `documentation/audio.md` — decision record so far:
  - voice choice (ElevenLabs v3 over Azure / edge-tts / human voice);
  - lazy per-lesson generation;
  - disk-not-DB **because local dev hits the production DB**;
  - a **Findings** table filled in after the manual run: miss ms, hit ms, chars per lesson,
    free-tier credits used, quality/stress notes, autoplay impression;
  - the open questions for the production plan (storage, key on Render + paid plan + monthly
    cap, free-user lock, phrases, autoplay).

- [x] 7b. **Follow-up after the user tried it (2026-09-22):**
  - autoplay is **on by default** (only an explicit `'false'` in `fluent_audio_autoplay` turns it
    off), so the word plays as soon as the card opens;
  - an in-card switch sits in the flashcard's top-right corner. It is a mini copy of the header's
    RU/EN segmented pill (🔊 / 🔇), `AutoplayToggle` in `SpeakButton.tsx`, `role="switch"`, and
    shares the key with the Settings checkbox;
  - turning it on replays the current card.
  Tests: default-on, toggle persists across reload, free users see no toggle. Screenshots
  `card-autoplay-on-*`.

- [x] 7c. **Word-list page listen buttons (user request, 2026-09-22):**
  - `app/dashboard/lists/[id]/page.tsx` gets a compact `SpeakButton size="sm"` after each
    Lithuanian word, Premium/admin only;
  - **click-only, no prefetch** (a 100-word list would burn the free TTS quota on words nobody
    plays);
  - on mobile the Lithuanian column widens to `1.5fr`, long words may wrap
    (`overflow-wrap:anywhere`), and the header row got the same gap as the rows.
  - `SpeakButton`'s cache now stores the in-flight **promise**, so a click or autoplay during a
    prefetch joins that request instead of sending a second one. That was a flaky test and a
    real duplicate request.
  Tests: 6 list cases + screenshots `list-premium-*`.

- [x] 7d. **In-memory LRU in front of the disk cache** (byte-capped at 50 MB, `AUDIO_MEM_MAX_BYTES`).
  The disk stands in for the production DB, so a disk read models one Neon read. Demo: the
  second round was served from memory at ~0 ms server-side. Tests: memory serves a repeat even
  with the file gone, and the byte cap evicts the least recently used clip.
- [x] 7e. **Stress marks stripped before TTS** (`jaũsti` → `jausti`). The cache key is now
  `sha1(engine:voice|spoken text)`.
- [x] 7f. **PIVOT: engine → Azure `lt-LT-LeonasNeural`** (user, 2026-09-22). ElevenLabs said
  «джаусти» for `jausti`; in a 5-way comparison Leonas was clearly best. The prototype uses it by
  default through `edge-tts` (local only). `AUDIO_TTS=elevenlabs` keeps the old engine for
  comparison. Production: official Azure Speech on a **paid S0** key (<$1 for the whole
  catalogue; F0's commercial-use terms are ambiguous). See `documentation/audio.md`.

- [x] 7g. **Vocabulary page listen buttons (user request):** `/dashboard/vocabulary` («Мой словарь»,
  incl. the «Нужно повторить» filter) gets the same compact click-only `SpeakButton size="sm"`,
  Premium/admin only. Tests: 6 cases + screenshots `vocabulary-premium-*`.
- [x] 7h. **Pronunciation fixes (user request):**
  - the config `backend/data/pronunciation.json` respells misread words/roots for the voice only; the
    first entry is `siųsti → sjūsti`;
  - applied in `spoken_text()`, so the cache key follows it;
  - the browser cache becomes `private, no-cache` + `ETag` (304 when unchanged), and the frontend
    fetch uses `cache: 'no-cache'`;
  - tests: 4 new in `test_audio.py`.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q tests/test_audio.py`
- [x] Backend full suite: `cd backend && .venv/bin/python -m pytest -q`
- [x] Types: `cd frontend && npx tsc --noEmit`
- [x] Playwright: `cd frontend && npx playwright test tests/audio-button.spec.ts --reporter=list`
- [x] Design system parity: `cd frontend && npx playwright test tests/design-system-parity.spec.ts --reporter=list`
- [x] Screenshots in `temp_files/screenshots/plan_38_word-audio-prototype/` looked at and
  described (premium button on stage 1 and stage 2; RU + EN; 1280 + 375).
- [x] **Manual (local, real key):** done 2026-09-22 (Azure Leonas; user found one misread word, `siųsti`; numbers in audio.md → Findings)
  - check for a running uvicorn/next first (CLAUDE.md) and restart rather than duplicate;
  - open one word lesson as admin and press the button on several words;
  - read the backend log for miss/hit ms and chars;
  - check `backend/.audio_cache/` holds one file per lesson word;
  - listen for wrong stress;
  - write the numbers into `documentation/audio.md` → Findings.
- [x] `git status` shows no `.audio_cache` files and no `.env` changes staged; nothing pushed.

## Definition of Done

User-facing checks (all three required, local UI only):
1. **Both languages (RU + EN):** `audio-button.spec.ts` runs its cases in `ru` and `en`.
2. **Mobile at 375px:** the spec asserts the button is visible and there is no horizontal scroll
   at 375px.
3. **Screenshots proving each:** RU/EN × 1280/375 shots exist in
   `temp_files/screenshots/plan_38_word-audio-prototype/` and were reviewed.

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
# needs `next dev` on :3000 — every API in these specs is mocked, so no backend is required
cd frontend && PW_BASE_URL=http://localhost:3000 npx playwright test tests/audio-button.spec.ts tests/design-system-parity.spec.ts --reporter=list
ls temp_files/screenshots/plan_38_word-audio-prototype/*.png
```
