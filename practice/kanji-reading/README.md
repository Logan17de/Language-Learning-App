# Kanji Reading Practice (from Kanji Recall v32)
> **Current curriculum override (2026-10-15):** The learner explicitly advanced the overall study ceiling from N4 to **N2** for an N5–N2 30-day reading-and-meaning program. Older N4 gating paragraphs below describe historical lessons, not the current ceiling. N1 remains excluded. Keep compound and kanji+kana targets independent, with no component-kanji demotion from a whole-word miss. See `N2-30-day-plan-2026-10-15.md`, `sessions/2026-10-15-N2-baseline.json`, `word-review-stats.json`, and `progress.json`.


This is a cumulative, feedback-driven **reading-only** track. The learner reads Japanese stories without furigana, romaji, or translations. After the learner reports unknown or difficult kanji, explain the *specific* characters/words (reading, meaning, and an example), and **commit the feedback to `progress.json` on GitHub** before selecting the next lesson.

## Source and rules

- Repository vocabulary: `data/kanji-recall-v32/compound/N*.json` and `data/kanji-recall-v32/kana-kanji/N*.json` (extracted unmodified from the uploaded APK).
- `kanji-level-index.json`: N5–N1 single-character level assignments, derived from the **same** APK's 2,136 `targetType: single` entries. `n5-single-cards.json` contains the meanings/readings/source IDs for the 80 N5 single kanji.
- **Strict character-level gating:** N5 stories may only contain kanji explicitly classified as N5 in the APK's **single-kanji** catalog, even if an N5 compound or mixed-kana entry contains a higher-level character. Native Japanese kana, punctuation, and ordinary kana-only connective words are allowed.
- Normally remain at the current JLPT level until **10 or fewer characters in that level are not yet confirmed strong** before automatically advancing. **Explicit learner override (2026-10-14): move to N4 immediately**, retaining all prior N5 strong, weak and unassessed statuses. Mix any N5 character with N4, but never add N3 or above until an explicit new override or the normal N4 promotion gate opens. Do not infer mastery from silence. N5 kanji encountered in N4 stories can become weak when the learner reports trouble.
- Each next story must preferentially sample **unknown**, then **weak**, then **unassessed** kanji/words from the current level. Known/strong characters may be recycled for fluency and natural storytelling.
- `progress.json`: map a kanji character to `{ "status": "strong"|"familiar"|"weak"|"unknown", "last_lesson": "N5-001", "note": "..." }`. Map a vocabulary target similarly under `vocabulary` (target string as key, with `type` if needed). Missing entries are **unassessed**, not strong. Only update based on explicitly reported or tested outcomes.
- Preserve lesson text unchanged once assigned; future lessons should be separate `stories/N5-002.*` etc. Keep lesson history and update the progress file after each feedback session.

## Verify a lesson

From repository root:

```bash
python practice/kanji-reading/validate_stories.py
```

Validator checks that every kanji in a story title/text is within the permitted single-kanji level catalog and each focus card (N4 or reused N5) matches the APK's exported vocabulary at its recorded `source_level`. It also checks the current-level promotion threshold; a learner-requested manual level transition is recorded in progress and requires no claim that N5 is mastered. If higher-level kanji appear before the threshold, it fails.

Story N5-001: learner confirmed reading all 32 distinct kanji and 20 focus entries without difficulty on 2026-10-14; recorded as strong in story context. Story N5-002 has partial feedback (weak 木, 下りる and 一本); N4-001 is now awaiting feedback after a manual, user-authorized increase in difficulty.

## Kanji Recall app memory snapshot (2026-10-14)

- Full original user export: `app-exports/kanji-recall-2026-10-14-export.json` (exact original bytes, SHA Git blob 5a6883025798c08466ac0d2fc0f183f7b5b7cfdc). Includes 1,062 word memory states, 46 app-specific weak characters, settings and dated practice history. Summary and level-separated memory indices: `app-exports/2026-10-14-summary.json`.
- The app's `mastered`, `familiar`, `weak`, `unknown` statuses belong to **vocabulary entries**, not individual kanji. Never mark individual characters as mastered solely from a compound state. The separately recorded `weakKanji` list is character-level app feedback.
- For the active N4 reading curriculum, first choose **unknown/weak N4 vocabulary** whose characters all belong to the APK's N4+N5 *single-kanji whitelist*, then reinforce N5 words/characters the learner struggles with. Mix familiar/mastered items for fluency; skip any N3+ characters even if the app classifies the word N4.
- **Latest explicit story feedback overrides older app memory for the same target.** Keep `progress.json` manually verified per-kanji statuses separate from the imported app snapshot. Example: app `下りる` is familiar, but a later reading lesson found it weak, so it stays a review priority. App `中止` is unknown, and story reading also reported difficulty, so prioritize it.
- Each new app export can replace or version the snapshot separately; do not discard historical story feedback.

## User-confirmed interpretation of app memory states (2026-10-14)

These definitions are from the learner, **not** an inference based on the export's labels:

- **Familiar:** The learner **can recognize** the kanji/vocabulary, but needs approximately **10 seconds**. Treat as **slow recognition**, not mastery. Revisit in short reading contexts to build faster recall. Never automatically promote familiar to strong merely because it appeared in a story.
- **Weak:** The learner **does not know the reading or the meaning** (one or both may be missing). This needs focused reinforcement in multiple stories, plus specific checking of the reading and meaning during subsequent feedback.
- **Unknown:** The kanji/vocabulary is **very new** to the learner. Introduce it with gentle contextual repetition before assuming familiarity.
- **Mastered:** Retain the app's label without assigning a new proficiency/time-based definition; the learner has not provided one. Can be used for natural supporting language.

Important: These labels in the imported `latestStates` apply to **whole vocabulary targets**. Never assume that every component kanji has the same memory state. Keep explicit story-reading corrections and individual-kanji statuses in `progress.json`; new corrections can make an app-familiar word a reading weakness without altering the unmodified raw export. For N4 stories, prioritize permitted N4 weak and unknown vocabulary, deliberately repeat N4 familiar vocabulary to improve **recognition speed**, then weave in mastered N4/N5 and weak N5 words. N3+ kanji remain excluded.

- Story feedback can be more granular than the raw app categories: **incorrect reading** (store attempted and correct readings), **meaning-only gap** (do not demote correctly read individual characters), and **hesitant but eventually recalled** (store vocabulary as `familiar` until faster recognition is confirmed). Do not automatically transfer a compound's weak status to individually mastered kanji. Story N4-004 demonstrates this for 特色, 休業 and 主人.
