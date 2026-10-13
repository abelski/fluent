---
number: 65
slug: admin-batch-publish
status: draft
---

# Idea #65 — Admin: publish practice tests in bulk

## Problem
Every #62 slice seeds its tests as `testing`, and the admin publishes them one by one in the admin
panel (5 for #62e, 8 for #62d, 10 for #62c). With many tests that is slow and error-prone.

## Rough idea
Select several tests (or a whole category) in the admin panel and set their status in one action
(`testing` → `published`, and back for rollback). Validation server-side, admin only.

## Status
Raised by the user on 2026-10-13 during #62e, parked as a future idea. Not grilled yet — run
`/sdlc-brainstorm plans/ideas/idea_65_admin-batch-publish.md` before planning.
