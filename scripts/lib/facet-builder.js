/**
 * Generic tag-style facet builder for the Animation Archive static site.
 *
 * A "tag-style facet" is a simple taxonomy where each film can have 0..N values
 * for the facet (e.g. Genre, Keyword, Platform), and the UI surfaces:
 *
 *   1. One detail page per facet value listing its films (tag-page layout)
 *   2. One index page showing all facet values in a tag-cloud (entity-index layout)
 *
 * This helper replaces the repeated generate{Genre,Keyword,Platform,...}Pages()
 * triplets in build-site.js with a single config-driven driver.
 *
 * For facets that need richer layouts (maps, histograms, JSON-LD, featured
 * studios, etc. — e.g. Country, Decade, Technique), keep the existing dedicated
 * generators. This helper is explicitly for the simple tag-cloud cases.
 *
 * USAGE:
 *
 *   import { generateTagFacetPages } from './lib/facet-builder.js';
 *
 *   const { count } = generateTagFacetPages({
 *     name: 'Genre',
 *     slug: 'genres',
 *     label: 'Genres',
 *     extract: (film) => film.genres || [],
 *     films,
 *     deps: { slugify, escapeHtml, generateTableRows, generateBreadcrumb,
 *             generateFooter, SITE_URL, FAVICON, BUILD_DATE },
 *   });
 */

/* FONT_LINKS removed 2026-04-26 (Round 7 #1) — Round 5's font self-host
   migration missed this file, so all genre/keyword/platform pages were
   still loading from fonts.googleapis.com. The shared FONT_HEAD constant
   is now passed in via deps from build-site.js. */

/**
 * Size thresholds for the tag-cloud link size on the index page.
 * Override via config.sizeThresholds if a facet has a very different distribution.
 */
const DEFAULT_SIZE_THRESHOLDS = [
  { min: 100, size: 'xl' },
  { min: 50,  size: 'lg' },
  { min: 20,  size: 'md' },
  { min: 10,  size: 'sm' },
  { min: 0,   size: 'xs' },
];

function pickSize(count, thresholds) {
  for (const t of thresholds) {
    if (count >= t.min) return t.size;
  }
  return 'xs';
}

/**
 * Generate one detail page (list of films under a single facet value).
 *
 * Matches the existing genre-page / keyword-page HTML pattern so we can drop
 * this in without any CSS changes. The CSS class on <main> is
 * `tag-page ${slug}-page` to support facet-specific styling hooks.
 */
function generateFacetDetailPage(config, value, valueFilms) {
  const { name, slug, extract, deps } = config;
  const { slugify, escapeHtml, generateTableRows, generateBreadcrumb, generateFooter,
          SITE_URL, FAVICON, BUILD_DATE } = deps;

  const sorted = [...valueFilms].sort((a, b) => (b.year || 0) - (a.year || 0));
  const description = config.describe
    ? config.describe(value, sorted)
    : `Explore ${sorted.length} ${escapeHtml(value)} animated films from around the world in the Global Animation Archive.`;

  const valueSlug = slugify(value);
  const singularName = name; // e.g. "Genre"

  // Stat aggregation — added 2026-04-26 (Round 7 #4) so tag pages stop
  // being bare lists and start being research surfaces. Mirrors the
  // pattern from generateCountryPage / generateDecadePage in build-site.js.
  const countries = {};
  const decades = {};
  const techniques = {};
  for (const f of sorted) {
    if (f.country) countries[f.country] = (countries[f.country] || 0) + 1;
    if (f.year) {
      const dec = Math.floor(f.year / 10) * 10;
      decades[dec] = (decades[dec] || 0) + 1;
    }
    for (const t of f.technique || []) {
      techniques[t] = (techniques[t] || 0) + 1;
    }
  }
  const countriesSorted = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  const decadesSorted = Object.entries(decades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const techniquesSorted = Object.entries(techniques).sort((a, b) => b[1] - a[1]);

  // Don't repeat the facet's own dimension as a stat card. e.g. on the
  // Technique facet pages, suppress the Techniques stat card (it would
  // just say "<this technique>: 100%").
  const showCountries  = countriesSorted.length  > 0;
  const showDecades    = decadesSorted.length    > 0;
  const showTechniques = techniquesSorted.length > 0 && name.toLowerCase() !== 'technique';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(
    typeof config.detailTitle === 'function'
      ? config.detailTitle(value, sorted)
      : `${value} — Global Animation Archive`
  )}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/${slug}/${valueSlug}.html">
${FAVICON}
${deps.FONT_HEAD || ''}
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
${generateBreadcrumb([
  { label: 'Home', url: 'index.html' },
  { label: config.label, url: `${slug}/index.html` },
  { label: escapeHtml(value) }
], '../')}
<main class="tag-page ${name.toLowerCase()}-page" id="main-content">
  <div class="tag-header">
    <span class="tag-type">${escapeHtml(singularName)}</span>
    <h1 class="tag-name">${escapeHtml(value)}</h1>
    <p class="tag-count">${sorted.length} films</p>
  </div>

  ${(showCountries || showDecades || showTechniques) ? `
  <div class="tag-stats-grid">
    ${showCountries ? `
    <div class="tag-stat-card">
      <div class="stat-card-title">Top Countries</div>
      <div class="stat-card-list">${countriesSorted.slice(0, 8).map(([c, n]) => `<a href="../countries/${slugify(c)}.html" class="stat-tag">${escapeHtml(c)} <span class="stat-tag-count">(${n})</span></a>`).join('')}</div>
    </div>` : ''}
    ${showDecades ? `
    <div class="tag-stat-card">
      <div class="stat-card-title">Decades</div>
      <div class="stat-card-list">${decadesSorted.map(([d, n]) => `<a href="../decades/${d}s.html" class="stat-tag">${d}s <span class="stat-tag-count">(${n})</span></a>`).join('')}</div>
    </div>` : ''}
    ${showTechniques ? `
    <div class="tag-stat-card">
      <div class="stat-card-title">Techniques</div>
      <div class="stat-card-list">${techniquesSorted.slice(0, 6).map(([t, n]) => `<a href="../techniques/${slugify(t)}.html" class="stat-tag">${escapeHtml(t)} <span class="stat-tag-count">(${n})</span></a>`).join('')}</div>
    </div>` : ''}
  </div>` : ''}

  <section class="tag-films-section">
    <div class="table-wrapper">
      <table class="film-table">
        <thead><tr>
          <th scope="col" style="width:90px">Year</th>
          <th scope="col">Title</th>
          <th scope="col">Director / Studio</th>
          <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
          <th scope="col" style="width:70px" class="hide-mobile">Runtime</th>
          <th scope="col" style="width:90px" class="hide-mobile">Confidence</th>
          <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
        </tr></thead>
        <tbody>${generateTableRows(sorted, { basePath: '../' })}</tbody>
      </table>
    </div>
  </section>
</main>
${generateFooter('../')}
</body></html>`;
}

/**
 * Generate the index page (tag-cloud of all facet values).
 */
function generateFacetIndexPage(config, valuesWithFilms) {
  const { slug, label, films, deps } = config;
  const { slugify, escapeHtml, generateBreadcrumb, generateFooter,
          SITE_URL, FAVICON, BUILD_DATE } = deps;

  const thresholds = config.sizeThresholds || DEFAULT_SIZE_THRESHOLDS;

  const sorted = Object.entries(valuesWithFilms)
    .map(([name, fs]) => ({ name, count: fs.length }))
    .sort((a, b) => b.count - a.count);

  const totalFilmsWithAnyValue = films.filter(f => {
    const vals = config.extract(f);
    return Array.isArray(vals) ? vals.length > 0 : Boolean(vals);
  }).length;

  const description = config.describeIndex
    ? config.describeIndex(sorted, totalFilmsWithAnyValue)
    : `Browse ${sorted.length} ${label.toLowerCase()} from around the world. ${totalFilmsWithAnyValue} films categorized in the Global Animation Archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(label)} — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/${slug}/">
${FAVICON}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(label)} — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
${deps.FONT_HEAD || ''}
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
${generateBreadcrumb([
  { label: 'Home', url: 'index.html' },
  { label: escapeHtml(label) }
], '../')}
<main class="entity-index ${slug}-index" id="main-content">
  <div class="entity-index-header">
    <h1>${escapeHtml(
      typeof config.indexHeading === 'function'
        ? config.indexHeading(sorted, totalFilmsWithAnyValue)
        : (config.indexHeading || label)
    )}</h1>
    <p class="entity-index-subtitle">${escapeHtml(
      typeof config.indexSubtitle === 'function'
        ? config.indexSubtitle(sorted, totalFilmsWithAnyValue)
        : (config.indexSubtitle || `Browse ${sorted.length} ${label.toLowerCase()}`)
    )}</p>
  </div>
  <div class="tag-cloud">
    ${sorted.map(({ name, count }) => {
      const size = pickSize(count, thresholds);
      return `<a href="${slugify(name)}.html" class="tag-cloud-item tag-size-${size}">
        <span class="tag-name">${escapeHtml(name)}</span>
        <span class="tag-count">${count}</span>
      </a>`;
    }).join('')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

/**
 * Main entry point. Groups films by facet value, writes one page per value,
 * writes the index page, and returns stats.
 *
 * @param {object} config
 * @param {string} config.name         - Singular display name, e.g. "Genre"
 * @param {string} config.slug         - URL slug / dirname, e.g. "genres"
 * @param {string} config.label        - Plural display label, e.g. "Genres"
 * @param {Function} config.extract    - (film) => string[] | string | null
 * @param {Array} config.films         - Films array
 * @param {object} config.deps         - Injected helpers from build-site.js
 * @param {Function} [config.describe] - Custom per-value description
 * @param {Function} [config.describeIndex] - Custom index description
 * @param {Function} [config.writeFile] - Custom file writer (for testing)
 * @param {Function} [config.makeDir]   - Custom dir creator (for testing)
 * @param {Array}    [config.sizeThresholds] - Custom tag-cloud sizing
 * @returns {{ count: number, valuesWithFilms: Record<string, Array> }}
 */
export function generateTagFacetPages(config) {
  const { name, slug, films, extract, deps, writeFile, makeDir } = config;

  if (!name || !slug || !films || !extract || !deps) {
    throw new Error(`generateTagFacetPages: missing required config (name/slug/films/extract/deps)`);
  }

  const write = writeFile || deps.writeFileSync;
  const mkdir = makeDir  || deps.mkdirSync;

  if (!write || !mkdir) {
    throw new Error(`generateTagFacetPages: need writeFileSync + mkdirSync in deps or overrides`);
  }

  const { slugify } = deps;

  // Group films by facet value
  const valuesWithFilms = {};
  for (const film of films) {
    const raw = extract(film);
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const value of values) {
      if (value == null || value === '') continue;
      if (!valuesWithFilms[value]) valuesWithFilms[value] = [];
      valuesWithFilms[value].push(film);
    }
  }

  if (Object.keys(valuesWithFilms).length === 0) {
    console.log(`  ⚠ No ${slug} data, skipping ${slug} pages`);
    return { count: 0, valuesWithFilms };
  }

  mkdir(`./dist/${slug}`, { recursive: true });

  let count = 0;
  for (const [value, valueFilms] of Object.entries(valuesWithFilms)) {
    const html = generateFacetDetailPage(config, value, valueFilms);
    write(`./dist/${slug}/${slugify(value)}.html`, html);
    count++;
  }

  // Index page
  write(`./dist/${slug}/index.html`, generateFacetIndexPage(config, valuesWithFilms));

  return { count, valuesWithFilms };
}

/**
 * Exported for tests / reuse if a facet needs to render just the detail page
 * HTML without the file-writing side-effects.
 */
export { generateFacetDetailPage, generateFacetIndexPage, DEFAULT_SIZE_THRESHOLDS };
