# Watch Links Database Migration Guide

## What Changed

The Films DB `Watch Links` field (single URL) has been replaced by a dedicated **Watch Links database** with full metadata per link. This enables:

- Multiple watch links per film, ranked by quality
- Platform, access type, video quality, subtitle, and region metadata
- Link health verification with status tracking
- Structured data for the site build (no more regex parsing)

## New Database

| Field | Type | Purpose |
|-------|------|---------|
| Label | title | Display: "YouTube - Film Title" |
| Film | relation → Films DB | Links to parent film |
| URL | url | The actual watch link |
| Platform | select | YouTube, Criterion, MUBI, etc. (25 options) |
| Access Type | select | FREE, ADS, SUB, RENT, BUY, DISC, REGION |
| Video Quality | select | 4K, 1080p, 720p, 480p, SD, Variable, Unknown |
| Audio | select | Original, Dubbed (EN), Dubbed (Other), Multiple, No Dialogue |
| Subtitles | multi_select | English, French, Japanese, etc. |
| Completeness | select | Complete, Partial, Excerpt, Trailer Only |
| Link Status | select | Verified, Unverified, Dead, Redirect |
| Last Verified | date | When link was last checked |
| Quality Rank | number | 1 = best option, 2 = next, etc. |
| Region | multi_select | Global, US, EU, UK, JP, etc. |
| Notes | rich_text | "Fan sub", "Missing ep 14-16", etc. |

**Data Source ID:** `081a1b55-8709-423d-8320-fb977b9819e0`

## New Scripts

| Script | Purpose | Run When |
|--------|---------|----------|
| `migrate-watch-links.js` | One-time: parse old Watch Links field → create new DB entries | Once, to migrate |
| `fetch-watch-links.js` | Fetch from new DB, embed in films.json | Every build |
| `watch-links-renderer.js` | HTML generation module for film pages | Imported by build-site.js |
| `validate-watch-links.js` | Check all URLs, update Notion status | Weekly maintenance |

## Migration Steps

### Step 1: Install Notion SDK (if not already)

```bash
cd ~/Desktop/Projects/animation-archive-site
npm install @notionhq/client
```

### Step 2: Run Migration (Dry Run First)

```bash
# Preview what will be created
NOTION_TOKEN=secret_xxx node scripts/migrate-watch-links.js --dry-run

# Limit to 10 films for testing
NOTION_TOKEN=secret_xxx node scripts/migrate-watch-links.js --dry-run --limit 10

# Run full migration
NOTION_TOKEN=secret_xxx node scripts/migrate-watch-links.js
```

### Step 3: Verify in Notion

Open the Watch Links database in Notion. Check:
- Entries created with correct Film relations
- Platform detection worked
- Access types are reasonable
- "MANUAL REVIEW" entries flagged for fixing

### Step 4: Update Build Pipeline

In `fetch-notion.js`, add after the Films DB fetch:

```bash
# Run the new fetch script after the existing one
NOTION_TOKEN=secret_xxx node scripts/fetch-watch-links.js
```

Or add to package.json scripts:

```json
{
  "scripts": {
    "fetch": "node scripts/fetch-notion.js",
    "fetch:links": "node scripts/fetch-watch-links.js",
    "fetch:all": "npm run fetch && npm run fetch:links",
    "build": "npm run fetch:all && node scripts/build-site.js",
    "validate": "node scripts/validate-watch-links.js --report-only",
    "validate:fix": "node scripts/validate-watch-links.js --fix"
  }
}
```

### Step 5: Update build-site.js

In `build-site.js`, replace the watch links rendering. The old code (around lines 304-380) parses a single URL string with regex. Replace with:

```javascript
const { generateWatchLinksHTML } = require('./watch-links-renderer');

// In the film detail template, replace:
//   ${generateWatchLinksSection(film.watchLinks)}
// with:
//   ${generateWatchLinksHTML(film.watchLinks, film.watchLinksLegacy)}
```

Add the CSS from `watch-links-renderer.js` (`WATCH_LINKS_CSS`) to your site stylesheet.

### Step 6: Validate Links

```bash
# Check all URLs and generate report
NOTION_TOKEN=secret_xxx node scripts/validate-watch-links.js

# Update Notion with results
NOTION_TOKEN=secret_xxx node scripts/validate-watch-links.js --fix
```

### Step 7: Deprecate Old Field

Once migration is confirmed working:
1. Stop populating the Films DB `Watch Links` URL field
2. When adding new watch links, create entries in the Watch Links DB instead
3. Eventually remove the old field

## Data Flow

```
Notion Watch Links DB
        ↓
  fetch-watch-links.js
        ↓
  data/watch-links.json + data/films.json (embedded arrays)
        ↓
  build-site.js + watch-links-renderer.js
        ↓
  dist/ (static HTML with structured watch cards)
```

## films.json Format Change

Before (single string):
```json
{ "watchLinks": "[FREE] YouTube: https://youtube.com/watch?v=xxx" }
```

After (structured array):
```json
{
  "watchLinks": [
    {
      "url": "https://youtube.com/watch?v=xxx",
      "platform": "YouTube",
      "accessType": "FREE",
      "videoQuality": "1080p",
      "subtitles": ["English"],
      "status": "Verified",
      "lastVerified": "2026-02-15",
      "rank": 1,
      "completeness": "Complete",
      "notes": null
    }
  ],
  "watchLinksLegacy": "[FREE] YouTube: https://youtube.com/watch?v=xxx"
}
```

## Maintenance Schedule

- **Weekly:** Run `validate-watch-links.js --fix` to check URLs and update status
- **Per session:** When validating new films, create Watch Links DB entries (not Films DB URL field)
- **Monthly:** Review "MANUAL REVIEW" entries and fix
