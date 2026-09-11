"""In-process read cache for shared, admin-edited content (#24).

Why: Neon bills network transfer and the app re-reads the same small tables on
every request (the whole `verb` table per grammar task, article bodies for a
footer, practice tests just to count them...). See documentation/caching.md.

How it stays correct: entries carry *tags* naming the tables they came from, and
a SQLAlchemy `Session` class-level listener turns every committed write into a
set of tags to evict. No caller has to remember to invalidate anything.

# ponytail: per-process dict, sized for one uvicorn worker (render.yaml starts
# exactly one). If Render ever runs >1 instance, move to a shared cache (Redis)
# or accept TTL-bounded staleness across instances.
"""

import copy
import re
import threading
import time
from typing import Any, Callable, Iterable

from sqlalchemy import event, inspect as sa_inspect, select
from sqlalchemy.orm import Session as _Session
from sqlalchemy.sql.elements import TextClause

DEFAULT_TTL = 600          # 10 min — safety net for writes the listeners can't see
MAX_ENTRIES = 5000

_lock = threading.Lock()
# key -> (value, expires_at, tags)
_store: dict[tuple, tuple[Any, float, set[str]]] = {}
# table name -> number of evictions applied to it (stale-refill guard)
_versions: dict[str, int] = {}
_epoch = 0                 # bumped by clear()

_SESSION_INFO_KEY = "_cache_tags"
_TEXT_DML = re.compile(r'^\s*(insert\s+into|update|delete\s+from)\s+"?(\w+)', re.IGNORECASE)


def _now() -> float:
    """Indirection so tests can monkeypatch the clock for TTL assertions."""
    return time.monotonic()


def _table_of(tag: str) -> str:
    return tag.split(":", 1)[0]


# ── Public API ───────────────────────────────────────────────────────────────

def get_or_load(
    key: tuple,
    loader: Callable[[], Any],
    *,
    tags: Iterable[str] | Callable[[Any], Iterable[str]],
    ttl: float = DEFAULT_TTL,
    store_if: Callable[[Any], bool] | None = None,
) -> Any:
    """Return the cached value for `key`, or call `loader()` and cache it.

    `loader` must return **plain data** (dicts / tuples / SimpleNamespace) — never
    live ORM instances, which would be bound to a closed session. Every read
    returns a `copy.deepcopy`, so callers may freely mutate what they get back.

    `tags` is an iterable of tag strings, or a callable receiving the loaded value
    (for tags that depend on the row, e.g. `user:pk=<id>`).
    `store_if(value) -> bool` lets a caller refuse to cache a value it considers
    incomplete (e.g. a word list that hasn't finished lazy enrichment yet).
    """
    now = _now()
    with _lock:
        hit = _store.get(key)
        if hit is not None:
            if hit[1] > now:
                return copy.deepcopy(hit[0])
            del _store[key]
        before_versions = dict(_versions)
        before_epoch = _epoch

    # Loader runs outside the lock: it does I/O (a Neon round trip) and must not
    # block every other reader.
    # ponytail: no single-flight — concurrent misses may load twice. Harmless
    # (same value), and adding per-key locks costs more than the duplicate read.
    value = loader()

    tag_set = set(tags(value)) if callable(tags) else set(tags)

    if store_if is not None and not store_if(value):
        return value

    with _lock:
        stale = _epoch != before_epoch or any(
            _versions.get(_table_of(t), 0) != before_versions.get(_table_of(t), 0)
            for t in tag_set
        )
        if not stale:
            if len(_store) >= MAX_ENTRIES:
                _drop_expired_locked(now)
                if len(_store) >= MAX_ENTRIES:
                    _store.clear()
            _store[key] = (value, now + ttl, tag_set)
            return copy.deepcopy(value)
    # Something committed to one of our tables while the loader ran — serve this
    # result but don't keep it.
    return value


def evict_after_commit(session, *tags: str) -> None:
    """Queue `tags` for eviction when `session` commits (discarded on rollback).

    Only needed for writes the listeners can't infer — normal ORM and Core DML
    is picked up automatically.
    """
    _pending(session).update(tags)


def clear() -> None:
    """Drop everything. Used by tests and after out-of-band writes."""
    global _epoch
    with _lock:
        _store.clear()
        _epoch += 1


def enrollment_ids(session, model, column, user_id: str) -> set:
    """Cached set of what a user is enrolled in (#24, row 15).

    One shape for all four enrollment tables. Enrollment only — progress rows are
    never cached, they change on every answer.
    """
    table = model.__table__.name
    return get_or_load(
        ("enroll", table, user_id),
        lambda: set(
            session.execute(select(column).where(model.user_id == user_id)).scalars().all()
        ),
        tags={f"{table}:user={user_id}"},
    )


# ── Internals ────────────────────────────────────────────────────────────────

def _drop_expired_locked(now: float) -> None:
    for key in [k for k, (_v, exp, _t) in _store.items() if exp <= now]:
        del _store[key]


def _evict_locked(tags: set[str]) -> None:
    """Apply eviction tags.

    `t`           evicts entries tagged exactly `t` (whole-table data).
    `t:pk=5`      evicts entries tagged exactly `t:pk=5`.
    `t:*`         evicts `t` *and* every `t:<something>` entry — emitted by Core
                  or textual DML, where we can't know which rows were touched.
    """
    exact = {t for t in tags if not t.endswith(":*")}
    wide = {t[:-2] for t in tags if t.endswith(":*")}
    for tag in tags:
        table = _table_of(tag)
        _versions[table] = _versions.get(table, 0) + 1
    for key in [
        k for k, (_v, _exp, entry_tags) in _store.items()
        if any(t in exact or _table_of(t) in wide for t in entry_tags)
    ]:
        del _store[key]


def _pending(session) -> set[str]:
    return session.info.setdefault(_SESSION_INFO_KEY, set())


def _row_tags(obj) -> set[str]:
    """Tags for one ORM row: the bare table, its pk, and its owning user."""
    try:
        state = sa_inspect(obj)
        table = state.mapper.local_table.name
    except Exception:
        return set()
    tags = {table}
    try:
        pks = state.mapper.primary_key_from_instance(obj)
        if len(pks) == 1 and pks[0] is not None:
            tags.add(f"{table}:pk={pks[0]}")
    except Exception:
        pass
    # state.dict only holds already-loaded attributes, so this can't trigger a
    # lazy SELECT in the middle of a flush.
    user_id = state.dict.get("user_id")
    if user_id is not None:
        tags.add(f"{table}:user={user_id}")
    return tags


def _statement_tags(statement) -> set[str]:
    if isinstance(statement, TextClause):
        match = _TEXT_DML.match(statement.text)
        return {f"{match.group(2)}:*"} if match else set()
    table = getattr(statement, "table", None)
    return {f"{table.name}:*"} if table is not None else set()


@event.listens_for(_Session, "after_flush")
def _cache_after_flush(session, flush_context):
    # after_flush still sees pre-flush new/dirty/deleted, which is what we want.
    pending = _pending(session)
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        pending |= _row_tags(obj)


@event.listens_for(_Session, "do_orm_execute")
def _cache_do_orm_execute(orm_execute_state):
    statement = orm_execute_state.statement
    if not (
        orm_execute_state.is_insert
        or orm_execute_state.is_update
        or orm_execute_state.is_delete
        or isinstance(statement, TextClause)
    ):
        return
    explicit = orm_execute_state.execution_options.get("cache_tags")
    tags = set(explicit) if explicit else _statement_tags(statement)
    if tags:
        _pending(orm_execute_state.session).update(tags)


@event.listens_for(_Session, "after_commit")
def _cache_after_commit(session):
    # Evicting before the commit would let a concurrent reader re-cache the old
    # rows; after the commit, the worst case is one reader that already loaded
    # stale data — and the stale-refill guard stops it from storing.
    tags = session.info.pop(_SESSION_INFO_KEY, None)
    if tags:
        with _lock:
            _evict_locked(tags)


@event.listens_for(_Session, "after_rollback")
def _cache_after_rollback(session):
    session.info.pop(_SESSION_INFO_KEY, None)
