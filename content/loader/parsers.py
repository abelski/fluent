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
class GrammarRuleRow:
    case_index: int
    name_ru: str
    question: str
    usage: str
    endings_sg: str
    endings_pl: str
    transform: str


@dataclass
class GrammarFileResult:
    case_index: int
    rule: GrammarRuleRow | None  # present when all rule headers are found in this file
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
    name_ru: str | None = None
    question: str | None = None
    usage: str | None = None
    endings_sg: str | None = None
    endings_pl: str | None = None
    transform: str | None = None
    sentences: list[GrammarSentenceRow] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("#"):
            content = line[1:].strip()
            if content.startswith("case_index:"):
                case_index = int(content.split(":", 1)[1].strip())
            elif content.startswith("name_ru:"):
                name_ru = content.split(":", 1)[1].strip()
            elif content.startswith("question:"):
                question = content.split(":", 1)[1].strip()
            elif content.startswith("usage:"):
                usage = content.split(":", 1)[1].strip()
            elif content.startswith("endings_sg:"):
                endings_sg = content.split(":", 1)[1].strip()
            elif content.startswith("endings_pl:"):
                endings_pl = content.split(":", 1)[1].strip()
            elif content.startswith("transform:"):
                transform = content.split(":", 1)[1].strip()
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

    rule: GrammarRuleRow | None = None
    if all(v is not None for v in [name_ru, question, usage, endings_sg, endings_pl, transform]):
        rule = GrammarRuleRow(
            case_index=case_index,
            name_ru=name_ru,  # type: ignore[arg-type]
            question=question,  # type: ignore[arg-type]
            usage=usage,  # type: ignore[arg-type]
            endings_sg=endings_sg,  # type: ignore[arg-type]
            endings_pl=endings_pl,  # type: ignore[arg-type]
            transform=transform,  # type: ignore[arg-type]
        )

    return GrammarFileResult(case_index=case_index, rule=rule, sentences=sentences)


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


@dataclass
class ArticleResult:
    slug: str
    title_ru: str
    title_en: str
    body_ru: str
    body_en: str
    tags: str
    published: bool


def parse_article_file(path: Path) -> ArticleResult:
    """Parse a bilingual article markdown file with YAML frontmatter.

    Format:
        ---
        slug: some-slug
        title_ru: ...
        title_en: ...
        tags: tag1,tag2
        published: true
        ---

        <Russian body>

        ---EN---

        <English body>
    """
    import re
    content = path.read_text(encoding="utf-8")

    fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not fm_match:
        raise ValueError(f"Missing frontmatter in {path}")

    fm = fm_match.group(1)
    body_part = content[fm_match.end():]

    def _get(key: str) -> str:
        m = re.search(rf"^{key}:\s*(.+)$", fm, re.MULTILINE)
        return m.group(1).strip() if m else ""

    slug = _get("slug") or path.stem
    title_ru = _get("title_ru")
    title_en = _get("title_en")
    tags = _get("tags")
    published = _get("published").lower() != "false"

    if "---EN---" in body_part:
        parts = body_part.split("---EN---", 1)
        body_ru = parts[0].strip()
        body_en = parts[1].strip()
    else:
        body_ru = body_part.strip()
        body_en = ""

    return ArticleResult(
        slug=slug,
        title_ru=title_ru,
        title_en=title_en,
        body_ru=body_ru,
        body_en=body_en,
        tags=tags,
        published=published,
    )


def scan_article_files(articles_dir: Path) -> list[ArticleResult]:
    """Recursively find and parse all .md files under articles_dir."""
    results = []
    for md_file in sorted(articles_dir.rglob("*.md")):
        results.append(parse_article_file(md_file))
    return results


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
