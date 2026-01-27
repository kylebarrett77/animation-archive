# Global Animation Archive — Development Brief

**Architect:** Claude (chat) — planning, direction, QA
**Implementation:** Claude Code — coding, debugging, iteration
**Human:** Kyle — final approval, Notion data, deployment

---

## Project Overview

Static site generator pulling animated film data from Notion, deployed to Netlify.

- **Live:** https://animationarchive.netlify.app
- **Repo:** https://github.com/kylebarrett77/animation-archive
- **Stack:** Node.js, vanilla HTML/CSS/JS, Netlify
- **Data:** ~720 films, 47 countries, 17 techniques

---

## Architecture

```
animation-archive-site/
├── scripts/
│   ├── fetch-notion.js     # Notion API → data/*.json
│   └── build-site.js       # JSON → dist/ (HTML, CSS, JS)
├── data/                   # Generated JSON (gitignored)
│   ├── films.json          # All film records
│   └── stats.json          # Aggregated counts
├── dist/                   # Built site (gitignored)
│   ├── index.html          # Main collection page
│   ├── films/              # Individual film pages
│   ├── styles.css
│   ├── app.js
│   ├── sitemap.xml
│   └── robots.txt
├── package.json
├── netlify.toml
└── CLAUDE_CODE_BRIEF.md    # This file
```

**Data flow:**
1. `npm run fetch` → Notion API → `data/films.json` + `data/stats.json`
2. `npm run build` → Reads JSON → Generates all HTML/CSS/JS in `dist/`
3. `git push` → Netlify auto-builds and deploys

---

## Current State (January 2026)

### ✅ Completed
- Full Notion integration (26+ properties per film)
- Static site generation (index + 720 film pages)
- Client-side search/filter (country, technique, decade, watchability)
- Pagination (50 films initial, "Load More" button)
- SEO (sitemap.xml, robots.txt, OG tags, JSON-LD structured data)
- Accessibility (skip links, ARIA labels, keyboard navigation)
- Complete country code mappings (100+ countries)
- Auto-deploy via GitHub → Netlify

### 🔧 Technical Debt
- No error handling/retry logic in fetch-notion.js
- No tests
- No linting config
- Large inline data blob in index.html (~150KB JSON)

---

## Design System

**Aesthetic:** Editorial + Brutalist hybrid

**Colors:**
- `--cream: #f8f6f1` (background)
- `--paper: #fffef9` (cards, panels)
- `--ink: #1c1917` (primary text)
- `--accent: #9f1239` (highlights, links)

**Typography:**
- Headlines: Playfair Display (serif)
- Body: Source Serif 4 (serif)
- Data/UI: JetBrains Mono (monospace)
- Navigation: Inter (sans-serif)

**Components:**
- Confidence pips: `■■■□□` (monospace, accent color for filled)
- Country codes: 3-letter uppercase (USSR, CSSR, CHN, etc.)
- Watch buttons: Black bg, cream text, hover → accent

---

## Roadmap

### Phase 1: Content Expansion (NEXT)
Priority order:

1. **Country Pages** `/countries/ussr.html`
   - List all films from that country
   - Stats (total films, techniques breakdown, decades)
   - Link from sidebar filters + film detail pages
   - Generate from existing data (no new Notion fields needed)

2. **Technique Pages** `/techniques/stop-motion.html`
   - Same pattern as country pages
   - Brief description of the technique
   - All films using that technique

3. **Director Index** `/directors/index.html`
   - Alphabetical list of all directors
   - Film count per director
   - Click through to filtered view or dedicated page

4. **Decade Pages** `/decades/1960s.html`
   - Films from that era
   - Historical context (hardcoded or from Notion)

### Phase 2: Discovery Features
- Random film button
- "Film of the day" (deterministic based on date)
- Related films on detail pages (same country/technique/decade)
- Curated collections (e.g., "Essential Soviet Animation")

### Phase 3: Polish
- Dark mode toggle
- Sort options (year, country, recently added)
- Export functionality (CSV, JSON)
- RSS feed for new additions

---

## Implementation Guidelines

### Adding New Page Types

Pattern for country/technique/decade pages:

```javascript
// In build-site.js

function generateCountryPages() {
  const countriesWithFilms = {};
  
  // Group films by country
  for (const film of films) {
    if (!film.country) continue;
    if (!countriesWithFilms[film.country]) {
      countriesWithFilms[film.country] = [];
    }
    countriesWithFilms[film.country].push(film);
  }
  
  // Generate a page for each country
  mkdirSync('./dist/countries', { recursive: true });
  
  for (const [country, countryFilms] of Object.entries(countriesWithFilms)) {
    const slug = slugify(country);
    const html = generateCountryPage(country, countryFilms);
    writeFileSync(`./dist/countries/${slug}.html`, html);
  }
  
  // Also generate an index page
  writeFileSync('./dist/countries/index.html', generateCountryIndexPage(countriesWithFilms));
}

function generateCountryPage(country, countryFilms) {
  // Sort by year descending
  countryFilms.sort((a, b) => (b.year || 0) - (a.year || 0));
  
  // Calculate stats
  const techniques = {};
  const decades = {};
  for (const film of countryFilms) {
    for (const t of film.technique || []) {
      techniques[t] = (techniques[t] || 0) + 1;
    }
    if (film.year) {
      const dec = Math.floor(film.year / 10) * 10;
      decades[dec] = (decades[dec] || 0) + 1;
    }
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Same meta pattern as film pages -->
  <title>${country} Animation — Global Animation Archive</title>
  <!-- OG tags, JSON-LD for CollectionPage, etc. -->
</head>
<body>
  <!-- Same masthead -->
  <main class="country-page">
    <h1>${country}</h1>
    <div class="country-stats">
      <div>${countryFilms.length} films</div>
      <!-- Technique breakdown -->
      <!-- Decade breakdown -->
    </div>
    <div class="country-films">
      <!-- Reuse generateTableRows() or create card grid -->
    </div>
  </main>
  <!-- Same footer -->
</body>
</html>`;
}
```

### Updating Sidebar Links

When country pages exist, make sidebar filters link to them:

```javascript
// Current (filter only)
<div class="filter-item" data-filter-type="country" data-filter-value="USSR">

// Updated (filter + link)
<div class="filter-item" data-filter-type="country" data-filter-value="USSR">
  <a href="/countries/ussr.html" class="filter-link">USSR</a>
  <span class="count">142</span>
</div>
```

### Sitemap Updates

When adding new page types, update `generateSitemap()`:

```javascript
// Add country pages
for (const country of Object.keys(stats.countries)) {
  urls.push({
    loc: `${SITE_URL}/countries/${slugify(country)}.html`,
    priority: '0.8',
    changefreq: 'weekly'
  });
}
```

---

## Testing Locally

```bash
cd ~/Downloads/animation-archive-site

# Fetch fresh data from Notion
npm run fetch

# Build the site
npm run build

# Preview locally
npx serve dist
# → http://localhost:3000
```

---

## Deployment

Automatic on `git push`:

```bash
git add -A
git commit -m "Description of changes"
git push
```

Netlify builds in ~30 seconds. Check https://animationarchive.netlify.app

---

## Questions? Errors?

If something breaks or you need clarification on direction, ask Kyle to check with Claude (chat) for architectural guidance.
