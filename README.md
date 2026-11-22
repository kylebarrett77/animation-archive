# Global Animation Archive

Static site generator that pulls from your Notion database and builds a searchable, filterable film archive.

**Live preview:** The hybrid editorial/brutalist design with warm cream tones, JetBrains Mono data, and Playfair Display headlines.

## Quick Start

### 1. Get your Notion API token

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Name it "Animation Archive" 
4. Copy the "Internal Integration Token" (starts with `secret_`)

### 2. Share your database with the integration

1. Open your Animation Archive database in Notion
2. Click "..." menu → "Add connections"
3. Find and select "Animation Archive" (your integration)

### 3. Local setup

Requires Node 22+ (the repo pins Node 24 in `.nvmrc`; run `nvm use`).

```bash
npm ci

# Put your integration token in .env (gitignored):
echo "NOTION_TOKEN=ntn_your_token_here" > .env

npm run refresh        # fetch from Notion, sanity-check, build
npx serve dist         # preview at http://localhost:3000
```

Building from the committed snapshot needs no token: `npm run build`.

## How data reaches the live site

```
Notion ──(daily 06:00 UTC)──▶ GitHub Action "Fetch Notion data"
                               fetch → validate links → check → build
                               └─ commits data/** to main (only if changed)
                                        │
                                        ▼
                              Netlify builds from data/** → live site
```

- **GitHub Actions is the only thing that talks to Notion.** It needs the
  repository secret `NOTION_TOKEN` (Settings → Secrets and variables →
  Actions). It can also be run by hand from the Actions tab, with a dry-run
  option.
- **Netlify never calls Notion.** It runs `npm run build` on whatever
  snapshot is committed, so builds are deterministic and need no token.
- `npm run check:data` guards every refresh: an empty dataset, a drop of
  more than 20%, or a missing poster file rejects the snapshot and the
  previous one stays live.
- A keepalive step stops GitHub from disabling the schedule after 60 days
  without commits. See `ops/CRON-DIAGNOSIS.md` for why that matters.

## Project Structure

```
scripts/
  fetch-notion.js        films, studios, directors, series, posters
  fetch-watch-links.js   watch links, merged into films.json
  validate-watch-links.js  probe links, write changed statuses to Notion
  check-data.js          snapshot sanity guard
  build-site.js          generates the static site into dist/
  lib/notion.js          shared Notion client (API 2025-09-03)
data/                    committed Notion snapshot (+ posters/)
dist/                    generated site (gitignored)
.github/workflows/
  fetch-data.yml         scheduled Notion refresh
  ci.yml                 audit + smoke build on PRs / branches
netlify.toml             Netlify build + headers
```

## Customization

### Change colors
Edit the CSS variables in `scripts/build.js` → `generateCSS()`:

```css
:root {
  --cream: #f8f6f1;      /* Background */
  --accent: #9f1239;     /* Crimson accent */
  --ink: #1c1917;        /* Text */
}
```

### Add properties
1. Add new field in your Notion database
2. Update the `extractFilm()` function in `fetch-notion.js`
3. Update templates in `build.js`

### Change fonts
Edit the Google Fonts import in `generateIndexPage()` and `generateFilmPage()`.

## Database Schema Expected

The script expects these Notion properties (adjust `fetch-notion.js` if yours differ):

| Property | Type | Used For |
|----------|------|----------|
| Title (English) | Title | Primary title |
| Original Title | Text | Display |
| Year | Number | Sorting, filtering |
| Country | Select | Filtering |
| Director | Text | Display |
| Studio | Text | Display |
| Technique | Multi-select | Filtering |
| Runtime | Text | Display |
| Synopsis | Text | Detail page |
| Watch Links | URL | Watch button |
| Has Subtitles | Checkbox | Badge |
| Confidence | Select (★-★★★★★) | Pip display |
| IMDB, Letterboxd, Wikipedia | URL | External links |

## License

Your data, your site. Do what you want with it.
