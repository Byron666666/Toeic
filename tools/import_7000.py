#!/usr/bin/env python3
"""Extract the six-level vocabulary list from the supplied two-column PDF."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber


LEVEL_START_PAGES = {1: 1, 12: 2, 23: 3, 35: 4, 52: 5, 64: 6}
CJK_RE = re.compile(r"[\u3400-\u9fff]")
LATIN_START_RE = re.compile(r"^[A-Za-z]")
POS_TOKEN = r"(?:interj|prep|pron|conj|adj|adv|phr|aux|art|vt|vi|ad|n|v)"
POS_RE = re.compile(
    rf"(?<![A-Za-z])({POS_TOKEN})\.|(?<![A-Za-z])(a)\.(?![A-Za-z])",
    re.IGNORECASE,
)
POS_PREFIX_RE = re.compile(
    rf"^(?:{POS_TOKEN})\.|^a\.(?:\s|[\u3400-\u9fff])",
    re.IGNORECASE,
)
BRACKET_RE = re.compile(r"\[[^\]]+\]")


def clean_line(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip()
    # A few rows inherit punctuation from the preceding wrapped definition.
    return re.sub(r"^[，、；。]\s*(?=[A-Za-z])", "", line)


def is_ignorable(line: str) -> bool:
    return (
        not line
        or "大考中心字彙表" in line
        or re.search(r"恭喜背完\s*Level", line, re.IGNORECASE) is not None
    )


def has_details(line: str) -> bool:
    return "[" in line or POS_RE.search(line) is not None or CJK_RE.search(line) is not None


def looks_like_entry_start(lines: list[str], index: int) -> bool:
    line = lines[index]
    if not LATIN_START_RE.match(line) or POS_PREFIX_RE.match(line):
        return False

    # Most entries contain a phonetic bracket or part-of-speech marker inline.
    if "[" in line or POS_RE.search(line):
        return True

    # Long headwords sometimes wrap before their phonetic or part-of-speech line.
    for offset in (1, 2):
        if index + offset >= len(lines):
            break
        following = lines[index + offset]
        if following.startswith("[") or (following.startswith("/") and "[" in following):
            return True
        if offset == 1 and line.endswith("/") and LATIN_START_RE.match(following) and POS_RE.search(following):
            return True
        if has_details(following):
            break

    return False


def page_lines(page) -> list[str]:
    result: list[str] = []
    for box in ((20, 0, 295, page.height), (300, 0, 590, page.height)):
        text = page.crop(box).extract_text(x_tolerance=1, y_tolerance=2) or ""
        result.extend(clean_line(line) for line in text.splitlines() if clean_line(line))

    # In one source row the following headword is attached directly to the
    # preceding Chinese definition, while its phonetic wraps to the next row.
    repaired: list[str] = []
    for index, line in enumerate(result):
        following = result[index + 1] if index + 1 < len(result) else ""
        attached = re.search(
            r"(?<=[\u3400-\u9fff])([A-Za-z][A-Za-z0-9'./() -]{1,80})$",
            line,
        )
        if attached and following.startswith("[") and "[" in line[: attached.start()]:
            repaired.append(line[: attached.start()].strip())
            repaired.append(attached.group(1).strip())
        else:
            repaired.append(line)
    return repaired


def collect_raw_entries(pdf_path: Path) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = {level: [] for level in range(1, 7)}
    stream: list[dict] = []
    level = 1

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            if page_number in LEVEL_START_PAGES:
                level = LEVEL_START_PAGES[page_number]
            stream.extend(
                {"level": level, "page": page_number, "line": line}
                for line in page_lines(page)
                if not is_ignorable(line)
            )

    current: dict | None = None
    awaiting_details = False
    pending_sense: str | None = None

    lines = [item["line"] for item in stream]
    for index, item in enumerate(stream):
        line = item["line"]
        level = item["level"]
        page_number = item["page"]

        if current and current["level"] != level:
            grouped[current["level"]].append(current)
            current = None
            awaiting_details = False
            pending_sense = None

        if re.fullmatch(r"[1-9]", line):
            pending_sense = line
            continue

        starts_entry = looks_like_entry_start(lines, index)
        if starts_entry and not awaiting_details:
            if current:
                grouped[level].append(current)
            current = {
                "level": level,
                "page": page_number,
                "sense": pending_sense,
                "lines": [line],
            }
            pending_sense = None
            awaiting_details = not has_details(line) or line.endswith("/")
            continue

        if current:
            current["lines"].append(line)
            if awaiting_details and has_details(line):
                awaiting_details = False

    if current:
        grouped[current["level"]].append(current)

    return grouped


def normalize_word(value: str) -> str:
    value = re.sub(r"\s*/\s*", " / ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" -/")


def parse_entry(level: int, index: int, entry: dict) -> dict:
    raw = clean_line(" ".join(entry["lines"]))
    first_cjk = CJK_RE.search(raw)
    meaning_start = first_cjk.start() if first_cjk else len(raw)
    if meaning_start and raw[meaning_start - 1] == "【":
        meaning_start -= 1
    prefix = raw[:meaning_start].strip()

    first_bracket = prefix.find("[")
    first_pos = POS_RE.search(prefix)
    detail_offsets = [offset for offset in (first_bracket, first_pos.start() if first_pos else -1) if offset >= 0]
    word_end = min(detail_offsets) if detail_offsets else len(prefix)
    word = normalize_word(prefix[:word_end])
    # Preserve aliases whose phonetics are interleaved, e.g. bun [..] /roll [..]
    # and congressman [..]/congresswoman [..].
    if first_pos:
        head_region = prefix[:first_pos.start()]
        word = normalize_word(BRACKET_RE.sub("", head_region))

    # `(phr.)` is a label, not part of the headword.
    word = re.sub(r"\s*\(phr\.\)?\s*$", "", word, flags=re.IGNORECASE).rstrip(" (")
    if entry.get("sense") and not re.search(rf"\({entry['sense']}\)\s*$", word):
        word = f"{word} ({entry['sense']})"

    phonetics = []
    for match in BRACKET_RE.findall(prefix):
        inner = match[1:-1].strip()
        if inner.upper() not in {"C", "U", "T"} and not CJK_RE.search(inner):
            phonetics.append(match)

    part_tokens: list[str] = []
    for match in POS_RE.finditer(prefix):
        token = (match.group(1) or match.group(2)).lower()
        display = {
            "a": "adj",
            "ad": "adv",
        }.get(token, token)
        if display not in part_tokens:
            part_tokens.append(display)

    # Never split on the first Chinese character: that cuts off labels,
    # opening parentheses and English text such as "DVD" in the definition.
    meaning = raw[word_end:].strip()
    if first_pos:
        meaning = raw[first_pos.end():].strip()
    else:
        meaning = re.sub(r"^(?:\[[^\]]+\]\s*)+", "", meaning).strip()
    meaning = re.sub(r"\s+", " ", meaning)
    meaning = meaning.replace("\uf0df", "←").replace("\uf0f3", "↔")

    return {
        "id": f"l{level}-{index:04d}",
        "word": word,
        "phonetic": " ".join(phonetics),
        "partOfSpeech": " / ".join(part_tokens),
        "meaning": meaning,
        "sourcePage": entry["page"],
        "sourceText": raw,
    }


def build_payload(pdf_path: Path) -> dict:
    raw_levels = collect_raw_entries(pdf_path)
    levels = []
    for level in range(1, 7):
        words = [
            parse_entry(level, index, entry)
            for index, entry in enumerate(raw_levels[level], start=1)
        ]
        levels.append({"level": level, "label": f"Level {level}", "words": words})
    return {
        "title": "大考中心 7000 單字",
        "source": "大考中心字彙表 LEVEL 1-6",
        "nominalWordsPerLevel": 1080,
        "levels": levels,
    }


def validate(payload: dict) -> None:
    errors = []
    for level in payload["levels"]:
        for word in level["words"]:
            if not word["word"]:
                errors.append(f"{word['id']}: missing word")
            if not word["meaning"]:
                errors.append(f"{word['id']} {word['word']}: missing meaning")
    if errors:
        raise ValueError("\n".join(errors[:30]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args.pdf)
    validate(payload)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, separators=None if args.pretty else (",", ":"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(f"window.GSAT_7000_DATA = {serialized};\n", encoding="utf-8")

    counts = {item["level"]: len(item["words"]) for item in payload["levels"]}
    missing_phonetic = Counter(
        item["level"]
        for item in payload["levels"]
        for word in item["words"]
        if not word["phonetic"]
    )
    print(json.dumps({"counts": counts, "missingPhonetic": dict(missing_phonetic)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
