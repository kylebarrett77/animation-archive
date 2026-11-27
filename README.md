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

## Artwork

Every film's artwork is rendered at fetch time into one standard **2:3 poster
card** (`scripts/lib/poster-card.js`, 480×720 WebP) and committed in
`data/posters/`. Real posters fill the card; title cards and logos are fitted
whole over a blurred copy of themselves, so nothing is cropped.

- **By hand:** upload an image to the film's *Poster images* property in
  Notion. The first file is the one used.
- **Automatically:** `npm run posters:source` finds art for films that have
  none, and real posters for films that only have a wide title card.
  - TMDB, matched by the film's IMDb ID (needs `TMDB_TOKEN` in `.env`, and as
    a GitHub secret for the daily run)
  - Wikipedia, the lead image of the film's own article; articles about the
    manga, novel or franchise, or an earlier part of a series, are sent to
    review instead (title, sequel and Wikidata checks)

  ```bash
  npm run posters:source                          # dry run → reports/poster-review.html
  npm run posters:source -- --apply               # write exact matches to Notion
  npm run posters:source -- --approve <id>,<id>   # write reviewed title guesses
  ```

  New images go first in *Poster images*; anything already there is kept
  after them. Every write is logged in `reports/`. The daily refresh runs
  this for new films only (`--only-missing`).
- **Credits:** auto-sourced images are credited on film pages and in the
  footer. Poster images are © their rights-holders; TMDB requires the
  attribution notice shown in the footer.

## Data check (self-refinement)

Every nightly refresh runs `scripts/refine-data.js` (`npm run refine`), an
automated **Cleanup/Audit** pass that follows the Validation Protocol in
Notion (🎬 Animation Archive → 📝 Validation Protocol).

It writes only two kinds of change, and only additively:

- **Relations**: a film's Studio/Director text names an existing entity page
  as a whole credit, but `Studio (Link)` / `Director (Link)` was never set.
- **Empty fields**: Wikipedia/IMDB filled from Wikidata when title and year
  agree.

Everything else is a research task, published nightly as a checklist on
**🔎 Automated Data Check** in Notion: wrong IMDb links, facts that disagree
with Wikidata/TMDB, studios/directors needing a page, duplicate entity pages,
and Internet Archive copies of films 50+ years old. Runs that write are
logged as a session in the Sessions database.

The integration must be shared with the 🔎 Automated Data Check page and the
Sessions database (••• → Connections → Animation Archive).

```bash
node scripts/refine-data.js                # plan + local review page, no writes
node scripts/refine-data.js --apply        # write relations + fills, log a Session
node scripts/refine-data.js --publish      # publish the checklist to Notion
node scripts/refine-data.js --only links   # run one check (links, fill, facts, entities, watch)
```

## Project Structure

```
scripts/
  fetch-notion.js        films, studios, directors, series, posters
  fetch-watch-links.js   watch links, merged into films.json
  validate-watch-links.js  probe links, write changed statuses to Notion
  check-data.js          snapshot sanity guard
  source-posters.js      find artwork (TMDB, Wikipedia) and write it to Notion
  build-site.js          generates the static site into dist/
  lib/notion.js          shared Notion client (API 2025-09-03)
  lib/poster-card.js     renders the standard 2:3 poster card
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
