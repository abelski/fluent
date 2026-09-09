"""One-off backfill: populate Word.part_of_speech / verb_present_3p / verb_past_3p.

Existing vocabulary predates the verb-principal-forms feature (plan #20), so
every word row starts with these three columns null. This walks the non-archived
words that still have no `part_of_speech` and resolves them via
`backend/verb_lookup.py`:

1. The curated `Verb` table (free, hand-verified) — tried first, always.
2. The app's own existing `Word.hint` POS tagging (`veiksmažodis`/`глагол` for
   verbs, `daiktavardis`/`būdvardis`/etc. for everything else) — a word
   already confirmed non-verb this way is skipped without any network call,
   and persisted with that part_of_speech so future runs don't reconsider it;
   a word confirmed verb this way is trusted even if Wiktionary lists the
   same headword under another part of speech too (see `_wiktionary_pos_set`
   in `verb_lookup.py` for why that homonym case needs trusting the hint).
3. Wiktionary HTML scraping, for single-word entries with no usable hint.

Only Wiktionary lookups sleep — curated-table hits and hint-confirmed misses
are pure DB reads, so a corpus dominated by textbook verbs and already-tagged
non-verbs finishes fast. Safe to re-run: already enriched or already-tagged
rows are skipped by the `part_of_speech IS NULL` filter.

Usage from the backend directory:
    python scripts/backfill_verb_forms.py [--dry-run] [--limit N]
"""

import argparse
import sys
import time

sys.path.insert(0, ".")

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import Session, select  # noqa: E402
from database import engine  # noqa: E402
from models import Word  # noqa: E402
from verb_lookup import curated_verb_forms, enrich_verb_forms, part_of_speech_from_hint  # noqa: E402

BATCH_SIZE = 50
WIKTIONARY_SLEEP_SECONDS = 0.5  # be a polite external-API consumer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="don't write anything")
    parser.add_argument("--limit", type=int, default=None, help="max words to process")
    args = parser.parse_args()

    curated_hits = wiktionary_hits = hint_skips = misses = 0

    with Session(engine) as session:
        query = select(Word).where(
            Word.archived == False,  # noqa: E712
            Word.part_of_speech == None,  # noqa: E711
        ).order_by(Word.id)
        if args.limit:
            query = query.limit(args.limit)
        words = session.exec(query).all()
        print(f"{len(words)} word(s) to check")

        pending = 0

        def stage(word: Word) -> None:
            nonlocal pending
            session.add(word)
            pending += 1

        for index, word in enumerate(words, start=1):
            curated = curated_verb_forms(session, word.lithuanian)
            hinted_pos = part_of_speech_from_hint(word.hint)

            if not curated:
                if hinted_pos and hinted_pos != "verb":
                    # Already confirmed non-verb via the app's existing
                    # hint-based POS tagging — persist it so future runs skip
                    # this row for free, no lookup needed.
                    hint_skips += 1
                    if not args.dry_run:
                        word.part_of_speech = hinted_pos
                        stage(word)
                    continue
                if not hinted_pos and len(word.lithuanian.split()) != 1:
                    # Multi-word phrases with no POS hint are never single verbs.
                    misses += 1
                    continue

            result = enrich_verb_forms(session, word.lithuanian, part_of_speech=hinted_pos)
            if curated is None:
                time.sleep(WIKTIONARY_SLEEP_SECONDS)  # a network call was attempted

            if not result["verb_present_3p"] or not result["verb_past_3p"]:
                misses += 1
                continue

            if curated:
                curated_hits += 1
            else:
                wiktionary_hits += 1

            present, past = result["verb_present_3p"], result["verb_past_3p"]
            print(f"  [{index}/{len(words)}] {word.lithuanian} – {present} – {past}")
            if args.dry_run:
                continue
            word.part_of_speech = result["part_of_speech"]
            word.verb_present_3p = present
            word.verb_past_3p = past
            stage(word)

            if pending >= BATCH_SIZE:
                session.commit()
                pending = 0

        if not args.dry_run and pending:
            session.commit()

    total = curated_hits + wiktionary_hits
    print(
        f"\nDone{' (dry run)' if args.dry_run else ''}: {total} verb(s) enriched "
        f"({curated_hits} from the curated Verb table, {wiktionary_hits} from "
        f"Wiktionary), {hint_skips} word(s) tagged non-verb via existing hint, "
        f"{misses} word(s) with no verb forms found."
    )


if __name__ == "__main__":
    main()
