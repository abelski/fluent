# Issue #186 — genitive case sentence plausibility.
#
# The sentence "Šalia draug___ yra parduotuvė." (There is a store near my friend)
# is semantically implausible — a store is a place, not something logically "next to a person".
# This test ensures that no sentence data still pairs "draug" with "parduotuvė".

import json
from pathlib import Path


def test_grammar_sentences_json_no_draug_parduotuve_pair():
    """JSON seed data must not contain the implausible draug+parduotuvė pair."""
    json_path = Path(__file__).parent.parent / "data" / "en_content" / "grammar_sentences.json"
    assert json_path.exists(), f"grammar_sentences.json not found at {json_path}"

    with open(json_path, "r", encoding="utf-8") as f:
        sentences = json.load(f)

    bad_pairs = []
    for entry in sentences:
        display = entry.get("display", "").lower()
        if "draug" in display and "parduotuvė" in display:
            bad_pairs.append(entry)

    assert not bad_pairs, (
        f"Found {len(bad_pairs)} implausible draug+parduotuvė pair(s) in JSON: {bad_pairs}"
    )

