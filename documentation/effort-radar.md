# Effort radar (#56)

Plan: `plans/improvements/active/plan_55-56_bento-effort-radar.md` (Part B). Code:
`backend/routers/words.py` (`GET /me/effort`), `frontend/components/EffortRadar.tsx`, placed under
`<Leaderboard />` in `app/LandingClient.tsx`.

## Decisions

- **Points, not time.** The card splits the user's *leaderboard points* by section. Time per section is
  not tracked anywhere; points already exist and match what the leaderboard shows. The weights skew to
  words (every word row scores), which is why the radius is square-root (below).
- **Practice excluded.** Three axes: words, phrases, grammar. Practice exam points are rare and binary;
  a fourth axis would be empty for most users and turn the triangle into a spike.
- **Square-root radius** `r = R·√(share/100)`. Word points usually dominate (60–80%); on a linear scale
  phrases/grammar collapse into the centre. Square root keeps the order and makes small shares visible.
  The exact percentages are always printed (table, tooltip), so the distortion never hides a number.
- **Validated colours.** This week = `emerald-700` (existing token), all time = new token `effort-all`
  `#5cbf8f`. Checked with the dataviz palette validator on a white surface: distinguishable, contrast WARN
  on the lighter green — hence values as text everywhere, and the all-time layer drawn underneath.
- **One round trip.** A `UNION ALL` of two selects over `build_leaderboard_score_joins(current_week_bounds())`
  and `build_leaderboard_score_joins(None)`, `WHERE u.id = :uid`. Neon costs ~0.2 s per round trip from
  Render, so two queries would double the latency of a card on the home page.
- **No caching.** Progress and now-relative (the current week) — the CLAUDE.md caching rule.
- **Separate `/me/effort`, not folded into `/me/stats`.** `/me/stats` was trimmed for egress in #15 and
  runs on several pages; the radar needs it on the home only. One extra request, fired in parallel with
  the others the home page already makes.
- **Card hidden** without a token, while loading, on error, or when all-time points are all zero — an
  empty radar teaches nothing. No week points → all-time layer only, plus a note.
