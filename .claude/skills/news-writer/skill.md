---
name: news-writer
description: Draft and publish news posts for the Fluent app. Writes bilingual (RU + EN) posts, saves as draft, shows preview, and publishes on user approval.
---

Write a bilingual news post for the Fluent app.

## Context

News posts are stored in the `news_post` table in the Neon PostgreSQL database.
Connection string: read `DATABASE_URL` from `backend/.env`.

### Table: `news_post`

| Column | Type | Notes |
|---|---|---|
| `id` | int | auto PK |
| `title_ru` | text | Russian title |
| `title_en` | text | English title |
| `body_ru` | text | Russian body (plain text, no markdown) |
| `body_en` | text | English body (plain text, no markdown) |
| `published_at` | timestamp | set to NOW() on creation |
| `published` | bool | `false` = draft, `true` = live |
| `created_at` | timestamp | set to NOW() on creation |

## Phase 1 — Draft the content

If `$ARGUMENTS` describes what to write, use that as the brief.
Otherwise use `AskUserQuestion` to ask: "What should the news post be about?"

Write bilingual content (RU + EN). Guidelines:
- Tone: friendly, encouraging, first-person plural ("Мы добавили..." / "We added...")
- Length: 2–4 sentences per language
- Body: plain text only, no markdown, no bullet points
- Highlight the user benefit clearly
- Sound human, not AI-generated. Avoid the usual tells:
  - No em-dashes or " — " dashes in the body; use plain periods and commas.
  - Skip marketing cadence and clichés ("just like", "whether you're...", "seamless", "effortless", "take your learning to the next level", "we're excited to").
  - Avoid rule-of-three lists and overly parallel, polished sentences.
  - Keep it plain and concrete: say what changed and what the user can now do. Short, direct sentences read as human.

Show the draft to the user in chat:

```
**RU:** <title_ru>
<body_ru>

**EN:** <title_en>
<body_en>
```

Then use `AskUserQuestion` to ask:
- Question: "How does the draft look?"
- Options: "Approve — save as draft", "Revise — I have corrections"

If "Revise": ask for corrections, update the draft, show it again, ask again. Repeat until approved.

## Phase 2 — Save as draft

Read `DATABASE_URL` from `backend/.env`, then run:

```bash
psql "<DATABASE_URL>" -c "
INSERT INTO news_post (title_ru, title_en, body_ru, body_en, published_at, published, created_at)
VALUES (
  '<title_ru>',
  '<title_en>',
  '<body_ru>',
  '<body_en>',
  NOW(),
  false,
  NOW()
) RETURNING id;
"
```

Single-quote escaping: replace `'` with `''` inside SQL string values.

Confirm to the user: "Draft saved (id=N, published=false)."

## Phase 3 — Publish on approval

Use `AskUserQuestion` to ask:
- Question: "Publish now?"
- Options: "Yes — publish", "No — keep as draft"

If "Yes — publish", run:

```bash
psql "<DATABASE_URL>" -c "UPDATE news_post SET published = true WHERE id = <id>;"
```

Confirm: "Published. Post is now live."

If "No — keep as draft": confirm the draft is saved and stop.

## Notes

- Never hard-code DATABASE_URL — always read from `backend/.env`
- Do not modify or delete existing news posts unless explicitly asked
- If psql fails, show the error and suggest a fix (most common issue: unescaped single quotes in body text)
