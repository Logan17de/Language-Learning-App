# AIko canonical lesson contract

AIko has one learner-facing lesson shape. Producers may use different generation workflows internally, but a stored/playable lesson must resolve to this contract.

## Phase order

1. Story
2. Vocabulary & kanji
3. Grammar
4. Reading
5. Listening
6. Speaking
7. Final review

`lesson_versions.phases` is normalized to this order by the database. The mapper also normalizes historical phase metadata defensively.

## Activity banks

| Phase | Required activities |
| --- | ---: |
| Vocabulary & kanji | 13 (6 Easy, 4 Medium, 3 Hard) |
| Grammar | 10 (3 Easy, 4 Medium, 3 Hard) |
| Reading | 5 (2 easy, 2 medium, 1 hard) |
| Listening | 5 |
| Speaking | 5 read-aloud sentences (2 easy, 2 medium, 1 hard) |
| Final review | 5, exactly one each: kanji, vocabulary, grammar, listening, speaking |

The learner cannot advance from a question phase until every stored question ID in that phase has an answer/event.

## Fail-closed mapping

The canonical repository mapper never creates learner content to compensate for missing normalized rows. Missing practice questions, story words, or activity regions remain missing. `isPlayableLesson()` rejects a lesson that does not satisfy the player contract and the route shows the existing Lesson unavailable state.

This prevents placeholders such as synthetic distractors from becoming real learning material.

## Producer responsibilities

- Complete admin/Batch imports must satisfy the `schemaVersion: 1` complete lesson validator before storage.
- Progressive custom generation uses strict output schemas for the fixed activity counts.
- Generated package storage rechecks canonical bank sizes.
- The local Supabase seed contains a complete canonical fixture so local reset exercises the same structure as production.

Target-library cardinality (for example, exactly five scheduled target kanji in offline Batch generation) belongs to the producer/curriculum contract. The player contract governs the lesson regions and activities the learner actually receives.
