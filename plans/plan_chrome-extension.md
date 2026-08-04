# Plan: Chrome Extension — Translate & "Add to Learn" (list: "From internet")

> After approval this plan will be copied to `plans/plan_chrome-extension.md` for live checkbox tracking during implementation (feature-analyst workflow).

## Context

Users read Lithuanian content across the web and have no quick way to capture unknown words into Fluent. A Chrome extension (Manifest V3) will let them select a word on any page (or ctrl+double-click) to see its English translation and, for premium users, add it to an auto-created personal list **"From internet"**. This also works as a premium funnel: translation is free for any logged-in user; adding is premium-only.

Confirmed decisions (via AskUserQuestion):
- **Translation**: DB lookup first (public-list `Word` rows), fallback to free MyMemory API (`lt|en`) called **server-side**.
- **Trigger**: floating icon on selection + ctrl/cmd+double-click opens popup directly.
- **Auth**: extension "Connect" opens fluent.lt and grabs the JWT from `localStorage.fluent_token` (no new OAuth flow).
- **Gating**: logged-in users get translations; "Add to learn" premium-only (upgrade prompt otherwise).

## Execution model (confirmed)

- **Implementation**: delegated to a **Sonnet** subagent working through the checklist below (plan file checkboxes updated as items complete).
- **Code review**: performed by **Fable** (this session) on the full diff after implementation — correctness, security (token handling, input validation, privacy of private lists), and simplicity — with fixes applied before validation.

## Repo layout & distribution (confirmed)

The extension lives in a new top-level `extension/` folder (next to `backend/`, `frontend/`), committed to git, plain JS, no build step. It is not served by Render — it only calls the backend API. **V1 distribution: load-unpacked only** (`chrome://extensions` → Developer mode → Load unpacked → `extension/`). Chrome Web Store publishing (zip, listing, privacy policy, $5 registration) is a deferred follow-up.

## Architecture

- All extension→backend fetches go through the **background service worker** with `host_permissions` for `https://fluent.lt/*` + localhost → CORS-exempt, so `backend/main.py:110-121` CORS config stays untouched.
- New router `backend/routers/extension.py` reusing existing patterns: `require_user` (backend/auth.py:45), `is_premium_active` (backend/quota.py:13), personal-list conventions from `backend/routers/word_lists.py`. No model changes, no migrations.
- **Key constraint found in exploration**: `DELETE /me/word-lists/{id}` (word_lists.py:282-309) hard-deletes every `Word` in the list + all users' progress → the add endpoint must always create a **fresh `Word` row** (never link an existing public Word into the personal list), matching the existing personal-word pattern (word_lists.py:343-348: `translation_en = translation_ru = <string>`, `star=1`).
- Translate DB lookup must join `WordList.is_public == True` so private words from other users' personal lists never leak.

## Implementation

- [x] 1. `backend/routers/extension.py` (new) — two endpoints:
  - `GET /api/extension/translate?word=...` — `require_user` (401 anon); validate input (strip, ≤80 chars, ≤4 tokens, must contain letters → 422); DB lookup: `Word` joined via `WordListItem`→`WordList` where `lower(lithuanian)=lower(word)`, `archived=False`, `is_public=True`, prefer `star=1` → `{word, translation_en, translation_ru, source:"db"}`; miss → module-level cache → `_mymemory_translate(word, "lt|en")` (sync httpx, timeout 5s, `None` on any error, optional `de=` contact-email param for larger quota) → 404 if no translation, else `{..., translation_ru: null, source:"mymemory"}`. In-memory cache dict, clear at >2000 entries.
  - `POST /api/extension/words` body `{lithuanian, translation}` — `require_user`; 403 unless `user.is_admin or is_premium_active(user)`; find-or-create `WordList(title="From internet", is_public=False, created_by=user.id, difficulty="easy")`; dedupe by `lower(lithuanian)` within the list → `{id, list_id, already_added:true}`; else create fresh `Word(translation_en=translation, translation_ru=translation, star=1)` + `WordListItem` at `_next_position()` (word_lists.py:73) → `{id, list_id, already_added:false}`.
- [x] 2. `backend/main.py` — import + `app.include_router(extension_router, prefix="/api")` next to the other routers (~line 137).
- [x] 3. `backend/tests/test_extension.py` (new) — patterns from `backend/tests/test_word_lists.py:12-42` (make_token/auth/premium-flip via direct DB session):
  - translate: 401 anon; DB hit returns both translations, source "db"; case-insensitive match; **private-list word of another user is NOT matched**; MyMemory fallback (monkeypatch `_mymemory_translate`) → source "mymemory"; fallback `None` → 404; 422 invalid input; cache prevents second API call.
  - add: 401 anon; 403 non-premium; first add auto-creates "From internet" (`is_public=False`, `created_by`); second word reuses same list (exactly one list); duplicate → `already_added:true`, count unchanged; word visible via existing `GET /api/me/word-lists/{id}`; admin non-premium can add.
- [x] 4. `extension/manifest.json` (new dir, plain JS, no build step) — MV3; permissions `storage, scripting, tabs`; host_permissions `https://fluent.lt/*`, `http://localhost:8000/*`, `http://localhost:3000/*`; content script on `<all_urls>`; background service worker; action popup; options page; icons.
- [x] 5. `extension/background.js` — all backend fetches + token life-cycle. `chrome.storage.local` for token + backend-URL choice (never module-level state — MV3 SW is killed after ~30s idle). Message handlers: `translate`, `addWord` (403→`{error:"premium"}`), `getStatus` (`/api/me/quota` + `/api/auth/me`), `connect`. Connect flow: find/create tab at backend origin `/dashboard`, poll every 2s (≤90s) with `chrome.scripting.executeScript` reading `localStorage.fluent_token`, validate via `/api/me/quota`, store. Any 401 → clear token.
- [x] 6. `extension/content.js` — UI in a closed shadow root (site CSS/CSP isolated). `mouseup` + setTimeout(0): if selection matches Lithuanian-word regex (letters incl. diacritics, 2–80 chars, ≤4 tokens) show 24px icon at selection rect (clamped to viewport). Icon click → popup card: word, spinner → translation / error states; footer button per status: "Add to learn" (premium) / "Upgrade to add" → `{base}/dashboard` pricing / "Connect Fluent". `dblclick` with ctrl/cmd → open popup directly. Dismiss on outside mousedown, Escape, scroll, blur. Skip inside input/textarea/contenteditable.
- [x] 7. `extension/popup.html` + `extension/popup.js` — action popup: Disconnected (Connect button) / Connected (email, premium badge, "Open my lists" → `{base}/dashboard/lists`, Disconnect). Reacts to `chrome.storage.onChanged`.
- [x] 8. `extension/options.html` + `extension/options.js` — Production (`https://fluent.lt`, default) vs Local dev (`http://localhost:8000`) radio; switching clears stored token (different JWT secrets per env).
- [x] 9. `extension/icons/icon{16,32,48,128}.png` — generated from `frontend/public/favicon.svg` (sips/rsvg one-off; commit only PNGs).
- [x] 10. `extension/README.md` — load-unpacked instructions, dev toggle, manual smoke checklist.

## Validation

- [x] Backend unit: `cd backend && python -m pytest tests/test_extension.py -q`
- [x] Full backend suite: `python -m pytest -q` (no regressions)
- [x] Restart local server; verify basic flow + UI intact (nav, header/footer, login) per CLAUDE.md — verified 2026-08-04: landing/lists/grammar/practice all intact, authenticated header shown, footer present
- [ ] Manual extension smoke (documented in extension/README.md): load unpacked → options=Local dev → Connect → login → select word → icon → translation (one DB word, one MyMemory word) → ctrl+dbl-click works → premium add creates "From internet" visible at `/dashboard/lists` → duplicate shows "Already in your list" → non-premium sees "Upgrade to add" → Disconnect shows "Connect Fluent" — **left for the user: requires loading the unpacked extension in a real Chrome profile.** API side already verified end-to-end via logged-in browser: translate DB hit (namas→house/дом), live MyMemory fallback (nesuprantamiausias→"most incomprehensible"), non-premium add → 403
- [x] Auth gates: anon translate → 401; non-premium add → 403 (pytest + live curl/browser checks)
- [x] Playwright: 351 passed, 6 failed — the same failures reproduce on unmodified main (verified by stashing the change and re-running), i.e. pre-existing and unrelated (premium-banner/quota/phrase-list specs). Real-extension Playwright config deferred as optional follow-up
- [x] News post — skipped per user decision (2026-08-04): no news needed for this feature

## Follow-up: translation language setting

Adds a "Translation language" option (English / Russian / Both, default English) controlling what the MyMemory fallback fetches and what the popup card displays. A DB hit is unaffected — `Word` rows already carry both languages.

- [x] `backend/routers/extension.py` — `GET /extension/translate` gains `lang: str = "en"` query param (`"en" | "ru" | "both"`, else 422). MyMemory-miss path fetches `lt|en` when `lang in ("en", "both")` and `lt|ru` when `lang in ("ru", "both")` via a new `_mymemory_cached()` helper; the in-memory cache is now keyed by `f"{word_lower}|{langpair}"` (still success-only, still cleared at >2000 entries). Response returns `null` for any language not requested or not found; 404 only when *all* requested languages fail.
- [x] `backend/routers/extension.py` — `POST /extension/words`: `ExtensionWordCreate.translation` is now `Optional[str] = None` (alongside the existing `translation_ru`); at least one of the two must be non-empty after strip (else 422), each capped at 200 chars; whichever is missing is mirrored from the other before creating the `Word` row.
- [x] `backend/tests/test_extension.py` — added: invalid `lang` → 422; `lang=ru` fetches only `lt|ru` (asserted via `mock_fn.assert_called_once_with`); `lang=both` fetches both langpairs with distinct values (`side_effect` keyed on langpair); `lang=both` with one langpair failing still returns 200 with the other language `null`; cache is per-langpair (an `en` lookup doesn't satisfy a later `ru` lookup for the same word); POST with only `translation_ru` mirrors it into `translation_en`; POST with both fields omitted → 422. All prior tests kept passing unmodified.
- [x] `extension/options.html` + `extension/options.js` — added a second fieldset "Translation language" with English (default) / Russian / Both radios, persisted as `chrome.storage.local.translationLang`. Changing it does **not** touch the stored token (only switching backend env does that).
- [x] `extension/background.js` — `translate()` now reads `translationLang` from `chrome.storage.local` (default `"en"`) and passes it as the `lang` query param.
- [x] `extension/content.js` — `showCard()`'s translation display now handles either field being `null`: shows `"EN · RU"` when both are present, otherwise whichever single language came back.
- [x] `extension/README.md` — documented the new Options setting.

Validation: `pytest tests/test_extension.py -q` → 20 passed; full `pytest -q` → 160 passed (no regressions); `node --check` clean on `background.js`, `content.js`, `options.js`, `popup.js`.

## Follow-up: choose target list when adding

Lets the user pick which personal list a word is added to, instead of always the auto-created "From internet" list.

- [x] `backend/routers/extension.py` — `ExtensionWordCreate` gains `list_id: Optional[int] = None`. When provided, the list must be owned by the caller (`created_by == user.id`, `is_public == False`, `archived == False`) or the request 404s ("List not found") — implemented by reusing `_get_owned_list` from `routers.word_lists` rather than duplicating its ownership check; that list is used directly (no find-or-create). When omitted, behavior is unchanged (find-or-create "From internet"). Dedupe and response shape (`{id, list_id, already_added}`) are unchanged, just scoped to whichever list was targeted.
- [x] `backend/tests/test_extension.py` — added: `test_add_with_owned_list_id`, `test_add_with_other_users_list_id_404`, `test_add_with_public_list_id_404` (seeded public list id=1), `test_add_without_list_id_still_uses_from_internet`, `test_add_dedupe_is_per_list`.
- [x] `extension/background.js` — implemented (`getLists` message wrapping `GET /api/me/word-lists`; `addWord` forwards `list_id`).
- [x] `extension/content.js` — implemented (`<select>` in `renderFooter`'s premium/admin branch, populated via `getLists`; preselects/persists `chrome.storage.local.lastListId`; degrades to just the button if `getLists` fails).
- [x] `extension/README.md` — documented the list picker.

Validation: `pytest tests/test_extension.py -q` → 25 passed; full `pytest -q` → 165 passed (no regressions); `node --check` clean on all four extension JS files.

## Follow-up: in-app extension page + pricing update

Adds a public, in-app "Chrome extension" page (installation + usage instructions, live version, one-click zip download) so users don't need to know about `chrome://extensions` or the repo layout, plus a line advertising it on the pricing page.

- [x] `backend/routers/extension.py` — two new **public** (no auth) endpoints: `GET /extension/info` → `{"version": ...}` read live from `extension/manifest.json` (404 if missing); `GET /extension/download` → in-memory zip of the whole `extension/` folder built per request (excludes `README.md` and dotfiles), entries rooted under `fluent-extension/`, returned as `application/zip` with `Content-Disposition: attachment; filename="fluent-extension-<version>.zip"`. Extension dir resolved as `Path(__file__).resolve().parent.parent.parent / "extension"` (verified: `backend/routers/extension.py` → `backend/routers` → `backend` → repo root → `extension/`).
- [x] `backend/tests/test_extension.py` — added: `/extension/info` returns the same version as `extension/manifest.json`; `/extension/download` returns 200 + `application/zip` + a `Content-Disposition` containing the version; the zip (opened via `zipfile`/`io.BytesIO`) contains `fluent-extension/manifest.json` and `fluent-extension/content.js` and no `README.md`; both endpoints work with zero `Authorization` header anywhere in the test.
- [x] `frontend/lib/i18n/types.ts` + `ru.ts` + `en.ts` — new `extension` section (title, subtitle, `versionLabel`/`versionLoading`, `downloadBtn`, `installTitle`/`installSteps`, `usageTitle`/`usageSteps`, `connectNote`, `premiumNote`, `fromInternetNote`, `viewListsLink`); one line appended to `pricing.premiumFeatures` in both languages advertising the extension.
- [x] `frontend/app/extension/layout.tsx` (metadata) + `page.tsx` (`'use client'`) — new page following the `layout.tsx`-has-metadata / `page.tsx`-is-client convention used by `settings/`, `lists/`, `vocabulary/`. Fetches `${BACKEND_URL}/api/extension/info` client-side for the version line (silently stays on the loading label on error), download button links to `${BACKEND_URL}/api/extension/download`, numbered install/usage steps, and a "From internet" note linking to `/dashboard/lists`. All copy via `useT()`.
- [x] `frontend/app/dashboard/premium/page.tsx` — added a small `🧩 Расширение для Chrome →` link to `/extension` at the bottom of the existing centered column (this page predates the `useT()` i18n convention and is hardcoded Russian, so the new link matches that in plain Russian rather than introducing i18n to an otherwise non-i18n page).
- [x] `frontend/tests/extension-page.spec.ts` (new) — fake-JWT pattern from `personal-word-lists.spec.ts`; mocks `/api/me/quota` and `/api/extension/info` (→ `{"version":"9.9.9"}`); asserts the page loads, an `<h1>` is visible, "9.9.9" is visible, the download link's `href` ends in `/api/extension/download`, and `header` (nav) still renders. A second test visits `/pricing` (no auth) and asserts the new RU feature line is visible (RU is the default `useLang()` state).
- [x] `plans/plan_chrome-extension.md` — this section.

Validation: `pytest tests/test_extension.py -q` → 28 passed; full `pytest -q` → 168 passed (no regressions); `npm run build` → succeeded (static export unaffected); `npx playwright test tests/extension-page.spec.ts` → see run notes below.

## Risks / gotchas

- **MyMemory quota**: all fallback calls come from one server IP (~free anonymous quota). Mitigated by DB-first, cache, strict validation, `de=` email param. Per-user daily cap deferred until abuse appears.
- **JWT 7-day expiry** (auth.py:88): 401 anywhere clears the token; both UIs degrade to "Connect Fluent" — one-click reconnect.
- **Local dev token origin**: with frontend dev server on :3000, the token lives under the :3000 origin; connect flow polls the configured backend origin — README documents "log in via :8000" for local testing (or poll both localhost origins).
- Hostile pages may remove injected DOM — acceptable edge case.
