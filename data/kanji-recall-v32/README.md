# Kanji Recall v32 vocabulary export

This data was extracted without altering the card records from **Kanji-Recall-v32-Stable-MultiSelect-Native-Export.apk** (embedded `assets/data/cards.js`).
Only the two requested categories are included:

- **`compound/`**: `targetType: "compound"`, 2,882 compound kanji vocabulary cards.
- **`kana-kanji/`**: `targetType: "kana"`, 1,981 mixed kanji + kana vocabulary cards (e.g. 会う).

Each `N5-001.json`-style file is a UTF-8 JSON array of up to 200 unmodified cards, grouped by their original JLPT level. All fields, meanings, readings, breakdowns, mnemonics, examples, source IDs, and origin metadata are retained. There are **4,863 cards total**. No `targetType: "single"` cards or learner progress are included.

`manifest.json` includes exact counts and SHA-256 checksums for reproducibility and integrity checking.

### Read all cards in Python

```python
import json, pathlib
root = pathlib.Path('data/kanji-recall-v32')
compounds = [c for p in sorted((root / 'compound').glob('*.json')) for c in json.loads(p.read_text(encoding='utf-8'))]
kana_kanji = [c for p in sorted((root / 'kana-kanji').glob('*.json')) for c in json.loads(p.read_text(encoding='utf-8'))]
```

### Attribution and license notes

Mixed kanji + kana records declare `dataSource: "OpenJLPT / JMdict (CC BY-SA 4.0)"` in the APK. Preserve this attribution and comply with upstream licensing when redistributing or transforming those records. Other records preserve their original `sourceId`; verify the original source licensing before republishing beyond this repository.