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

```bash
# Clone/download this folder
cd animation-archive-site

# Install dependencies
npm install

# Set environment variables
export NOTION_TOKEN="secret_your_token_here"
export NOTION_DATABASE_ID="9bdc62e48ffe43fda6b992248570c49f"

# Fetch data from Notion
npm run fetch

# Build the site
npm run build

# Preview locally
npx serve dist
```

Open `http://localhost:3000` to see your site.

## Deploy Options

### Option A: Netlify (Recommended - Simplest)

1. Push this folder to GitHub
2. Go to [netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
3. Select your repo
4. Add environment variables in Netlify UI:
   - `NOTION_TOKEN` = your integration token
   - `NOTION_DATABASE_ID` = `9bdc62e48ffe43fda6b992248570c49f`
5. Deploy

**Auto-rebuilds:** Set up a build hook and trigger it daily with a cron service, or use GitHub Actions.

### Option B: Vercel + GitHub Actions (Auto daily builds)

1. Push to GitHub
2. Create Vercel project from the repo
3. Add these GitHub secrets:
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `VERCEL_TOKEN` (from vercel.com/account/tokens)
   - `VERCEL_ORG_ID` (from .vercel/project.json after linking)
   - `VERCEL_PROJECT_ID` (same)
4. The workflow runs daily at 6 AM UTC

## Project Structure

```
animation-archive-site/
├── scripts/
│   ├── fetch-notion.js   # Pulls all films from Notion API
│   └── build.js          # Generates static HTML
├── data/                  # Generated JSON (gitignored)
│   ├── films.json
│   └── stats.json
├── dist/                  # Generated site (gitignored)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── films/            # Individual film pages
├── .github/workflows/
│   └── deploy.yml        # GitHub Action for auto-builds
├── netlify.toml          # Netlify config
└── package.json
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
