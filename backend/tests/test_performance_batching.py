# Regression tests for plans/improvements/active/performance-optimisation.md.
#
# These pin two properties for each endpoint being rewritten from an N+1 loop
# to a batched query:
#   1. Query count stays constant as volume grows (catches an N+1 regression
#      even though SQLite is too fast to show it as latency).
#   2. Response values, keys, and per-parent ordering are unchanged by the
#      rewrite — batching regroups rows in Python, which is where silent
#      ordering/shape drift would sneak in.
#
# Runs on the shared in-memory SQLite test DB (see conftest.py). All rows
# created here are cleaned up in the fixture's teardown so they don't leak
# into other test files' global-listing assertions.

import pytest
from jose import jwt
from sqlalchemy import event
from sqlmodel import Session, select

import database
from models import (
    CustomProgram,
    CustomProgramList,
    Phrase,
    PhraseProgram,
    User,
    UserCustomProgramEnrollment,
    UserPhraseProgramEnrollment,
    UserPhraseProgress,
    UserWordProgress,
    Word,
    WordList,
    WordListItem,
)

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Perf User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class QueryCounter:
    """Counts SQL statements executed against `database.engine` while active."""

    def __init__(self):
        self.count = 0

    def _on_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.count += 1

    def __enter__(self):
        self.count = 0
        event.listen(database.engine, "before_cursor_execute", self._on_execute)
        return self

    def __exit__(self, exc_type, exc, tb):
        event.remove(database.engine, "before_cursor_execute", self._on_execute)


N_PROGRAMS = 6
SETS_PER_PROGRAM = 3
WORDS_PER_SET = 8
N_PERSONAL_LISTS = 8
WORDS_PER_PERSONAL_LIST = 6
N_PHRASE_PROGRAMS = 5  # + 1 extra program the study user is deliberately NOT enrolled in
PHRASES_PER_PROGRAM = 10


@pytest.fixture
def perf_scenario(client):
    author_token = make_token("perf_author@example.com", "Author")
    client.get("/api/me/quota", headers=auth(author_token))
    study_token = make_token("perf_study@example.com", "Study")
    client.get("/api/me/quota", headers=auth(study_token))

    program_ids: list[int] = []
    list_ids_by_program: dict[int, list[int]] = {}
    words_by_list: dict[int, list[dict]] = {}
    personal_list_ids: list[int] = []
    personal_words_by_list: dict[int, list[dict]] = {}
    phrase_program_ids: list[int] = []
    phrase_ids_by_program: dict[int, list[int]] = {}
    expected_stage_dist: dict[int, dict] = {}

    with Session(database.engine) as s:
        author = s.exec(select(User).where(User.email == "perf_author@example.com")).first()
        study = s.exec(select(User).where(User.email == "perf_study@example.com")).first()
        study.is_premium = True
        s.add(study)
        s.commit()
        study_id = study.id
        author_id = author.id

        for p in range(N_PROGRAMS):
            prog = CustomProgram(title=f"Perf Program {p}", created_by=author_id, is_published=True)
            s.add(prog)
            s.flush()
            program_ids.append(prog.id)
            list_ids_by_program[prog.id] = []
            for st in range(SETS_PER_PROGRAM):
                wl = WordList(title=f"Perf Set {p}-{st}", is_public=False, created_by=author_id)
                s.add(wl)
                s.flush()
                list_ids_by_program[prog.id].append(wl.id)
                words_by_list[wl.id] = []
                for wi in range(WORDS_PER_SET):
                    word = Word(
                        lithuanian=f"p{p}s{st}w{wi}",
                        translation_en=f"en-{p}-{st}-{wi}",
                        translation_ru=f"ru-{p}-{st}-{wi}",
                        star=1 + (wi % 3),
                    )
                    s.add(word)
                    s.flush()
                    s.add(WordListItem(word_list_id=wl.id, word_id=word.id, position=wi))
                    words_by_list[wl.id].append({"id": word.id, "lithuanian": word.lithuanian})
                s.add(CustomProgramList(custom_program_id=prog.id, word_list_id=wl.id, position=st))
        s.commit()

        enrolled_program_ids = program_ids[: N_PROGRAMS // 2]
        for pid in enrolled_program_ids:
            s.add(UserCustomProgramEnrollment(user_id=study_id, custom_program_id=pid))
        s.commit()

        for i in range(N_PERSONAL_LISTS):
            wl = WordList(title=f"Perf Personal {i}", is_public=False, created_by=study_id)
            s.add(wl)
            s.flush()
            personal_list_ids.append(wl.id)
            personal_words_by_list[wl.id] = []
            for wi in range(WORDS_PER_PERSONAL_LIST):
                word = Word(lithuanian=f"pl{i}w{wi}", translation_en=f"pen-{i}-{wi}", translation_ru=f"pru-{i}-{wi}")
                s.add(word)
                s.flush()
                s.add(WordListItem(word_list_id=wl.id, word_id=word.id, position=wi))
                status = "new"
                if wi % 3 == 0:
                    status = "known"
                    s.add(UserWordProgress(user_id=study_id, word_id=word.id, status="known"))
                elif wi % 3 == 1:
                    status = "learning"
                    s.add(UserWordProgress(user_id=study_id, word_id=word.id, status="learning"))
                personal_words_by_list[wl.id].append({"id": word.id, "status": status})
        s.commit()

        for pp in range(N_PHRASE_PROGRAMS + 1):
            prog = PhraseProgram(title=f"Perf Phrase Program {pp}", difficulty=1, is_public=True)
            s.add(prog)
            s.flush()
            phrase_program_ids.append(prog.id)
            phrase_ids_by_program[prog.id] = []
            for ph in range(PHRASES_PER_PROGRAM):
                phrase = Phrase(program_id=prog.id, text=f"Frazė {pp}-{ph}", translation=f"Фраза {pp}-{ph}", position=ph)
                s.add(phrase)
                s.flush()
                phrase_ids_by_program[prog.id].append(phrase.id)
        s.commit()

        enrolled_phrase_program_ids = phrase_program_ids[:N_PHRASE_PROGRAMS]
        for pid in enrolled_phrase_program_ids:
            s.add(UserPhraseProgramEnrollment(user_id=study_id, program_id=pid))
        s.commit()

        for pid in enrolled_phrase_program_ids:
            phrase_ids = phrase_ids_by_program[pid]
            dist = {0: 0, 1: 0, 2: 0}
            for idx, phid in enumerate(phrase_ids):
                stage = idx % 3
                if stage != 0:
                    s.add(UserPhraseProgress(user_id=study_id, phrase_id=phid, lesson_stage=stage))
                dist[stage] += 1
            expected_stage_dist[pid] = {"stage0": dist[0], "stage1": dist[1], "stage2": dist[2]}
        s.commit()

    yield {
        "study_token": study_token,
        "study_id": study_id,
        "author_id": author_id,
        "program_ids": program_ids,
        "enrolled_program_ids": enrolled_program_ids,
        "list_ids_by_program": list_ids_by_program,
        "words_by_list": words_by_list,
        "personal_list_ids": personal_list_ids,
        "personal_words_by_list": personal_words_by_list,
        "phrase_program_ids": phrase_program_ids,
        "enrolled_phrase_program_ids": enrolled_phrase_program_ids,
        "phrase_ids_by_program": phrase_ids_by_program,
        "expected_stage_dist": expected_stage_dist,
    }

    with Session(database.engine) as s:
        for pid in phrase_program_ids:
            for phid in phrase_ids_by_program[pid]:
                for row in s.exec(select(UserPhraseProgress).where(UserPhraseProgress.phrase_id == phid)).all():
                    s.delete(row)
                phrase = s.get(Phrase, phid)
                if phrase:
                    s.delete(phrase)
            prog = s.get(PhraseProgram, pid)
            if prog:
                s.delete(prog)
        for row in s.exec(
            select(UserPhraseProgramEnrollment).where(UserPhraseProgramEnrollment.user_id == study_id)
        ).all():
            s.delete(row)
        s.commit()

        for pid, list_ids in list_ids_by_program.items():
            for lid in list_ids:
                for item in s.exec(select(WordListItem).where(WordListItem.word_list_id == lid)).all():
                    word = s.get(Word, item.word_id)
                    s.delete(item)
                    if word:
                        s.delete(word)
                wl = s.get(WordList, lid)
                if wl:
                    s.delete(wl)
            for row in s.exec(select(CustomProgramList).where(CustomProgramList.custom_program_id == pid)).all():
                s.delete(row)
            prog = s.get(CustomProgram, pid)
            if prog:
                s.delete(prog)
        for row in s.exec(
            select(UserCustomProgramEnrollment).where(UserCustomProgramEnrollment.user_id == study_id)
        ).all():
            s.delete(row)
        s.commit()

        for lid in personal_list_ids:
            for item in s.exec(select(WordListItem).where(WordListItem.word_list_id == lid)).all():
                word = s.get(Word, item.word_id)
                for pr in s.exec(select(UserWordProgress).where(UserWordProgress.word_id == item.word_id)).all():
                    s.delete(pr)
                s.delete(item)
                if word:
                    s.delete(word)
            wl = s.get(WordList, lid)
            if wl:
                s.delete(wl)
        s.commit()


# ── /api/programs/community — _program_detail batching (Step 1) ────────────────

def test_community_programs_query_count_is_constant(client, perf_scenario):
    token = perf_scenario["study_token"]
    with QueryCounter() as qc:
        r = client.get("/api/programs/community", headers=auth(token))
    assert r.status_code == 200
    # Pre-batch this was O(programs) — 3-4 queries per program. Post-batch it
    # must not grow with N_PROGRAMS; a small constant regardless of volume.
    assert qc.count <= 12, f"query count grew with volume: {qc.count}"


def test_community_programs_values_correct(client, perf_scenario):
    token = perf_scenario["study_token"]
    r = client.get("/api/programs/community", headers=auth(token))
    data = {p["id"]: p for p in r.json()}
    for pid in perf_scenario["program_ids"]:
        assert pid in data
        expected_word_count = SETS_PER_PROGRAM * WORDS_PER_SET
        assert data[pid]["word_count"] == expected_word_count
        assert set(data[pid]["list_ids"]) == set(perf_scenario["list_ids_by_program"][pid])
        expected_enrollment = 1 if pid in perf_scenario["enrolled_program_ids"] else 0
        assert data[pid]["enrollment_count"] == expected_enrollment


# ── word-sets endpoints — batching (Step 2) ─────────────────────────────────────

def test_program_word_sets_query_count_is_constant(client, perf_scenario):
    token = perf_scenario["study_token"]
    pid = perf_scenario["enrolled_program_ids"][0]
    # Look up the share token via the community listing (author-created program).
    community = client.get("/api/programs/community", headers=auth(token)).json()
    share_token = next(p["share_token"] for p in community if p["id"] == pid)
    with QueryCounter() as qc:
        r = client.get(f"/api/programs/community/{share_token}/word-sets", headers=auth(token))
    assert r.status_code == 200
    assert qc.count <= 6, f"query count grew with volume: {qc.count}"


def test_program_word_sets_content_and_order(client, perf_scenario):
    token = perf_scenario["study_token"]
    pid = perf_scenario["enrolled_program_ids"][0]
    community = client.get("/api/programs/community", headers=auth(token)).json()
    share_token = next(p["share_token"] for p in community if p["id"] == pid)
    r = client.get(f"/api/programs/community/{share_token}/word-sets", headers=auth(token))
    result = r.json()
    expected_list_ids = perf_scenario["list_ids_by_program"][pid]
    assert [wset["id"] for wset in result] == expected_list_ids
    for wset in result:
        expected_words = perf_scenario["words_by_list"][wset["id"]]
        assert [w["front"] for w in wset["words"]] == [w["lithuanian"] for w in expected_words]


# ── /api/me/word-lists — _list_summary batching (Step 3) ───────────────────────

def test_my_word_lists_query_count_is_constant(client, perf_scenario):
    token = perf_scenario["study_token"]
    with QueryCounter() as qc:
        r = client.get("/api/me/word-lists", headers=auth(token))
    assert r.status_code == 200
    assert qc.count <= 6, f"query count grew with volume: {qc.count}"


def test_my_word_lists_known_learning_new_correct(client, perf_scenario):
    token = perf_scenario["study_token"]
    r = client.get("/api/me/word-lists", headers=auth(token))
    data = {row["id"]: row for row in r.json()}
    for lid in perf_scenario["personal_list_ids"]:
        words = perf_scenario["personal_words_by_list"][lid]
        expected_known = sum(1 for w in words if w["status"] == "known")
        expected_learning = sum(1 for w in words if w["status"] == "learning")
        expected_new = sum(1 for w in words if w["status"] == "new")
        row = data[lid]
        assert row["word_count"] == len(words)
        assert row["known"] == expected_known
        assert row["learning"] == expected_learning
        assert row["new"] == expected_new


# ── /api/phrase-programs — stage distribution batching (Step 4) ────────────────

def test_phrase_programs_query_count_is_constant(client, perf_scenario):
    token = perf_scenario["study_token"]
    with QueryCounter() as qc:
        r = client.get("/api/phrase-programs", headers=auth(token))
    assert r.status_code == 200
    assert qc.count <= 8, f"query count grew with volume: {qc.count}"


def test_phrase_programs_stage_distribution_correct(client, perf_scenario):
    token = perf_scenario["study_token"]
    r = client.get("/api/phrase-programs", headers=auth(token))
    data = {p["id"]: p for p in r.json()}
    for pid, expected in perf_scenario["expected_stage_dist"].items():
        assert data[pid]["stage_distribution"] == expected
    # The one program the study user is NOT enrolled in must show no distribution.
    unenrolled_pid = perf_scenario["phrase_program_ids"][-1]
    assert data[unenrolled_pid]["stage_distribution"] is None
    assert data[unenrolled_pid]["enrolled"] is False


# ── /api/lists — visibility scoping (Step B, already applied) ──────────────────

def test_lists_word_counts_scoped_to_visible_ids(client, perf_scenario):
    """Regression guard for Step B: aggregations now scope to visible list IDs
    instead of the whole catalogue. Each returned list's own count must be
    identical to what an unscoped aggregation would have produced."""
    token = perf_scenario["study_token"]
    r = client.get("/api/lists", headers=auth(token))
    assert r.status_code == 200
    data = {row["id"]: row for row in r.json()}

    # Lists from a program the study user IS enrolled in: visible, correct count.
    enrolled_pid = perf_scenario["enrolled_program_ids"][0]
    for lid in perf_scenario["list_ids_by_program"][enrolled_pid]:
        assert lid in data
        assert data[lid]["word_count"] == WORDS_PER_SET

    # Lists from a program the study user is NOT enrolled in: must not leak in.
    unenrolled_pid = [pid for pid in perf_scenario["program_ids"] if pid not in perf_scenario["enrolled_program_ids"]][0]
    for lid in perf_scenario["list_ids_by_program"][unenrolled_pid]:
        assert lid not in data
