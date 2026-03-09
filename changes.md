# Changes

## 0.2.13 - 2026-03-09
- Corrected Incarnation of Fear loot tables by moving `Woespike` to Uber Incarnation of Fear and restoring `The Unseen Hue` to the normal boss drop pool.

## 0.2.12 - 2026-03-02
- Updated the page title tag to `Path of Profits: POE Mirage Bossing Profitability`.
- Added a meta description that explicitly mentions `Path of Exile` for clearer search snippet context.

## 0.2.11 - 2026-02-22
- Updated league-date assumptions for the RefresherLeaf/Phrecia extension by treating `Phrecia 2.0` and `Hardcore Phrecia 2.0` as active through `2026-04-23T21:00:00Z` when upstream end dates lag.
- Updated local league filtering so `Phrecia 2.0` appears in the local server league dropdown under the same end-date override.
- Fixed static data build reliability by treating sentinel league end dates (for example `0001-01-01T00:00:00Z`) as open-ended, preventing poe.ninja update failures like `No usable leagues` when index endpoints return 404.
