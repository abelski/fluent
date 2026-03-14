#!/usr/bin/env python3
# Content loader — reads text files from content/grammar/ and content/vocabulary/
# and upserts them into the PostgreSQL database.
#
# Usage:
#   python load.py                   # load everything
#   python load.py --only grammar
#   python load.py --only vocabulary
#   python load.py --dry-run         # parse + validate, no DB writes

import argparse
import sys
from pathlib import Path

CONTENT_DIR = Path(__file__).parent.parent
GRAMMAR_DIR = CONTENT_DIR / "grammar"
VOCAB_DIR = CONTENT_DIR / "vocabulary"


def main():
    parser = argparse.ArgumentParser(description="Load content files into the DB")
    parser.add_argument("--only", choices=["grammar", "vocabulary"], default=None)
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and validate files without writing to DB")
    args = parser.parse_args()

    from parsers import scan_grammar_files, scan_vocab_files
    from db import ensure_tables, upsert_grammar_file, upsert_vocab_file

    dry_run = args.dry_run
    if dry_run:
        print("DRY RUN — no DB writes")
    else:
        ensure_tables()

    load_grammar = args.only in (None, "grammar")
    load_vocab = args.only in (None, "vocabulary")

    errors = 0

    if load_grammar:
        print(f"\n── Grammar ({GRAMMAR_DIR}) ──")
        grammar_results = scan_grammar_files(GRAMMAR_DIR)
        if not grammar_results:
            print("  No grammar files found.")
        for result in grammar_results:
            try:
                counts = upsert_grammar_file(result, dry_run=dry_run)
                print(f"  case {result.case_index:>2} | "
                      f"{len(result.sentences):>3} sentences | "
                      f"+{counts['added']} updated:{counts['updated']} ={counts['unchanged']}")
            except Exception as exc:
                print(f"  ERROR processing case {result.case_index}: {exc}", file=sys.stderr)
                errors += 1

    if load_vocab:
        print(f"\n── Vocabulary ({VOCAB_DIR}) ──")
        vocab_results = scan_vocab_files(VOCAB_DIR)
        if not vocab_results:
            print("  No vocabulary files found.")
        for result in vocab_results:
            try:
                counts = upsert_vocab_file(result, dry_run=dry_run)
                print(f"  {result.subcategory}/{result.title} | "
                      f"{len(result.words):>3} words | "
                      f"+{counts['added']} updated:{counts['updated']} ={counts['unchanged']}")
            except Exception as exc:
                print(f"  ERROR processing {result.subcategory}/{result.title}: {exc}",
                      file=sys.stderr)
                errors += 1

    print()
    if errors:
        print(f"Finished with {errors} error(s).")
        sys.exit(1)
    else:
        print("Done.")


if __name__ == "__main__":
    main()
