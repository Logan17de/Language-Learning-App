#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "jlpt"
CATALOG = ROOT / "data" / "jlpt-catalog.json"
KANJI_CSV = ROOT / "Vocabs" / "jlpt_all_kanji_with_kana_readings.csv"

LEVELS = ["N5", "N4", "N3", "N2", "N1"]
OPENJLPT_COMMIT = "88eaef9c589f787194903e733c7f7b6df9d6ebc0"
OPENJLPT_BASE = (
    "https://raw.githubusercontent.com/evanclan/OpenJLPT/"
    + OPENJLPT_COMMIT
    + "/data/json/vocab"
)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_catalog():
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def load_kanji():
    by_level = {level: [] for level in LEVELS}
    with KANJI_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            level = row["introduced_level"].strip()
            if level not in by_level:
                continue
            readings = [x.strip() for x in row["readings_kana"].split("|") if x.strip()]
            by_level[level].append(
                {
                    "id": row["id"],
                    "kanji": row["kanji"],
                    "meaning": row["english_meaning"],
                    "readings": readings,
                    "level": level,
                    "compound_count": int(row["compound_count"] or 0),
                }
            )
    return by_level


def load_grammar(catalog):
    by_level = {level: [] for level in LEVELS}
    for item in catalog.get("grammar", []):
        level = item.get("level")
        if level in by_level:
            by_level[level].append(
                {
                    "position": item.get("position"),
                    "pattern": item.get("pattern"),
                    "level": level,
                }
            )
    for level in LEVELS:
        by_level[level].sort(key=lambda x: x["position"] or 0)
    return by_level


def writing_type(word: str) -> str:
    has_kanji = bool(re.search(r"[一-龯々〆ヵヶ]", word))
    has_hira = bool(re.search(r"[ぁ-ゖ]", word))
    has_kata = bool(re.search(r"[ァ-ヺー]", word))
    if has_kanji and (has_hira or has_kata):
        return "mixed"
    if has_kanji:
        return "kanji"
    if has_kata and not has_hira:
        return "katakana"
    return "hiragana"


def load_vocab():
    by_level = {level: [] for level in LEVELS}
    for level in LEVELS:
        url = f"{OPENJLPT_BASE}/{level.lower()}.json"
        with urllib.request.urlopen(url, timeout=90) as response:
            items = json.load(response)

        for item in items:
            word = (item.get("word") or "").strip()
            if not word:
                continue
            reading = (item.get("reading") or word).strip()
            meanings = [str(x).strip() for x in item.get("meanings", []) if str(x).strip()]
            by_level[level].append(
                {
                    "id": item.get("id"),
                    "word": word,
                    "reading": reading,
                    "romaji": item.get("romaji") or "",
                    "meanings": meanings,
                    "level": level,
                    "writing_type": writing_type(word),
                    "pos": item.get("pos") or [],
                    "jmdict_id": item.get("jmdict_id"),
                }
            )
    return by_level


def validate(catalog, kanji, grammar, vocab):
    expected_kanji = catalog["counts"]["kanji"]
    expected_grammar = catalog["counts"]["grammar"]

    for level in LEVELS:
        assert len(kanji[level]) == expected_kanji[level], (
            level,
            "kanji",
            len(kanji[level]),
            expected_kanji[level],
        )
        assert len(grammar[level]) == expected_grammar[level], (
            level,
            "grammar",
            len(grammar[level]),
            expected_grammar[level],
        )
        assert vocab[level], f"{level}: vocabulary is empty"

        chars = [x["kanji"] for x in kanji[level]]
        assert len(chars) == len(set(chars)), f"{level}: duplicate kanji"

        vocab_ids = [x["id"] for x in vocab[level]]
        assert len(vocab_ids) == len(set(vocab_ids)), f"{level}: duplicate vocab IDs"

    assert sum(len(kanji[x]) for x in LEVELS) == 2136
    assert sum(len(grammar[x]) for x in LEVELS) == 641


def main():
    catalog = load_catalog()
    kanji = load_kanji()
    grammar = load_grammar(catalog)
    vocab = load_vocab()

    validate(catalog, kanji, grammar, vocab)

    manifest = {
        "schema_version": 1,
        "levels": {},
        "totals": {
            "kanji": sum(len(kanji[x]) for x in LEVELS),
            "vocabulary": sum(len(vocab[x]) for x in LEVELS),
            "grammar": sum(len(grammar[x]) for x in LEVELS),
        },
        "sources": {
            "kanji": "Vocabs/jlpt_all_kanji_with_kana_readings.csv",
            "grammar": "data/jlpt-catalog.json",
            "vocabulary": {
                "name": "OpenJLPT",
                "repository": "https://github.com/evanclan/OpenJLPT",
                "commit": OPENJLPT_COMMIT,
                "license": "CC BY-SA 4.0",
            },
        },
    }

    for level in LEVELS:
        level_dir = OUT / level
        write_json(level_dir / "kanji.json", kanji[level])
        write_json(level_dir / "vocabulary.json", vocab[level])
        write_json(level_dir / "grammar.json", grammar[level])

        manifest["levels"][level] = {
            "kanji": len(kanji[level]),
            "vocabulary": len(vocab[level]),
            "grammar": len(grammar[level]),
        }

    write_json(OUT / "manifest.json", manifest)

    lines = [
        "# JLPT level-wise study data",
        "",
        "This directory is the prep-friendly level-wise view of the repository's JLPT content.",
        "",
        "Each level contains:",
        "",
        "- `kanji.json` — kanji, meanings, and kana readings.",
        "- `vocabulary.json` — full Japanese vocabulary entries, including kanji+kana, kana-only, and katakana-only words.",
        "- `grammar.json` — grammar patterns in study order.",
        "",
        "## Counts",
        "",
        "| Level | Kanji | Vocabulary | Grammar |",
        "| --- | ---: | ---: | ---: |",
    ]
    for level in LEVELS:
        c = manifest["levels"][level]
        lines.append(f"| {level} | {c['kanji']} | {c['vocabulary']} | {c['grammar']} |")
    t = manifest["totals"]
    lines += [
        f"| **Total** | **{t['kanji']}** | **{t['vocabulary']}** | **{t['grammar']}** |",
        "",
        "## Sources",
        "",
        "- Kanji: repository kanji bank in `Vocabs/jlpt_all_kanji_with_kana_readings.csv`.",
        "- Grammar: repository canonical catalog in `data/jlpt-catalog.json`.",
        f"- Vocabulary: OpenJLPT pinned to commit `{OPENJLPT_COMMIT}` (CC BY-SA 4.0).",
        "",
        "> JLPT does not publish a single official fixed vocabulary/kanji-by-level list. These are study-oriented level classifications.",
        "",
    ]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
