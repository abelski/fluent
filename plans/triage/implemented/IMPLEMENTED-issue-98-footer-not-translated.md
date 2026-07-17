# Issue #98 — /dashboard/lists/

**Reported:** 2026-05-26 19:25:15
**Status:** open
**Description:** app lang is english but i see Условия использования / О команде / Конфиденциальность и GDPR / Написать нам

## Root cause

The Footer and FeedbackModal components are not wired into the `useT()` / `useLang()` i18n system that the rest of the app uses (see [LandingClient.tsx](frontend/app/LandingClient.tsx) and [settings/page.tsx](frontend/app/dashboard/settings/page.tsx) for the pattern).

Two specific defects in [frontend/components/Footer.tsx](frontend/components/Footer.tsx):

1. **L37** — `{a.title_ru}` is hardcoded. The API already returns both `title_ru` and `title_en` (confirmed against `article` table: `about-team` → "About the Team", `privacy-gdpr` → "Privacy & GDPR", `terms-of-service` → "Terms of Service"), but the component never reads `title_en`.
2. **L45** — `Написать нам` is a hardcoded literal. The translation key `tr.common.contactUs` already exists in both [en.ts:61](frontend/lib/i18n/en.ts#L61) ("Contact us") and [ru.ts:61](frontend/lib/i18n/ru.ts#L61) ("Написать нам") but isn't used.

[frontend/components/FeedbackModal.tsx](frontend/components/FeedbackModal.tsx) has the same problem — every visible string is a Russian literal (modal heading, hint, placeholders, buttons, success/error messages). No translation keys exist yet for these.

## Fix plan

1. **Footer.tsx** — convert to use `useT()`:
   - Import `useT` from `../lib/useT`.
   - Destructure `{ tr, lang }` inside the component.
   - Render `lang === 'en' ? a.title_en : a.title_ru` for each footer link.
   - Replace the hardcoded `Написать нам` button text with `{tr.common.contactUs}`.

2. **i18n** — add a new `feedback` section to [types.ts](frontend/lib/i18n/types.ts), [en.ts](frontend/lib/i18n/en.ts), [ru.ts](frontend/lib/i18n/ru.ts) covering: `title` (Contact us / Написать нам), `subtitle` ("Tell us what you think — we read every message" / "Расскажите, что думаете — мы читаем каждое сообщение"), `emailPlaceholder` (Your email / Ваш email), `messagePlaceholder` (Your message / Ваше сообщение), `cancel` (already exists in `common.cancel` — reuse), `send` (Send / Отправить), `sending` (just `...` is language-neutral — leave as-is), `sent` (Message sent! / Сообщение отправлено!), `error` (Send failed / Ошибка отправки).

3. **FeedbackModal.tsx** — convert to use `useT()`:
   - Import and call `useT` to get `{ tr }`.
   - Replace every hardcoded Russian string with the new `tr.feedback.*` keys (and `tr.common.cancel` for the cancel button).
   - Use `tr.feedback.error` as the default fallback in both `throw new Error(...)` and `catch` branches.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue.
   - Set `fluent_lang` to `en` in localStorage before navigating.
   - Visit a dashboard page, scroll to footer, assert that the visible link names are the English titles ("Terms of Service", "About the Team", "Privacy & GDPR") and the contact button reads "Contact us".
   - Open the modal and assert the heading is "Contact us" and buttons are in English.
   - Repeat with `fluent_lang` = `ru` to confirm the Russian path still works.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #98 — app lang is english but footer shows Russian. Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 98;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (e.g. `issue-98-footer-not-translated.md` → `plans/triage/implemented/IMPLEMENTED-issue-98-footer-not-translated.md`).
