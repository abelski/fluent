# Shared application constants.
# Import from here rather than duplicating values across routers.

# Max study sessions per day for basic (non-premium) users.
# Lowered 10 → 5 in #25. Measured on production 2026-09-13: for non-premium users the
# daily session count is p50=3, p75=9, p90=10, so at 10 the wall almost never fired
# (16 users blocked in 90 days). At 5 the median free day (3 sessions) is still
# untouched while blocked users rise to 27. 3 was rejected — it blocks the median day,
# and day-1 retention is already the weakest part of the funnel.
# See documentation/premium-conversion.md.
DAILY_LIMIT = 5

# Word programs (SubcategoryMeta keys) every new account is auto-enrolled in,
# so the dashboard isn't empty on first login. Keys missing from the DB or not
# published are skipped silently.
DEFAULT_WORD_PROGRAM_KEYS = ["a1_a2_basics"]

# SM-2 "mature" threshold: a word counts as mature once the user has answered it
# correctly this many times in a row *and* it has reached status "known".
# Mature words open the study card on the typing stage with no answer-revealing
# flashcard (see documentation/review-flow-stage-graph.md). 3 is where SM-2's own
# interval curve leaves the fixed 1-day / 6-day ramp and starts multiplying by the
# ease factor — i.e. the first point at which the algorithm itself treats the word
# as retained rather than still being introduced.
MATURE_WORD_REPS = 3

# CEFR level → words-known threshold. Seeded into AppSetting['cefr_thresholds'] at
# startup and editable by admins; this list is the fallback whenever that row is
# missing. Lives here so main.py (seeding) and inbox_service.py (achievements)
# share one definition.
DEFAULT_CEFR_THRESHOLDS = [
    {"level": "0",  "threshold": 0},
    {"level": "A1", "threshold": 500},
    {"level": "A2", "threshold": 1000},
    {"level": "B1", "threshold": 2000},
    {"level": "B2", "threshold": 4000},
    {"level": "C1", "threshold": 8000},
    {"level": "C2", "threshold": 16000},
]
