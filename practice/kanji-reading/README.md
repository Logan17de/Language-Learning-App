# Kanji Reading Practice (from Kanji Recall v32)

This is a cumulative, feedback-driven **reading-only** track. The learner reads Japanese stories without furigana, romaji, or translations. After the learner reports unknown or difficult kanji, explain the *specific* characters/words (reading, meaning, and an example), and **commit the feedback to `progress.json` on GitHub** before selecting the next lesson.

## Source and rules

- Repository vocabulary: `data/kanji-recall-v32/compound/N*.json` and `data/kanji-recall-v32/kana-kanji/N*.json` (extracted unmodified from the uploaded APK).
- `kanji-level-index.json`: N5–N1 single-character level assignments, derived from the **same** APK's 2,136 `targetType: single` entries. `n5-single-cards.json` contains the meanings/readings/source IDs for the 80 N5 single kanji.
- **Strict character-level gating:** N5 stories may only contain kanji explicitly classified as N5 in the APK's **single-kanji** catalog, even if an N5 compound or mixed-kana entry contains a higher-level character. Native Japanese kana, punctuation, and ordinary kana-only connective words are allowed.
- Normally remain at the current JLPT level until **10 or fewer characters in that level are not yet confirmed strong** before automatically advancing. **Explicit learner override (2026-10-14): move to N4 immediately**, retaining all prior N5 strong, weak and unassessed statuses. Mix any N5 character with N4, but never add N3 or above until an explicit new override or the normal N4 promotion gate opens. Do not infer mastery from silence. N5 kanji encountered in N4 stories can become weak when the learner reports trouble.
- Each next story must preferentially sample **unknown**, then **weak**, then **unassessed** kanji/words from the current level. Known/strong characters may be recycled for fluency and natural storytelling.
- `progress.json`: map a kanji character to `{ "status": "weak"|"unknown"|"strong", "last_lesson": "N5-001", "note": "..." }`. Map a vocabulary target similarly under `vocabulary` (target string as key, with `type` if needed). Missing entries are **unassessed**, not strong. Only update based on explicitly reported or tested outcomes.
- Preserve lesson text unchanged once assigned; future lessons should be separate `stories/N5-002.*` etc. Keep lesson history and update the progress file after each feedback session.

## Verify a lesson

From repository root:

```bash
python practice/kanji-reading/validate_stories.py
```

Validator checks that every kanji in a story title/text is within the permitted single-kanji level catalog and each focus card (N4 or reused N5) matches the APK's exported vocabulary at its recorded `source_level`. It also checks the current-level promotion threshold; a learner-requested manual level transition is recorded in progress and requires no claim that N5 is mastered. If higher-level kanji appear before the threshold, it fails.

Story N5-001: learner confirmed reading all 32 distinct kanji and 20 focus entries without difficulty on 2026-10-14; recorded as strong in story context. Story N5-002 has partial feedback (weak 木, 下りる and 一本); N4-001 is now awaiting feedback after a manual, user-authorized increase in difficulty.