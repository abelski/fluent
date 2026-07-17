# Shared application constants.
# Import from here rather than duplicating values across routers.

# Max study sessions per day for basic (non-premium) users.
DAILY_LIMIT = 10

# Word programs (SubcategoryMeta keys) every new account is auto-enrolled in,
# so the dashboard isn't empty on first login. Keys missing from the DB or not
# published are skipped silently.
DEFAULT_WORD_PROGRAM_KEYS = ["a1_a2_basics"]
