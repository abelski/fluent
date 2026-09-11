# Read caching (#24) — how `backend/cache.py` works and why

Neon bills **network transfer**, and #15 burned the free-tier 5GB/month quota. The database
itself is tiny; the cost is re-reading the same small tables on every request. Every verb-lesson
task request pulled the whole 1.3MB `verb` table; the footer pulled full article rows, bodies
included, to print a few titles; the practice pages pulled every `PracticeTest` row just to count
them. `backend/cache.py` is the one mechanism all of that now goes through.

Caching also cuts latency: Neon is `us-east-1`, Render defaults to Oregon, and each round trip
costs ~0.2–0.3s in production (`production-db-latency.md`).

## The shape of it

```python
import cache

value = cache.get_or_load(
    ("news", limit, offset),         # key — any hashable tuple
    lambda: [...],                   # loader — returns PLAIN DATA
    tags={"news_post"},              # what invalidates it
    ttl=600,                         # optional, default 10 min
    store_if=lambda v: v is not None # optional, refuse to cache
)
```

Rules, all of them load-bearing:

- **Cached values are plain data** — dicts, tuples, `SimpleNamespace`. Never ORM instances: they
  belong to a session that closes at the end of the request.
- **Every read returns a `copy.deepcopy`.** That's what makes it safe for `/lists/{id}` to bolt a
  per-user `status` onto each cached word dict without leaking it into the next user's response.
- The loader runs **outside** the lock. Concurrent misses may load twice; that's cheaper than
  single-flight machinery and produces the same value.
- Stdlib only: a `dict`, a `threading.Lock`, and SQLAlchemy events. No Redis.

## Invalidation happens by itself

Nothing calls "clear the article cache". A SQLAlchemy `Session` class-level listener watches
every write the app commits and turns it into eviction tags.

| Write | Tags emitted |
|---|---|
| ORM flush of a row (`session.add` / mutate / `session.delete`) | `t`, `t:pk=<pk>`, and `t:user=<user_id>` if the model has a `user_id` |
| Core or textual DML (`update()`, `delete()`, `text("UPDATE …")`) | `t:*` |
| Either, with `.execution_options(cache_tags={…})` | exactly those tags |

And on the read side, an entry tagged:

- `t` holds whole-table data — evicted by any write to `t`.
- `t:pk=5` or `t:user=abc` holds one row's worth — evicted by a write to *that* row, or by any
  Core/textual DML on `t` (which can't tell us which rows it touched).

That asymmetry is the point: a single-row flush emits a bare `t` that only clears whole-table
entries, so one user answering a question doesn't wipe every other user's per-user entry. A bulk
`UPDATE` emits `t:*` and clears everything for that table, because it has to.

**Tags are applied on `after_commit`, discarded on `after_rollback`.** Never before the commit —
evicting early would let a concurrent reader load the *old* rows and re-cache them after the
eviction.

### The stale-refill guard

There's still a race: a reader loads pre-commit rows, a writer commits and evicts, and the reader
then stores what it read. `get_or_load` snapshots a per-table version counter before calling the
loader; every applied eviction bumps it. If any of its tables changed while the loader ran, the
result is served to that caller but **not stored**.

### TTL is the safety net, not the mechanism

Anything that writes from *outside* this process is invisible to the listeners:

- seed/backfill scripts and Alembic (own engine, own process);
- the other instance during a zero-downtime deploy, which briefly runs alongside the new one.

Default TTL is 10 minutes, so: **after running a seed script against production, changes appear
within 10 minutes — or restart the service.** The auth user entry uses 60s because it carries
security-relevant flags.

## What must never be cached

- **Progress rows** — `user_word_progress`, `user_phrase_progress`, grammar results. They change
  on every answer.
- **Anything relative to `now`** — `/me/stats`, streaks, the activity calendar, due counts, review
  queues, continue-session pools (they join against progress). Rule: cache the *inputs*, compute
  the time-dependent result per request.
- **Admin GET endpoints.** Admins need fresh data and their traffic is tiny. Admin *writes* still
  drive invalidation. The one exception is `GET /admin/settings/cefr-thresholds`, which is public
  and read on page loads.
- **Permission and visibility decisions.** `_can_access_list`, practice test `status`/`is_admin`
  visibility and premium checks all still run per request — on cached data, never instead of it.

## Adding a new cached read

1. Write a loader that returns plain data and nothing per-user.
2. Tag it with every table it reads. Whole-table data → bare table names. One user's rows →
   `f"{table}:user={user_id}"`.
3. Keep the per-user join, the sampling, the `now` comparison and the permission check in the
   handler, outside the loader.
4. Add a warm-call statement-count test and an invalidation-through-the-real-write-endpoint test
   to `backend/tests/test_cache_endpoints.py`.

`cache.enrollment_ids(session, Model, Model.some_id_column, user_id)` already does the standard
"what is this user enrolled in" shape for all four enrollment tables.

## Known ceilings

- **Per process.** `render.yaml` starts one uvicorn worker, so one process holds the whole cache.
  If Render ever runs more than one instance, either move to a shared cache or accept TTL-bounded
  divergence between them.
- **No row-level tags for `word`.** Any `word` write — including lazy verb enrichment and personal
  words — evicts every word-list entry. Deliberate: the table is small and the alternative is
  tracking which lists each word belongs to.
- **`_list_words` only caches settled lists.** A list containing a word whose `part_of_speech` is
  still `NULL` is never stored, otherwise `lazy_enrich_words` would never run for it again.
- **Eviction is a linear scan** over at most 5000 entries. Microseconds against a 200ms round trip.
- **Tests that write through a raw engine connection** bypass the Session listeners entirely and
  must call `cache.clear()` themselves. `backend/conftest.py` clears the cache around every test.

## Results

Warm-call statement counts pinned by `backend/tests/test_cache_endpoints.py`: `/api/news`,
`/api/footer-articles`, `/api/articles`, `/api/articles/{slug}`, `/api/me/quota`,
`/api/practice/categories`, `/api/practice/tests/{id}/exam`, `/api/practice/constitution/exam`,
`/api/grammar/lessons` and `/api/phrase-programs` (unenrolled) all hit the database **zero** times
when warm — the authenticated user lookup included.

Neon "Data transfer", 7 days before vs. 7 days after deploy: _to be recorded after deploy._

See also: `production-db-latency.md`, changelog entries #15 and #24.
