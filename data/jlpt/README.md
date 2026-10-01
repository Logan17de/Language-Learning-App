# JLPT level-wise study data

This directory is the prep-friendly level-wise view of the repository's JLPT content.

Each level contains:

- `kanji.json` — kanji, meanings, and kana readings.
- `vocabulary.json` — full Japanese vocabulary entries, including kanji+kana, kana-only, and katakana-only words.
- `grammar.json` — grammar patterns in study order.

## Counts

| Level | Kanji | Vocabulary | Grammar |
| --- | ---: | ---: | ---: |
| N5 | 80 | 674 | 82 |
| N4 | 170 | 630 | 112 |
| N3 | 370 | 1659 | 136 |
| N2 | 380 | 1778 | 124 |
| N1 | 1136 | 3070 | 187 |
| **Total** | **2136** | **7811** | **641** |

## Sources

- Kanji: repository kanji bank in `Vocabs/jlpt_all_kanji_with_kana_readings.csv`.
- Grammar: repository canonical catalog in `data/jlpt-catalog.json`.
- Vocabulary: OpenJLPT pinned to commit `88eaef9c589f787194903e733c7f7b6df9d6ebc0` (CC BY-SA 4.0).

> JLPT does not publish a single official fixed vocabulary/kanji-by-level list. These are study-oriented level classifications.
