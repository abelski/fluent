# Pure parsing functions for content text files.
# No DB access — fully unit-testable in isolation.
#
# Grammar file format (content/grammar/<case>/<set>.txt):
#   # case_index: N
#   # name: ...
#   # question: ...
#   # usage: ...
#   # endings: ...
#   display | answer_ending | full_word | russian
#
# Vocabulary file format (content/vocabulary/<subcategory>/<set>.txt):
#   # Description: ...
#   lithuanian | english | russian | hint

from pathlib import Path
from dataclasses import dataclass


@dataclass
class GrammarSentenceRow:
    case_index: int
    display: str
    answer_ending: str
    full_word: str
    russian: str


@dataclass
class GrammarFileResult:
    case_index: int
    sentences: list[GrammarSentenceRow]


@dataclass
class VocabWordRow:
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: str | None


@dataclass
class VocabFileResult:
    subcategory: str   # parent folder name
    title: str         # filename without extension
    description: str | None
    words: list[VocabWordRow]


def parse_grammar_file(path: Path) -> GrammarFileResult:
    """Parse a grammar exercise file and return header metadata + sentence rows."""
    case_index: int | None = None
    sentences: list[GrammarSentenceRow] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("#"):
            # Header metadata line
            content = line[1:].strip()
            if content.startswith("case_index:"):
                case_index = int(content.split(":", 1)[1].strip())
            continue

        # Data line — must have exactly 4 pipe-separated fields
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 4:
            continue
        display, answer_ending, full_word, russian = parts
        if not display or not answer_ending:
            continue
        if case_index is None:
            raise ValueError(f"case_index not set before data lines in {path}")
        sentences.append(GrammarSentenceRow(
            case_index=case_index,
            display=display,
            answer_ending=answer_ending,
            full_word=full_word,
            russian=russian,
        ))

    if case_index is None:
        raise ValueError(f"No case_index header found in {path}")

    return GrammarFileResult(case_index=case_index, sentences=sentences)


def parse_vocab_file(path: Path) -> VocabFileResult:
    """Parse a vocabulary file and return subcategory, title, description, and word rows."""
    subcategory = path.parent.name
    title = path.stem  # filename without extension
    description: str | None = None
    words: list[VocabWordRow] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("#"):
            content = line[1:].strip()
            if content.lower().startswith("description:"):
                description = content.split(":", 1)[1].strip()
            continue

        # Data line — 3 or 4 pipe-separated fields
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue
        lithuanian = parts[0]
        translation_en = parts[1]
        translation_ru = parts[2]
        hint = parts[3] if len(parts) >= 4 and parts[3] else None
        if not lithuanian:
            continue
        words.append(VocabWordRow(
            lithuanian=lithuanian,
            translation_en=translation_en,
            translation_ru=translation_ru,
            hint=hint,
        ))

    return VocabFileResult(
        subcategory=subcategory,
        title=title,
        description=description,
        words=words,
    )


def scan_grammar_files(grammar_dir: Path) -> list[GrammarFileResult]:
    """Recursively find and parse all .txt files under grammar_dir."""
    results = []
    for txt_file in sorted(grammar_dir.rglob("*.txt")):
        results.append(parse_grammar_file(txt_file))
    return results


def scan_vocab_files(vocab_dir: Path) -> list[VocabFileResult]:
    """Recursively find and parse all .txt files under vocab_dir."""
    results = []
    for txt_file in sorted(vocab_dir.rglob("*.txt")):
        results.append(parse_vocab_file(txt_file))
    return results
