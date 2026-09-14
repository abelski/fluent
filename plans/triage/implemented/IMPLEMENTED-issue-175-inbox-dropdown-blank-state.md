---
kind: bugfix
status: done
iteration: 1
max_iterations: 16
suggested_model: sonnet
suggested_effort: low
confirmed_model: sonnet
confirmed_effort: low
---

# Issue #175 — /dashboard/inbox/

**Reported:** 2026-09-13 18:25:33
**Status:** open
**Description:** Когда кликаешь на "конверт" в шапке - выпадает пустой список

## Root cause
Frontend UI issue, not a backend bug (hypothesis checked by execution, not just reading).

Prod DB: reporter `13a14ec2-…` is Premium, lang=en, and has **0** `inbox_delivery` rows. Only 2
messages exist: #1 audience `users:1` (0 deliveries), #2 audience `free` (135 deliveries). So their
inbox is genuinely empty.

Backend checked by running it (TestClient + SQLite, `conftest.py` setup) for a zero-delivery user:
`GET /api/me/inbox/unread-count` → `200 {"unread":0}`, `GET /api/me/inbox?limit=5&offset=0` →
`200 {"items":[],"has_more":false,"unread":0}` cold and cached. `tests/test_inbox.py`: 66 passed (no
empty-inbox test exists). 8 of 135 prod deliveries have `read_at` set, so the endpoints work in prod.
Render logs were not checked, so a one-off fetch failure is not fully ruled out.

`frontend/components/InboxMenu.tsx`: the "Входящие" header and "Все сообщения" footer always render,
and none of the three body states reads as a clear message:

| State | Renders (lines) | User sees |
|---|---|---|
| Loading (cold Neon ~0.5s+) | `…` in `text-faint` 13px (159–161) | effectively blank |
| Fetch failed | `.catch(() => {})` (92) leaves `items` null → nothing | truly blank, no error branch |
| Success, empty (this user) | "Нет сообщений" small muted (162–164) | thin line, reads as an empty list |

i18n is fine: `inbox.empty`, `loadError`, `retry` exist in both `en.ts` and `ru.ts` (833–835).

Open question for the user: the complaint may also be "I'm Premium and my inbox is useless" — the
only broadcast went to `free`. This plan only fixes the blank dropdown; it does not send anything.

Suggested sonnet/low: one component, ~10 changed lines, existing i18n keys, pattern copied from
`app/dashboard/inbox/page.tsx`.

## Fix plan
- [x] 1. In `frontend/components/InboxMenu.tsx`, add `const [failed, setFailed] = useState(false);`. In `toggle()`, call `setFailed(false)` before `fetchInbox` and change the catch to `.catch(() => setFailed(true))`.
- [x] 2. Replace the faint `…` loading line (159–161) with one skeleton row copied from `app/dashboard/inbox/page.tsx:218-226` (`px-4 py-4` wrapping `h-3.5 w-1/2 rounded bg-[#f2f3f3] animate-pulse`), `data-testid="inbox-dropdown-loading"`.
- [x] 3. Replace the empty-state block (162–164) with `{!loading && !items?.length && (<p data-testid="inbox-dropdown-empty" className="px-4 py-6 text-center text-[13.5px] text-muted">{failed && !items ? tr.inbox.loadError : tr.inbox.empty}</p>)}`. A failed refetch with old items loaded keeps the old items; reopening retries because `items` stays null. No mascot in the dropdown (`inbox.md` limits `PageMascot` to the full page). Keep request discipline unchanged (no fetch on navigation, 60s reuse window).
- [x] 4. Update the header comment ("Every failure is silent…"): still silent for the badge, but the open dropdown now shows failures.
- [x] 5. Add one sentence to "Dropdown preview" in `documentation/design system/Component Library (as-built).html` (loading = skeleton row; empty/error = centred muted 13.5px text via `inbox.empty` / `inbox.loadError`), and a `documentation/CHANGELOG.md` entry.

## Tests
- [x] Write Playwright tests in the `Dropdown` describe of `frontend/tests/inbox.spec.ts` (reuse `setFakeToken`, `mockListsPage`, `mockInbox`; default lang RU): (a) empty — `mockInbox(page, { items: [] })`, open `/dashboard/lists`, click `inbox-button`, expect `inbox-dropdown-empty` visible with "Нет сообщений" and 0 `inbox-dropdown-item`; (b) failed — one `page.route('**/api/me/inbox**', …)` returning `{ unread: 0 }` for `/unread-count` and `500` otherwise (do NOT also call `mockInbox`; overlapping routes break, latest wins), open the envelope, expect `inbox-dropdown-empty` with "Не удалось загрузить сообщения". Confirm (b) fails against the pre-fix code.
- [x] Add a backend assert in `backend/tests/test_inbox.py`: a brand-new user's `GET /api/me/inbox` returns `{"items": [], "has_more": False, "unread": 0}`; run `cd backend && .venv/bin/python -m pytest tests/test_inbox.py -q`.
- [x] Run: `cd frontend && npm run build && npx playwright test tests/inbox.spec.ts tests/inbox-buttons.spec.ts tests/design-system-parity.spec.ts --reporter=list`

## Definition of Done

```bash
cd frontend && npx playwright test --reporter=list
```

## Confirm resolution
Ask the user: "Issue #175 — Когда кликаешь на "конверт" в шапке - выпадает пустой список. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 175;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-175-inbox-dropdown-blank-state.md` → `plans/triage/implemented/IMPLEMENTED-issue-175-inbox-dropdown-blank-state.md`).
