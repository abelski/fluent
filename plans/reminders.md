# Reminders

Dated follow-ups that must not get lost between sessions. A SessionStart hook
(`.claude/hooks/reminders.py`) shows every line due within 3 days at the start of each session.
Format: `- YYYY-MM-DD — what to do (#N)`. Delete a line when it's done.

- 2026-10-24 — /seo: #48c RU-traffic check — RU article clicks/positions vs 2026-10-03 and Google-chosen canonical of 3–5 RU articles. Decides #48d and unblocks #58a (#48c)
- 2026-10-24 — #58a rollout, only if the #48c check is OK: plan_58a Rollout steps 10–15 (review Lithuanian, import phrase program, list script --apply, import 2 articles, deploy) (#58a)
- 2026-11-14 — write plan_58b (cases/numbers titles, Sėkmės description, Regitra questions, numbers-05 back-link), if #58a went live ~2–3 weeks ago (#58b)
- 2026-10-24 — plan #59b (home page SSR + /en/ home + Yandex region): /sdlc-feature-analyst on idea_59, after the #48c check (#59)
- 2026-10-20 — /seo: IndexNow effect — Yandex pages in search > 43, Bing impressions > 2/week, vs seo-log 2026-10-06 (#59a)
- 2026-10-22 — compare basic-lesson first-attempt pass rate (>75%) 2 weeks before vs after #60 from GrammarLessonResult; date is a placeholder (today + 14d), move it to release date + 14d once #60 ships (#60)
- 2026-10-24 — #62e: A2 article update, once #62b–#62e are all released (#62e)
- 2026-10-24 — #62f: append «Потренируйтесь в Fluent» / "Practise in Fluent" to būdvardžiai-linksniavimas (keep first 160 chars), after the #48c check (#62f)
- 2026-10-24 — #62h: append «Потренируйтесь в Fluent» / "Practise in Fluent" to numbers-03-time (keep first 160 chars); ask the user about «dvylikos» → «dvyliktos» in the hours table, after the #48c check (#62h)
- 2026-10-17 — #66 release: on prod apply migration a9b0c1d2e3f4 (practice_test.title_lt) BEFORE deploying the code, then `backend/scripts/fix_practice_titles_66.py --dry-run`, review (check the restored Lithuanian reading titles), then `--apply`; date is a placeholder — move it to the release day (#66)
