# Kanji Recall v33 bidirectional progress sync

This folder is reserved for the Android Kanji Recall app. All writes require the user's GitHub authorization; do not commit any access tokens.

## Files

- `current.json`: uploaded from the phone by the v33 app after connecting with a fine-grained GitHub token. Contains **per-card** (key `compound|特色`, `kana|運ぶ`, `single|木`) current memory state, total exposures, counts by selected answer, recent last10/last20, repeated weak streak, and ultra-weak classification.
- `overrides.json`: remote-to-phone input, edited through GitHub. The app reads this on sync and applies any unseen revision to local ratings, including mastered/familiar → weak. The phone will then upload an updated `current.json`.
- The original app export at `../app-exports/kanji-recall-2026-10-14-export.json` is intentionally unchanged and continues to serve as a backup.

## Remote override format

To downgrade a specific vocabulary card, set or replace the matching key in `overrides`:

```json
{
  "format": "kanji-recall-state-overrides",
  "schemaVersion": 1,
  "updatedAt": "2026-10-14",
  "overrides": {
    "compound|特色": {
      "state": "weak",
      "revision": "manual-2026-10-14-001",
      "reason": "Still misread during story"
    }
  }
}
```

**Change `revision` each time you want the phone to apply a new override for that key.** Previously applied revisions are idempotent, so normal study can subsequently improve the local state without a stale override reverting it.

The app only applies overrides to actual cards present in its v32 embedded dataset; it backs up the local progress before applying any remote changes. Overriding a state never increments the flashcard attempt count. The phone must be online and connected to GitHub for updates to arrive.

## Story selection queries

Read `current.json`, or the frozen October 14 memory export until the first phone sync:
- `filters.ultraWeak` contains 10+ exposure cards with a recent >=60% failure rate (or a five-answer weak/unknown streak).
- `filters.weakAtLeast10` contains cards that are currently weak and have at least 10 exposures.
- `cardStates["compound|特色"].totalAttempts` gives cumulative exposures; `counts` and `last10` show long-term and recent patterns.
- Filter each card by `jlpt`, `targetType`, `memoryState`, `totalAttempts`, and `weakRateLast10`.

Do not infer single-character mastery from a compound word. Preserve separate story feedback in `../progress.json`. Android v33 uses a **native SQLite database** and commits each flashcard answer in a transaction before enabling Next. It does **not** reuse or modify the previous installed app's private localStorage. The original October 14 study export and historical per-answer events are bundled and imported as a baseline; it keeps the source export as an immutable on-phone backup. The v33 app is installed **side by side** under a new Android package ID to protect the existing app. If the old phone app has newer progress, export its latest study file and use **Import latest export** in v33 before studying. Import preserves newer local v33 ratings. GitHub synchronization needs a fine-grained repository Contents read/write access token, entered on the phone and stored using Android Keystore encryption; never paste the token in GitHub files. The first live sync only succeeds once the phone is online and the user connects GitHub.
