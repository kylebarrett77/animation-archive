# `films-index.js` Bundle Trim Plan

**Current size:** 1.85 MB uncompressed (`dist/films-index-c6df597e.js`).
**Source:** `scripts/build-site.js:905-948` (`buildFilmsIndexJs`).
**Cache:** immutable (1-year), so repeat visitors only pay this cost once. **First visit cost on 4G:** 4-8 seconds.
**Compressed (gzip est.):** ~280-350 KB. Brotli would shave another 25%.

The bundle ships three globals:

```js
window.ALL_FILMS_DATA  = [...]   // ~95% of the file
window.STUDIOS_DATA    = [...]   // slug + name + id, ~50 KB
window.DIRECTORS_DATA  = [...]   // slug + name + id, ~80 KB
```

`ALL_FILMS_DATA` is the target.

---

## Anatomy of one film record (per current code)

Each film carries 17 fields. For a typical Japan-2D-Cel-series row that's roughly:

```json
{
  "id": "f298ffb2-78e4-4879-8919-96a6109fb4aa",
  "title": "Estab-Life: Great Escape",
  "original": "イスタブライフ・グレート・エスケープ",
  "year": 2022,
  "country": "Japan",
  "director": "Goro Taniguchi, Hiro Kaburaki",
  "studio": "Polygon Pictures, Kamikaze Douga",
  "technique": ["CGI", "2D Digital"],
  "format": "Series",
  "runtime": "12 episodes × 24 min",
  "confidence": "★★★★",
  "watchLinks": [{"url":"https://...","platform":"Crunchyroll","status":"Verified"}, ...],
  "hasSubtitles": true,
  "genres": ["Cyberpunk","Adventure","Comedy"],
  "keywords": ["Megacity","Aliens","Surreal","Hopeful"],
  "studioEntities": [{"id":"...","slug":"polygon-..."}],
  "directorEntities": [{"id":"...","slug":"goro-taniguchi-..."}]
}
```

For 2,330 films at ~750 bytes/row average → ~1.7 MB. Confirms the measured size.

---

## What the client actually reads

Searched `dist/app-c7b3ed48.js` for field accesses:

| Field | Used by app.js | Used in initial render | Notes |
|---|---|---|---|
| `id` | yes | yes | for film page links |
| `title` | yes | yes | row primary |
| `original` | yes | conditional | shown on hover/expand |
| `year` | yes | yes | column |
| `country` | yes | yes | filter + column |
| `director` | yes | yes | column |
| `studio` | yes | yes | column |
| `technique` | yes | yes | filter + badge |
| `format` | yes | yes | filter |
| `runtime` | yes | yes | column |
| `confidence` | yes | yes | pip column |
| `watchLinks` | yes | yes | platform filter + watch button |
| `hasSubtitles` | yes | yes | badge |
| `genres` | yes | filter only | not in row |
| `keywords` | yes | filter only | not in row |
| `studioEntities` | NO | NO | **dead weight** |
| `directorEntities` | NO | NO | **dead weight** |

---

## Trim opportunities

### Tier 1 — drop unused fields (≈ 8% reduction, 30 min work)

`studioEntities` and `directorEntities` are emitted but never read by `app.js`. They were intended for "click director name → entity page" but app.js builds those URLs from `STUDIOS_DATA`/`DIRECTORS_DATA` slug lookup. Drop them from `buildFilmsIndexJs`:

```diff
   const slimFilms = sortedFilms.map(f => ({
     id: f.id, title: f.titleEnglish, original: f.originalTitle,
     year: f.year, country: f.country, director: f.director,
     studio: f.studio, technique: f.technique, format: f.format,
     runtime: f.runtime, confidence: f.confidence,
     watchLinks: Array.isArray(f.watchLinks) ? ... : [],
     hasSubtitles: f.hasSubtitles,
     genres: f.genres || [],
     keywords: f.keywords || [],
-    studioEntities: f.studioEntities || [],
-    directorEntities: f.directorEntities || []
   }));
```

**Saving:** ~140 KB uncompressed, ~25 KB gzipped.

### Tier 2 — split into "list" and "detail" payloads (≈ 65% reduction on first paint, 4-6 hour rewrite)

Move the rarely-read fields out of the main bundle. Two payloads:

**`films-index.js`** (loaded eagerly, ~600 KB → ~85 KB gzipped):
`id`, `title`, `year`, `country`, `director`, `studio`, `technique`, `format`, `runtime`, `confidence`, `hasSubtitles`, `watchLinks` (just `[platform, status]` tuple — drop URLs), `genres`, `keywords`

**`films-detail.json`** (loaded lazily on row expand or film page nav, ~1.2 MB total but never loaded as a whole):
`id` → `{ original, watchLinks (full with URLs), studio details, ... }`

Or: pre-shard by id-prefix into `films-detail/{first-2-chars}.json` so the browser only fetches the shard for the rows it needs.

**Saving:** initial-paint payload drops to ~85 KB gzipped. Watch-button URL is fetched on click (one tiny additional request per click).

### Tier 3 — column-store layout (≈ 75% reduction, experimental)

JSON for tabular data is wasteful — every record repeats every key name. Convert to a columnar layout:

```js
window.FILMS = {
  schema: ["id","title","year","country","director","studio","technique","format","runtime","confidence","hasSubtitles","genres","keywords"],
  rows: [
    ["f298ffb2-...","Estab-Life",2022,"Japan","Goro Taniguchi","Polygon Pictures",["CGI","2D Digital"],"Series","12 episodes × 24 min","★★★★",true,["Cyberpunk"],["Megacity"]],
    ...
  ]
};
```

Plus a `decode()` helper in app.js (~10 lines). Eliminates ~40 bytes of key names per row × 2,330 rows = ~95 KB before gzip; gzip compresses keys away anyway, so the win is more like ~10 KB compressed. Not worth it on its own — only consider stacked with Tier 2.

### Tier 4 — lazy-load on filter, not on page load (≈ 90% reduction)

Server-render the first page (50 rows) into `index.html` (already done — see `FILMS_PER_PAGE`), and fetch the catalog only when the user types in search or clicks a filter. Until then, the user has paint, can scroll, can click into film pages — no JS catalog needed.

```js
let CATALOG = null;
async function ensureCatalog() {
  if (CATALOG) return CATALOG;
  const res = await fetch('/films-index.js'); // or .json
  CATALOG = await res.text(); // eval the window.FILMS_DATA assignment
  return CATALOG;
}

document.querySelector('#search').addEventListener('input', async (e) => {
  await ensureCatalog();
  // do search
});
```

**Saving:** for users who never search/filter (probably the majority on first visit), the 1.85 MB never loads at all. Lighthouse score jump from this alone is the largest single improvement available.

---

## Recommended sequence

1. **Tier 1 right now** — pure deletion, 30-line PR, no behavior change. Shipping this kills the dead-weight fields immediately.
2. **Tier 4 next** — defer the catalog load behind the first interactive event. Keep the `<script src>` but add `media="not all"` or use `<link rel="prefetch">` so it doesn't block the initial paint. The first interaction triggers `<script>` injection.
3. **Tier 2 only if Lighthouse still red** — it's the most invasive (changes both fetch + build + render code paths). Don't do it preemptively.
4. **Tier 3 — skip.** Negligible compressed win, makes app.js harder to read.

---

## Quick check: does Netlify already gzip?

Per `netlify.toml`, no explicit compression header — Netlify gzips automatically by default for `text/javascript`. Confirm with:

```bash
curl -sI -H "Accept-Encoding: gzip,br" https://[your-domain]/films-index-c6df597e.js | grep -i "content-encoding\|content-length"
```

If you see `content-encoding: br`, brotli is already on (best case). If `gzip`, fine but you could ask Netlify support to enable brotli for static assets. Either way, Tiers 1+4 are independent of compression.
