# Changes

## 0.5.2 - 2026-10-03
- Versioned shared styles and currency exchange scripts so browsers load matching assets after a release, fixing the exclusion dropdown for returning visitors.

## 0.5.1 - 2026-10-03
- Added a searchable Exclude items dropdown with checkboxes and item icons to both currency exchange calculators. Routes containing any checked item are hidden from the table.
- Saved item exclusions separately for PoE1 and PoE2, with an exclusion count and Clear all control.

## 0.5.0 - 2026-10-03
- Added currency exchange triangle calculators for Path of Exile 1 and Path of Exile 2, using separate saved hourly market snapshots, league lists, item metadata, and gold fees.
- Added sortable profit, return, gold cost, and divines per 100,000 gold estimates, with item search, single-category filters, and inline editing of each trade’s quantities and fees.
- Enabled profitable routes and sufficient volume filters by default. Every trade must have hourly traded quantities covering at least 10 times both its planned paid and received amounts.
- Set default starting balances to 100 Exalted Orbs for PoE1 and 10 Chaos Orbs for PoE2.
- Added shared PoE1 and PoE2 tabs, moved version and refresh controls into the pre-header, and widened page content to 1450 pixels.
- Added automated hourly exchange snapshot publishing while retaining the existing 12-hour refresh for boss and gem prices.

## 0.4.3 - 2026-08-18
- Added 12-hour pricing for unidentified `Forbidden Flame` and `Forbidden Flesh` drops by averaging the first 10 instant-buyout trade listings for each normal and Uber item-level band.
- Updated `The Light of Meaning` trade link to search for unidentified jewels without changing its existing price source.
- Updated every app footer with Grinding Gear Games' required third-party disclaimer.

## 0.4.2 - 2026-08-18
- Corrected `Forbidden Flame` and `Forbidden Flesh` wiki and trade links to search for unidentified jewels, using separate item-level filters for normal and Uber boss drops.
- Stopped applying identified poe.ninja jewel averages to unidentified `Forbidden Flame` and `Forbidden Flesh` drops; their prices remain manually editable until a reliable unidentified price source is integrated.

## 0.4.1 - 2026-04-03
- Corrected Uber boss entry costs so fragment-based Uber encounters now require 4 fragments instead of 5, matching the 3.28 change.
- Added 3.28 exceptional support gem drops to supported bosses in the bossing calculator, using pinned level 1 uncorrupted gem entries from the existing price data.
- Refined Maven exceptional-gem modeling by removing the generic regular-Maven awakened-gem placeholder, keeping `Invert the Rules Support` at 2% on both Maven variants, and zeroing unconfirmed Uber Maven awakened gem rates.

## 0.2.13 - 2026-03-09
- Corrected Incarnation of Fear loot tables by moving `Woespike` to Uber Incarnation of Fear and restoring `The Unseen Hue` to the normal boss drop pool.

## 0.2.12 - 2026-03-02
- Updated the page title tag to `Path of Profits: POE Mirage Bossing Profitability`.
- Added a meta description that explicitly mentions `Path of Exile` for clearer search snippet context.

## 0.2.11 - 2026-02-22
- Updated league-date assumptions for the RefresherLeaf/Phrecia extension by treating `Phrecia 2.0` and `Hardcore Phrecia 2.0` as active through `2026-04-23T21:00:00Z` when upstream end dates lag.
- Updated local league filtering so `Phrecia 2.0` appears in the local server league dropdown under the same end-date override.
- Fixed static data build reliability by treating sentinel league end dates (for example `0001-01-01T00:00:00Z`) as open-ended, preventing poe.ninja update failures like `No usable leagues` when index endpoints return 404.
