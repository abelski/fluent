"""
Extract all 365 Lithuanian verb entries from the book PDF.

Usage:
    python backend/scripts/extract_verbs_pdf.py
    python backend/scripts/extract_verbs_pdf.py --limit 10   # first 10 verbs only

Output: temp_files/verbs_extracted.json
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

PDF_PATH = Path("temp_files/books/2015_365_lietuvių_kalbos_veiksmažodžiai_rusų_kalba.pdf")
OUTPUT_PATH = Path("temp_files/verbs_extracted.json")

# Page indices (0-based): verb #N is on page 33+N (verb 1 = page index 34)
FIRST_VERB_PAGE = 34   # 0-indexed
LAST_VERB_PAGE = 398   # 0-indexed (365 verbs = pages 34-398)

PERSONS_ORDER = ["aš", "tu", "jis", "mes", "jūs"]


# ── Char-level page reader ────────────────────────────────────────────────────
#
# The book sets Lithuanian stress marks as ZERO-WIDTH glyphs positioned by
# absolute x rather than by advance width. page.extract_text() sorts by x and
# inserts a space wherever the gap exceeds x_tolerance, so a stressed "i"
# ("i" + U+0307 + U+0303) breaks into three tokens. Splitting such a line on
# whitespace yields spurious tokens, and since _build_conjugations maps token
# POSITION to tense, every later column shifts one to the right — the accent
# lands in the "tu" cell and the neighbouring tense's form lands in the next
# column (issue #151). A second variant has a real U+0020 between a letter and
# its mark, splitting the word itself ("kabi̇ǹ a" → issue #153).
#
# Both are segmentation failures, not data loss: the glyphs are all present.
# So instead of splitting text, read the chars, attach every mark to the letter
# cluster it sits on, and cut the row into cells at the page's real whitespace
# corridors.

NOMINAL_CUTS = [95.0, 210.0, 315.0]


def _is_mark(ch: dict) -> bool:
    """A combining mark, or any zero-width non-space glyph (the stress marks)."""
    text = ch["text"]
    if len(text) == 1 and unicodedata.combining(text):
        return True
    return (ch["x1"] - ch["x0"]) <= 0.01 and text.strip() != ""


def _group_lines(chars: list[dict], ytol: float = 4.0) -> list[list[dict]]:
    """Agglomerative clustering on `top`.

    A person label sits ~0.8pt above its forms and marks up to ~1pt off, while
    consecutive rows are ~13pt apart. Bucketing by round(top/tol) would split a
    row whenever it straddled a bucket boundary; merging by distance does not.
    """
    if not chars:
        return []
    ordered = sorted(chars, key=lambda c: c["top"])
    lines = [[ordered[0]]]
    for ch in ordered[1:]:
        if ch["top"] - lines[-1][-1]["top"] <= ytol:
            lines[-1].append(ch)
        else:
            lines.append([ch])
    return lines


# Letters a Lithuanian tone mark can sit on: any vowel, plus l/m/n/r in mixed
# diphthongs. Compared after stripping diacritics, so ė/ų/ū fold to e/u/u.
_TONE_CARRIERS = frozenset("aeiouy" + "lmnr")


def _mark_position(letters: list[dict], mark: dict) -> int:
    """Index at which to insert a mark among a cluster's letters.

    The mark glyph is zero-width and drawn near the right of its letter, but
    how near depends on the glyph's width: for a wide "ė" (4.88pt) it lands
    ~1pt INSIDE the box, while for a narrow "i" (3.06pt) it lands ~0.03pt PAST
    it, inside the following letter. So neither "the box containing it" nor
    "the last box ending before it" works for both — the first yields "lij̀o"
    for "lìjo", the second yields "kaĺbėti" for "kalbė́ti".

    What holds in every observed case is that the anchor STARTS at least ~1pt
    before the mark, and no later carrier does. That reproduces the book for
    both widths: "kalbė́ti", "atsìliepiau", "kal̃ba", "lañko", "atsãko".

    Lithuanian tone marks only sit on a vowel or on l/m/n/r (mixed diphthongs),
    so consonants are skipped as anchors.
    """
    def is_carrier(ch: dict) -> bool:
        base = "".join(
            c for c in unicodedata.normalize("NFD", ch["text"])
            if not unicodedata.combining(c)
        ).lower()
        return bool(base) and base[0] in _TONE_CARRIERS

    carriers = [(i, ch) for i, ch in enumerate(letters) if is_carrier(ch)]
    if carriers:
        preceding = [pair for pair in carriers if pair[1]["x0"] <= mark["x0"] - 1.0]
        if preceding:
            return max(preceding, key=lambda pair: pair[1]["x0"])[0] + 1
        return carriers[0][0] + 1
    idx = 0
    for i, ch in enumerate(letters):
        if ch["x0"] <= mark["x0"] + 0.6:
            idx = i + 1
    return idx


def _cluster_line(chars: list[dict], gap: float = 1.2) -> list[dict]:
    """Group one line's chars into whitespace-delimited clusters, marks attached."""
    letters, marks = [], []
    for ch in chars:
        if ch["text"].strip() == "":
            continue  # literal space: a separator, never a mark anchor
        if ch["text"] == "̇":
            # The book draws the tittle of a stressed "i" as its own glyph, but
            # "i" already carries one in Unicode. Drop it here rather than after
            # composing, where it could otherwise attach to a neighbouring
            # vowel and compose into a real character (a + U+0307 → "ȧ").
            continue
        (marks if _is_mark(ch) else letters).append(ch)

    clusters: list[dict] = []
    for ch in sorted(letters, key=lambda c: c["x0"]):
        if clusters and ch["x0"] - clusters[-1]["x1"] <= gap:
            clusters[-1]["chars"].append(ch)
            clusters[-1]["x1"] = max(clusters[-1]["x1"], ch["x1"])
        else:
            clusters.append({"chars": [ch], "x0": ch["x0"], "x1": ch["x1"]})

    for mark in marks:
        if not clusters:
            continue
        best, best_dist = None, None
        for cl in clusters:
            if cl["x0"] - 1.0 <= mark["x0"] <= cl["x1"] + 1.5:
                dist = 0.0
            else:
                dist = min(abs(mark["x0"] - cl["x0"]), abs(mark["x0"] - cl["x1"]))
            if best_dist is None or dist < best_dist:
                best, best_dist = cl, dist
        best["chars"].insert(_mark_position(best["chars"], mark), mark)

    for cl in clusters:
        cl["text"] = "".join(c["text"] for c in cl["chars"])
    return clusters


def _normalize_form(text: str) -> str:
    """Repair extraction artifacts and settle on NFC."""
    # Compose first, so a decomposed "ė" becomes U+0117 and keeps its dot…
    text = unicodedata.normalize("NFC", text)
    # …then drop every remaining U+0307. The book draws the tittle of a stressed
    # "i" as its own glyph, but "i" already carries one in Unicode, so what is
    # left after composing is always the duplicate — in either mark order
    # ("i" + U+0307 + U+0303 or "i" + U+0303 + U+0307).
    text = text.replace("̇", "")
    text = re.sub(r"\s*/\s*", " / ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return unicodedata.normalize("NFC", text)


# Errata: cells the book itself prints wrong. Verified against the source PDF —
# in each case the printed page repeats the neighbouring column's form, so no
# re-reading of the page can recover the intended value.
#   #118 lankýti — present "tu" printed as the past form "lankeĩ"
#   #213 rašýti  — present "mes"/"jūs" printed as the past forms
ERRATA: dict[int, dict[str, dict[str, str]]] = {
    118: {"indicative_present": {"tu": "lankaĩ"}},
    213: {"indicative_present": {"mes": "rãšome", "jūs": "rãšote"}},
}


def _apply_errata(verb: dict) -> None:
    fixes = ERRATA.get(verb.get("number"))
    if not fixes:
        return
    for tense, persons in fixes.items():
        for person, form in persons.items():
            verb["conjugations"].setdefault(tense, {})[person] = \
                unicodedata.normalize("NFC", form)


def _column_cuts(person_lines: list[list[dict]], min_gap: float = 3.0) -> list[float]:
    """Column boundaries from the page's vertical whitespace corridors.

    Spans are merged across all ten person rows first, so a gap present in only
    one row (around the " / " of an alternate form) is filled in by the others
    and never mistaken for a corridor. Take the three widest surviving gaps
    rather than every gap above a fixed threshold: pages carrying a long verb
    (atostogáuti) squeeze the real corridors below any threshold that would
    still exclude intra-cell gaps on other pages.
    """
    spans = sorted((cl["x0"], cl["x1"]) for line in person_lines for cl in line)
    if not spans:
        return []
    merged = [list(spans[0])]
    for start, end in spans[1:]:
        if start <= merged[-1][1] + 0.5:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    gaps = [
        (merged[i + 1][0] - merged[i][1], (merged[i][1] + merged[i + 1][0]) / 2)
        for i in range(len(merged) - 1)
        if merged[i + 1][0] - merged[i][1] >= min_gap
    ]
    gaps.sort(key=lambda g: -g[0])
    return sorted(centre for _, centre in gaps[:3])


def _looks_like_person(clusters: list[dict]) -> bool:
    head = clusters[0]["text"] if clusters else ""
    return head in ("aš", "tu", "mes", "jūs") or head.startswith("jis")


def read_page(page) -> tuple[list[tuple[str, list[str]]], list[str]]:
    """Read one page into (person_rows, line_texts).

    person_rows is [(person_label, [col1, col2, col3]), ...] in page order —
    five rows for the first conjugation block, five for the second.
    """
    lines = [_cluster_line(chars) for chars in _group_lines(page.chars)]
    lines = [cl for cl in lines if cl]
    line_texts = [_normalize_form(" ".join(c["text"] for c in cl)) for cl in lines]

    person_lines = [cl for cl in lines if _looks_like_person(cl)]
    cuts = _column_cuts(person_lines)
    if len(cuts) < 3:
        cuts = NOMINAL_CUTS
    cuts = cuts[:3]

    rows: list[tuple[str, list[str]]] = []
    for clusters in person_lines:
        cells: list[list[str]] = [[] for _ in range(len(cuts) + 1)]
        for cl in clusters:
            col = sum(1 for cut in cuts if cl["x0"] > cut)
            cells[col].append(cl["text"])
        joined = [_normalize_form(" ".join(c)) for c in cells]
        label = joined[0]
        # On narrow pages the "jis, ji, jie, jos" label bleeds into column 1.
        if label.startswith("jis"):
            m = re.match(r"^jis,?\s*ji,?\s*jie,?\s*jos,?\s*(.*)$", label)
            if m:
                leftover = m.group(1).strip()
                label = "jis, ji, jie, jos"
                if leftover:
                    joined[1] = _normalize_form(leftover + " " + joined[1])
        rows.append((label, joined[1:]))
    return rows, line_texts


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_header_skip(line: str) -> bool:
    skip_prefixes = (
        "TIESIOGINĖ", "TARIAMOJI", "LIEPIAMOJI", "NUOSAKA",
        "Esamasis laikas", "Būtasis kartinis", "Būtasis dažninis",
        "Būsimasis laikas", "NEASMENUOJAMOSIOS",
    )
    return any(line.startswith(p) for p in skip_prefixes)


def _parse_header(line: str):
    """Parse 'abejóti, abejója, abejójo сомневаться' -> (inf, pres3p, past3p, ru)."""
    # Find the first Cyrillic character (Unicode block U+0400-U+04FF)
    cyrillic_start = next(
        (i for i, ch in enumerate(line) if 0x0400 <= ord(ch) <= 0x04FF), None
    )
    if cyrillic_start is None:
        return None
    lt_raw = line[:cyrillic_start].strip()
    ru = line[cyrillic_start:].strip()
    parts = [p.strip() for p in lt_raw.split(',')]
    if len(parts) < 3:
        return None
    return parts[0], parts[1], parts[2], ru


def _is_person_line(line: str) -> bool:
    tok = line.split()
    return bool(tok) and tok[0] in ("aš", "tu", "jis,", "mes", "jūs")


def _is_case_question(line: str) -> bool:
    """Lines like 'kuo?', 'ką?', 'dėl ko?', 'kam? ką?', 'neX ko?', etc.
    Note: some PDFs embed a Cyrillic 'о' in 'ko' — we allow mixed chars."""
    # Must end with '?' and not contain the bilingual sentence separator
    return line.endswith("?") and " – " not in line


def _is_non_conj_line(line: str) -> bool:
    return bool(re.match(r'^\d\s', line))


def _is_prefix_form_line(line: str) -> bool:
    """Lines starting with a prefixed verb infinitive (e.g. 'paabejóti ...', 'išáiškinti ...')."""
    # First non-space token must be a non-Cyrillic word ending in -ti or -tis
    tokens = line.split()
    if not tokens:
        return False
    word = tokens[0]
    # Reject if word contains Cyrillic
    if any(0x0400 <= ord(ch) <= 0x04FF for ch in word):
        return False
    # Case question lines like "neáiškinti ko?" end with "?" — not prefix forms
    if line.rstrip().endswith("?"):
        return False
    return bool(re.search(r'ti[s]?$', word, re.IGNORECASE))


# ── Main per-page parser ──────────────────────────────────────────────────────

def parse_verb_page(line_texts: list[str], person_rows: list, page_num: int) -> dict | None:
    """Assemble one verb from a page's reconstructed lines and its person rows.

    Conjugations come from person_rows (column-accurate cells); everything else
    — header, case governance, prefix forms, non-conjugated — is still read off
    the reconstructed line texts by the state machine below.
    """
    lines = [ln.rstrip() for ln in line_texts if ln.strip()]
    if not lines:
        return None

    verb: dict = {
        "number": 0,
        "infinitive": "",
        "present_3p": "",
        "past_3p": "",
        "translation_ru": "",
        "is_reflexive": False,
        "conjugations": {},
        "case_governance": [],
        "prefix_forms": [],
        "non_conjugated": {},
    }

    # ── State machine ────────────────────────────────────────────────────────
    # Sections:
    #   INIT → NUMBER → HEADER → PERSONS → BODY → NON_CONJ → DONE
    state = "INIT"

    persons_seen = 0  # 10 person lines: 5 for block 1, then 5 for block 2

    current_case_q: str | None = None
    current_case_sentences: list = []

    non_conj_combined: dict = {}  # merge lines like "1 form1 form2  5 form3"

    def flush_case():
        nonlocal current_case_q, current_case_sentences
        if current_case_q:
            verb["case_governance"].append(
                {"question": current_case_q, "sentences": current_case_sentences[:]}
            )
        current_case_q = None
        current_case_sentences = []

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if state == "INIT":
            if re.match(r'^\d+$', stripped):
                verb["number"] = int(stripped)
                state = "HEADER"
            i += 1
            continue

        if state == "HEADER":
            parsed = _parse_header(stripped)
            if parsed:
                verb["infinitive"], verb["present_3p"], verb["past_3p"], verb["translation_ru"] = parsed
                verb["is_reflexive"] = verb["infinitive"].endswith("tis") or verb["infinitive"].endswith("tisi")
                state = "PERSONS"
            i += 1
            continue

        if state == "PERSONS":
            if _is_header_skip(stripped):
                i += 1
                continue
            if _is_person_line(stripped):
                persons_seen += 1
                if persons_seen == 10:
                    _build_conjugations(verb, person_rows)
                    _apply_errata(verb)
                    state = "BODY"
            i += 1
            continue

        if state == "BODY":
            # Non-conjugated forms section
            if "NEASMENUOJAMOSIOS FORMOS" in stripped:
                # Handle first non-conj entry on same line: "NEASMENUOJAMOSIOS FORMOS 5 – , – , form"
                rest = stripped.replace("NEASMENUOJAMOSIOS FORMOS", "").strip()
                if rest:
                    _parse_non_conj_line(rest, non_conj_combined)
                state = "NON_CONJ"
                i += 1
                continue

            # Page number at end
            if re.match(r'^\d+$', stripped):
                flush_case()
                i += 1
                continue

            # Prefix form line — check BEFORE sentence to avoid prefix examples
            # being misclassified as case governance sentences
            if _is_prefix_form_line(stripped):
                flush_case()
                _parse_prefix_line(stripped, verb)
                i += 1
                continue

            # Case governance question
            if _is_case_question(stripped):
                flush_case()
                current_case_q = stripped
                current_case_sentences = []
                i += 1
                continue

            # Case governance sentence (LT – RU)
            if current_case_q and " – " in stripped:
                current_case_sentences.append({
                    "lt": stripped.split(" – ")[0].strip(),
                    "ru": " – ".join(stripped.split(" – ")[1:]).strip(),
                })
                i += 1
                continue

            # Continuation of prefix example (indented or starts with Cyrillic)
            if verb["prefix_forms"] and re.match(r'^[А-ЯЁа-яё\s]', stripped):
                verb["prefix_forms"][-1]["example_ru"] = (
                    verb["prefix_forms"][-1].get("example_ru", "") + " " + stripped
                ).strip()
                i += 1
                continue

            i += 1
            continue

        if state == "NON_CONJ":
            # Page number → end
            if re.match(r'^\d+$', stripped):
                break
            _parse_non_conj_line(stripped, non_conj_combined)
            i += 1
            continue

        i += 1

    verb["non_conjugated"] = non_conj_combined
    return verb if verb["infinitive"] else None


def _build_conjugations(verb: dict, person_rows: list):
    """Map the ten person rows onto tenses.

    Rows 0-4  (block 1): [present, past_simple, conditional]
    Rows 5-9  (block 2): [habitual_past, future, imperative]

    Cells come from the page's column corridors, so a cell is the whole form —
    including "tegu X" imperatives and "X / Y" alternates — and column position
    is authoritative rather than inferred from token order.
    """
    tense_map: dict[str, dict] = {
        "indicative_present": {},
        "indicative_past_simple": {},
        "indicative_past_habitual": {},
        "indicative_future": {},
        "conditional": {},
        "imperative": {},
    }
    persons_label = ["aš", "tu", "jis, ji, jie, jos", "mes", "jūs"]
    block1, block2 = person_rows[:5], person_rows[5:10]

    for i, (_person, cells) in enumerate(block1):
        p = persons_label[i]
        for tense, col in (("indicative_present", 0),
                           ("indicative_past_simple", 1),
                           ("conditional", 2)):
            if col < len(cells) and cells[col]:
                tense_map[tense][p] = cells[col]

    for i, (_person, cells) in enumerate(block2):
        p = persons_label[i]
        for tense, col in (("indicative_past_habitual", 0),
                           ("indicative_future", 1),
                           ("imperative", 2)):
            if col < len(cells) and cells[col]:
                tense_map[tense][p] = cells[col]

    verb["conjugations"] = tense_map


def _parse_prefix_line(line: str, verb: dict):
    """
    Parse 'paabejóti Truputį paabejojęs ... – Немного посомневавшись, ...'
    """
    m = re.match(r'^(\S+)\s+(.*)', line)
    if not m:
        return
    prefix_inf = m.group(1)
    rest = m.group(2)
    # Detect prefix by comparing with base infinitive
    base = verb["infinitive"]
    prefix = prefix_inf[: max(0, len(prefix_inf) - len(base))] if prefix_inf.endswith(base) else ""

    entry = {"prefix": prefix, "infinitive": prefix_inf, "example_lt": "", "example_ru": ""}
    if " – " in rest:
        parts = rest.split(" – ", 1)
        entry["example_lt"] = parts[0].strip()
        entry["example_ru"] = parts[1].strip()
    else:
        entry["example_lt"] = rest.strip()
    verb["prefix_forms"].append(entry)


def _parse_non_conj_line(line: str, nc: dict):
    """
    Lines like:
      '1 abejójantis / abejójąs, abejójanti 6 – , – , abejóta'
    Two entries per line separated by the number marker.
    """
    # Split on pattern: digit at word boundary followed by space
    parts = re.split(r'(?<!\d)(\d)\s', line)
    # parts will be like ['', '1', 'form...', '', '6', 'form...']
    i = 0
    while i < len(parts) - 1:
        if re.match(r'^\d$', parts[i]):
            key = parts[i]
            val = parts[i + 1].strip() if i + 1 < len(parts) else ""
            nc[key] = val
            i += 2
        else:
            i += 1


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Extract only first N verbs (0 = all)")
    args = parser.parse_args()

    if not PDF_PATH.exists():
        print(f"ERROR: PDF not found at {PDF_PATH}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    verbs = []
    errors = []

    end_page = FIRST_VERB_PAGE + (args.limit if args.limit else 365)
    end_page = min(end_page, LAST_VERB_PAGE + 1)

    print(f"Extracting verbs from pages {FIRST_VERB_PAGE}–{end_page - 1} (0-indexed)…")

    with pdfplumber.open(PDF_PATH) as pdf:
        total_pages = len(pdf.pages)
        for page_idx in range(FIRST_VERB_PAGE, end_page):
            if page_idx >= total_pages:
                break
            page = pdf.pages[page_idx]
            person_rows, line_texts = read_page(page)
            verb = parse_verb_page(line_texts, person_rows, page_idx)
            expected_num = page_idx - FIRST_VERB_PAGE + 1
            if verb and verb["infinitive"]:
                verbs.append(verb)
                if verb["number"] != expected_num:
                    print(f"  WARN page {page_idx + 1}: expected verb #{expected_num}, got #{verb['number']}")
            else:
                errors.append(page_idx + 1)
                print(f"  WARN page {page_idx + 1}: parse failed — skipping")
                # Insert a placeholder to keep numbering consistent
                verbs.append({
                    "number": expected_num,
                    "infinitive": "",
                    "present_3p": "",
                    "past_3p": "",
                    "translation_ru": "",
                    "is_reflexive": False,
                    "conjugations": {},
                    "case_governance": [],
                    "prefix_forms": [],
                    "non_conjugated": {},
                    "_parse_error": True,
                })

    OUTPUT_PATH.write_text(json.dumps(verbs, ensure_ascii=False, indent=2), encoding="utf-8")

    good = sum(1 for v in verbs if v.get("infinitive"))
    print(f"\nDone: {good} verbs extracted, {len(errors)} parse errors")
    print(f"Output: {OUTPUT_PATH}")

    if errors:
        print(f"Failed pages: {errors}")


if __name__ == "__main__":
    main()
