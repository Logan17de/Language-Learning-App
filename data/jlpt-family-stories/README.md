# JLPT family stories — GitHub workflow

Repository: Logan17de/Language-Learning-App. Working branch: main.
Curriculum: data/kanji-vocabulary-library/{N5,N4,N3,N2,N1}/{kanji,vocabs}.json (9,150 unique entries).
Order: N5, N4, N3, N2, N1. Every entry needs ten verified appearances in approved episodes.

## Writer
Use the connected GitHub tools directly. Save the complete episode, Japanese narrative, canon notes and target evidence in data/jlpt-family-stories/LEVEL/EPISODE/rREVISION.md, for example N5/N5-0001/r1.md. Keep EPISODE, LEVEL, REVISION and STORY_START/STORY_END markers on separate lines. Preserve old revisions; never overwrite a draft that has been reviewed.
Create or reuse one GitHub issue titled [Story review] EPISODE. Include the exact file path, commit SHA and commit-pinned file link. Do not create duplicate episodes/issues. Read the issue comments before revising. On requested changes, save r2.md, r3.md, etc., respond to stable comment IDs and link the new commit in the same issue.
Return actual file URL, commit SHA and review-issue URL. Never claim a write succeeded without tool confirmation. If direct tools are unavailable, report BLOCKED_GITHUB_WRITE and the precise missing capability. Do not silently replace direct GitHub work with a chat-only handoff.

## Reviewer
Read the exact commit-pinned GitHub draft and existing issue comments directly, not a copied story from chat. Verify episode and revision against the latest writer submission. Check naturalness, grammar, level, continuity and lexical evidence under the saved reviewer instructions.
Post a GitHub comment on the episode's review issue containing the reviewed commit SHA/path, verdict APPROVED or CHANGES_REQUESTED, stable actionable comment IDs and the complete structured review JSON. Prior comment IDs must be resolved explicitly on later revisions. Return the actual posted comment URL. Do not approve your own writing or mutate the draft.
Both roles can use the same connected GitHub account; verdicts are editorial issue comments, not self-approval through GitHub pull-request reviews.
If direct read/comment tools are unavailable, report the precise blocker. Never claim a comment was posted unless confirmed.

## Organizer and coverage
Inspect actual GitHub files/comments, schedule bounded work every five minutes and send the writer/reviewer their next job through the authorized projects. Keep one active episode initially. Mirror exact GitHub versions and review JSON into the local coverage ledger. Bind every approval to its exact revision and commit; later revisions invalidate earlier credit until reviewed. Credit at most once per entry per approved episode. Ten separate approved contexts guarantee at least ten appearances.
Narrative/dialogue alone counts; metadata, lists, drafts and stale versions do not. Genuine character targets may count a semantically relevant use in a word; vocabulary must be the requested lexeme/sense, not an accidental substring.
Do not modify app code, secrets, unrelated study data or global settings. Keep stories as drafts until the reviewer approves them. Stop and report real access/curriculum blockers instead of fabricating progress.
