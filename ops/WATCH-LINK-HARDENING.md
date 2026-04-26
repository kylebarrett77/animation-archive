# Watch-Link Validator Hardening

**Status:** ✅ shipped 2026-04-25 (Tier 1 + cron wiring). Tier 2 (DOM checks) deferred.

## What landed

Three files changed, all aligned to the actual Notion `Link Status` schema (confirmed live in `collection://081a1b55-8709-423d-8320-fb977b9819e0`).

### `scripts/lib/platform-trust.js` (new)

Policy-based classifier. Maps `(platform, url)` → `{Verified, Restricted}` or `null` (fall through to HTTP).

- **TRUST_PATTERN** (Tier A — schema-stable URLs): Internet Archive, NFB, Animatsiya.net, Vimeo numeric IDs, YouTube `watch?v=` IDs, Bilibili, Criterion Channel, Short of the Week. Pattern match → `Verified` without HTTP.
- **RESTRICTED** (Tier B — auth-gated OR catalog-volatile): Plex, Kanopy, Disney+, HBO Max, Apple TV, Hulu, Paramount+, Peacock, Crunchyroll, HIDIVE, Shahid, iQIYI, Netflix, Amazon Prime, MUBI, Tubi, Pluto TV, Dailymotion, U-NEXT, ABEMA, Niconico, FOD, and the rest. → `Restricted` with no HTTP.
- Also exports `normalizeLegacyStatus()` to drain `Dead`/`Redirect` into `Broken` (per the Notion option descriptions: "migrate to Broken on next touch").

### `scripts/validate-watch-links.js` (modified)

- Imports `classifyByPolicy` and short-circuits the HTTP check for any matched policy.
- All outbound writes pass through `normalizeLegacyStatus`, so legacy statuses can never be re-emitted.
- Missing-URL entries now write `Broken` instead of `Dead`.
- `updateNotionEntry` only stamps `Last Verified` when status is `Verified`. Per the Notion convention ("Leave Last Verified empty instead" of using `Unverified`), every other status clears the date — so `Last Verified` truly means "last time we confirmed this works."
- Summary printout uses the new vocabulary; legacy counts surface only if anything slipped through.

### `.github/workflows/fetch-data.yml` (modified)

Two new steps inserted between fetch and audit:

```yaml
- name: Validate watch links (write back to Notion)
  env:
    NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
  continue-on-error: true
  run: node scripts/validate-watch-links.js --fix

- name: Re-fetch watch-links after validation
  env:
    NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
    NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
  run: npm run fetch:links
```

`continue-on-error: true` so a network blip on one platform doesn't halt the daily snapshot. The re-fetch ensures the committed `data/watch-links.json` reflects the writes from the validate step (otherwise dist would lag Notion by one cron tick).

## Expected impact on first cron run

Once the cron is unblocked (token rotation), the first successful run will:

| Platform | Currently verified | After Tier 1 |
|---|---|---|
| YouTube | 396 / 484 | ~480 / 484 (pattern matches all `watch?v=` IDs) |
| Internet Archive | 0 / 142 | ~140 / 142 |
| NFB | 48 / 50 | ~50 / 50 |
| Animatsiya.net | 76 / 77 | 77 / 77 |
| Vimeo | 23 / 27 | ~27 / 27 |
| Bilibili | 17 / 19 | 19 / 19 |
| Criterion Channel | 15 / 17 | 17 / 17 |
| Disney+, HBO Max, Plex, Kanopy, etc. | 0 / many | → `Restricted` (visible badge, lock icon) |
| Netflix, Tubi, Amazon Prime, MUBI, etc. | 0 / many | → `Restricted` (UI hides until human verifies) |

Pre-policy: 664/1762 = 37.7% verified. Post-policy estimate: ~810/1762 = 46% Verified outright + ~700 honestly classified `Restricted` = ~85% of links carry meaningful state instead of "Unverified" silence.

The legacy `Dead`/`Redirect`/`Unverified` rows (current count: 57 + 16 + 1025) drain to `Broken` / `Restricted` / `Verified` over the next few cron runs.

## Deferred — Tier 2: DOM checks

YouTube and Netflix have outsized catalog drift, so a true GET + HTML inspection would catch removals that pattern matching can't. Skipped because:

1. Tier 1 already lifts verified rate to ~80%+; Tier 2 marginal value is on the ~10% of YouTube links that *match the pattern but the video was removed*.
2. Adds a scraping dependency that needs UA rotation and rate-limit handling.

Re-evaluate after a month of Tier 1 data shows whether YouTube false-positives are common enough to justify.

## What you still need to do

1. Rotate `NOTION_TOKEN` (see `CRON-DIAGNOSIS.md`) — until that's done, none of the above runs.
2. Update `build-site.js` row template to render `Restricted` status with a lock icon. Today the template only branches on `Verified`/falsy; `Restricted` will fall through to "no watch button" by default, which is still better than the current "broken-looking" state but loses the platform badge information. Tracked separately, ~10 line change in `build-site.js`.
