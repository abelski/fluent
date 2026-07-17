# Issue #146 — /dashboard/lists/

**Reported:** 2026-07-17 15:54
**Status:** open
**Description:** думаю что вновь созданным пользователям нужно сразу энролить какую-то базовую программу слов и словарь фраз разговорник (auto-enroll new users into a basic word program and a phrasebook phrase program so the dashboard isn't empty on first login)

## Root cause
No onboarding/auto-enrollment logic exists. New users are created in two places in `backend/auth.py`: `google_callback()` (~line 180, main OAuth path) and `require_user()` (~line 62, fallback auto-create for a valid JWT with no user row). Neither enrolls the user into anything, so `/dashboard/lists` (renders only enrolled word programs via `GET /api/me/programs` and phrase programs with `enrolled: true`) is empty on first login.

Enrollment mechanics already exist:
- **Word programs**: `UserProgram(user_id, subcategory_key)` row — `enroll_program()` in `backend/routers/words.py` (~line 1164), key matches `SubcategoryMeta.key`.
- **Phrase programs**: `UserPhraseProgramEnrollment(user_id, program_id)` row — `enroll_phrase_program()` in `backend/routers/phrases.py` (~line 550).

Production defaults (verified in DB): word program `subcategory_meta.key = "a1_a2_basics"` ("Базовый словарь на A1-A2", published, most-enrolled). Phrase programs: only id 11 "Sékmės! A1.1 — Фразы" (difficulty 1) and id 12 (A1.2); id 11 is the natural starter.

**Selection strategy**: word default via stable config constant `DEFAULT_WORD_PROGRAM_KEYS = ["a1_a2_basics"]` (keys are stable strings; skip silently if missing). Phrase default via heuristic: public program with lowest `difficulty`, tie-break lowest `id` (→ id 11 today); no fragile hardcoded id.

**Scope**: strictly at account creation. Re-enrolling zero-enrollment users on login would override deliberate unenrollment. Existing empty-dashboard users can be backfilled later with one-off SQL if desired.

## Fix plan
1. `backend/constants.py` — add `DEFAULT_WORD_PROGRAM_KEYS = ["a1_a2_basics"]`.
2. New `backend/onboarding.py` with `enroll_default_programs(user, session)`:
   - For each key in `DEFAULT_WORD_PROGRAM_KEYS`: if a published `SubcategoryMeta` with that key exists and no `UserProgram` row exists for (user, key), add one.
   - Phrase default: `select(PhraseProgram).where(is_public).order_by(difficulty, id)` → first; add `UserPhraseProgramEnrollment` if not already enrolled.
   - Wrap in try/except with a log line so onboarding can never break login; commit to match call-site style.
3. `backend/auth.py` — call the helper at both user-creation points, after `session.commit()`/`refresh` so `user.id` is set: the new-user branch of `google_callback()` (~lines 180–182) and the auto-create block in `require_user()` (~lines 61–69). No changes to existing-user logins.
4. Frontend — no changes; `/dashboard/lists` and phrase program `enrolled` flags render the defaults automatically.
5. Optional follow-up (not v1): admin-configurable `AppSetting` overrides (`default_word_program_keys` / `default_phrase_program_id`) via the generic settings endpoints in `routers/admin.py` (~lines 1271–1297).

## Tests
1. New `backend/tests/test_auto_enroll.py` (patterns from `tests/test_programs.py`; seed a published `SubcategoryMeta(key="a1_a2_basics")` and a public `PhraseProgram(difficulty=1)` in the test DB):
   - new user → `GET /api/me/programs` contains `a1_a2_basics`;
   - new user → `GET /api/phrase-programs` shows the seeded program `enrolled: true`;
   - nonexistent default key → login still works, no rows created;
   - user who unenrolled is NOT re-enrolled on next request.
   Check other suites for fresh-user empty-enrollment assumptions (the phrase heuristic may pick up programs seeded elsewhere).
2. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (mock `/api/me/programs` + `/api/phrase-programs` as a fresh user would see them and assert the dashboard renders the default programs).
3. Rebuild the frontend and restart the local server.
4. Run the new tests and confirm they pass.
5. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #146 — auto-enroll new users into a basic word program + starter phrase program. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 146;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-146-auto-enroll-new-users-basics.md` → `plans/triage/implemented/IMPLEMENTED-issue-146-auto-enroll-new-users-basics.md`).
