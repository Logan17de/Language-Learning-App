# Kanji Reading Practice (from Kanji Recall v32)

This is a cumulative, feedback-driven **reading-only** track. The learner reads Japanese stories without furigana, romaji, or translations. After the learner reports unknown or difficult kanji, explain the *specific* characters/words (reading, meaning, and an example), and **commit the feedback to `progress.json` on GitHub** before selecting the next lesson.

## Source and rules

- Repository vocabulary: `data/kanji-recall-v32/compound/N*.json` and `data/kanji-recall-v32/kana-kanji/N*.json` (extracted unmodified from the uploaded APK).
- `kanji-level-index.json`: N5–N1 single-character level assignments, derived from the **same** APK's 2,136 `targetType: single` entries. `n5-single-cards.json` contains the meanings/readings/source IDs for the 80 N5 single kanji.
- **Strict character-level gating:** N5 stories may only contain kanji explicitly classified as N5 in the APK's **single-kanji** catalog, even if an N5 compound or mixed-kana entry contains a higher-level character. Native Japanese kana, punctuation, and ordinary kana-only connective words are allowed.
- Remain at the current JLPT level until **10 or fewer characters in that level are not yet confirmed strong**. Then and only then, introduce the next level. Do not infer that reading without reporting a problem is evidence of mastery unless the learner says so. When later introducing a level, characters of all cleared lower levels may freely recur.
- Each next story must preferentially sample **unknown**, then **weak**, then **unassessed** kanji/words from the current level. Known/strong characters may be recycled for fluency and natural storytelling.
- `progress.json`: map a kanji character to `{ "status": "weak"|"unknown"|"strong", "last_lesson": "N5-001", "note": "..." }`. Map a vocabulary target similarly under `vocabulary` (target string as key, with `type` if needed). Missing entries are **unassessed**, not strong. Only update based on explicitly reported or tested outcomes.
- Preserve lesson text unchanged once assigned; future lessons should be separate `stories/N5-002.*` etc. Keep lesson history and update the progress file after each feedback session.

## Verify a lesson

From repository root:

```bash
python practice/kanji-reading/validate_stories.py
```

Validator checks that every kanji in story title/text is within the permitted character-level catalog and each focus card/inflected surface is grounded in the APK's N5 vocabulary exports. The file also checks the promotion threshold from progress. If higher-level kanji appear before the threshold, it fails.

No score is assigned to the learner in the initial lesson. Feedback is pending.