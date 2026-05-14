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
from pathlib import Path

import pdfplumber

PDF_PATH = Path("temp_files/books/2015_365_lietuvių_kalbos_veiksmažodžiai_rusų_kalba.pdf")
OUTPUT_PATH = Path("temp_files/verbs_extracted.json")

# Page indices (0-based): verb #N is on page 33+N (verb 1 = page index 34)
FIRST_VERB_PAGE = 34   # 0-indexed
LAST_VERB_PAGE = 398   # 0-indexed (365 verbs = pages 34-398)

PERSONS_ORDER = ["aš", "tu", "jis", "mes", "jūs"]


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


def _parse_person_row(line: str):
    """
    Parse a conjugation row line → (person_label, [form1, form2, ...]).
    Handles 'jis, ji, jie, jos' multi-token person and 'X / Y' alternate forms.
    """
    tokens = line.split()
    if not tokens:
        return None

    # Detect jis-row: first token ends with comma and second looks like "ji,"
    if tokens[0] in ("jis,", "jie,") or (len(tokens) > 1 and tokens[1] == "ji,"):
        person = "jis, ji, jie, jos"
        form_tokens = tokens[4:]  # skip "jis, ji, jie, jos"
    elif tokens[0] in ("aš", "tu", "mes", "jūs"):
        person = tokens[0]
        form_tokens = tokens[1:]
    else:
        return None

    # Merge "X / Y" alternate form sequences into a single string
    forms: list[str] = []
    i = 0
    while i < len(form_tokens):
        if i + 2 < len(form_tokens) and form_tokens[i + 1] == "/":
            forms.append(f"{form_tokens[i]} / {form_tokens[i + 2]}")
            i += 3
        else:
            forms.append(form_tokens[i])
            i += 1
    return person, forms


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

def parse_verb_page(text: str, page_num: int) -> dict | None:
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
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
    #   INIT → NUMBER → HEADER → BLOCK1 → BLOCK2 → BODY → NON_CONJ → DONE
    state = "INIT"

    block1_rows: list = []  # 5 rows: [person, pres, past_simple, conditional]
    block2_rows: list = []  # 5 rows: [person, hab_past, future, (imperative)]

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
                state = "BLOCK1"
            i += 1
            continue

        if state == "BLOCK1":
            if _is_header_skip(stripped):
                i += 1
                continue
            row = _parse_person_row(stripped)
            if row:
                block1_rows.append(row)
                if len(block1_rows) == 5:
                    state = "BLOCK2"
            i += 1
            continue

        if state == "BLOCK2":
            if _is_header_skip(stripped):
                i += 1
                continue
            row = _parse_person_row(stripped)
            if row:
                block2_rows.append(row)
                if len(block2_rows) == 5:
                    # Build conjugations dict from both blocks
                    _build_conjugations(verb, block1_rows, block2_rows)
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


def _build_conjugations(verb: dict, block1: list, block2: list):
    """
    Block 1 rows: person, [present, past_simple, conditional]
    Block 2 rows: person, [habitual_past, future, (imperative)]
    """
    tense_map = {
        "indicative_present": {},
        "indicative_past_simple": {},
        "indicative_past_habitual": {},
        "indicative_future": {},
        "conditional": {},
        "imperative": {},
    }
    persons_label = ["aš", "tu", "jis, ji, jie, jos", "mes", "jūs"]

    for i, (person, forms) in enumerate(block1):
        p = persons_label[i]
        if len(forms) >= 1:
            tense_map["indicative_present"][p] = forms[0]
        if len(forms) >= 2:
            tense_map["indicative_past_simple"][p] = forms[1]
        if len(forms) >= 3:
            tense_map["conditional"][p] = forms[2]

    for i, (person, forms) in enumerate(block2):
        p = persons_label[i]
        if len(forms) >= 1:
            tense_map["indicative_past_habitual"][p] = forms[0]
        if len(forms) >= 2:
            tense_map["indicative_future"][p] = forms[1]
        # Imperative: aš has none; jis row uses "tegu" + next token
        if len(forms) >= 3:
            imp = forms[2]
            if imp == "tegu" and len(forms) >= 4:
                imp = f"tegu {forms[3]}"
            tense_map["imperative"][p] = imp

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
            text = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
            verb = parse_verb_page(text, page_idx)
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
