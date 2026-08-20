# Shared application constants.
# Import from here rather than duplicating values across routers.

# Max study sessions per day for basic (non-premium) users.
DAILY_LIMIT = 10

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
