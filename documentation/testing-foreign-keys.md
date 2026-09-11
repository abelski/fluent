# Foreign keys: enforced in production, off by default in tests

## The gap

Production is Postgres (Neon) and **always** enforces foreign key constraints. The backend test
suite runs on in-memory SQLite (`backend/conftest.py`), and **SQLite ignores foreign keys unless
each connection explicitly opts in** with `PRAGMA foreign_keys=ON`.

So a whole class of bug — deleting rows in an order that violates a constraint, or leaving a
dangling reference — passes every test and then fails on every real request.

## It has already happened once (issue #172)

`delete_my_word` in `backend/routers/word_lists.py` did this:

```python
session.delete(item)   # the word_list_item join row
session.delete(word)   # the word it points at
session.commit()
```

That looks correctly ordered, but the order you write is not the order SQLAlchemy emits.
SQLAlchemy's unit of work sorts deletes using dependency edges from **ORM `relationship()`
declarations** — and `backend/models.py` declares **zero** relationships (the tables are joined
manually in queries instead). With no edge between `Word` and `WordListItem`, SQLAlchemy was free
to emit `DELETE FROM word` first, and Postgres rejected it:

```
ForeignKeyViolation: update or delete on table "word" violates foreign key constraint
"word_list_item_word_id_fkey" on table "word_list_item"
DETAIL:  Key (id)=(7721) is still referenced from table "word_list_item".
```

Deleting a word from a personal list was therefore broken for **every** user, on every attempt,
while `test_edit_and_delete_word` passed the whole time. The bug survived a triage pass that
concluded "no distinct code fix needed" precisely because the tests were green.

The fix is a `session.flush()` between the dependent deletes and the `word` delete, forcing the
order the constraint requires.

## How to test something FK-sensitive

Enforcement is deliberately **not** on globally: about 27 existing tests build fixtures with
dangling references (rows pointing at ids that were never created) and would fail immediately.
Turning it on repo-wide is a worthwhile cleanup but is its own piece of work.

Instead, opt in for the duration of one test with the `enforce_foreign_keys` context manager in
`backend/conftest.py`:

```python
from conftest import enforce_foreign_keys

with enforce_foreign_keys():
    r = client.delete(f"/api/me/word-lists/words/{wid}", headers=auth(token))
assert r.status_code == 200, r.text
```

See `test_delete_word_does_not_violate_foreign_keys` in `backend/tests/test_word_lists.py`. It was
confirmed to fail without the `flush()` and pass with it — a regression test that has never been
seen to fail is not yet known to test anything.

Reach for this whenever a handler deletes rows across more than one table, or writes a row
carrying a foreign key.

## Rule of thumb

Because `models.py` has no `relationship()` declarations, **SQLAlchemy never knows the delete
order for any pair of tables in this app.** Any multi-table delete is a candidate for this bug.
Either flush between the steps, or delete through explicit statements in dependency order — and
cover it with a test that has foreign keys switched on.
