/**
 * Targeted regenerator for /dist/platforms/<slug>.html and the platforms
 * index page. Bypasses the full build-site.js pipeline so platform-page
 * changes can ship without waiting for the slow film-page loop (which is
 * currently throttled by macOS iCloud sync EDEADLK locks on this folder).
 *
 * Imports the same generatePlatformPages function from build-site.js to
 * stay in sync. If anything in build-site.js shifts upstream, this script
 * inherits it automatically.
 *
 * Usage:
 *   node scripts/build-platforms-only.js
 */
import { existsSync } from 'fs';

if (!existsSync('./data/films.json')) {
  console.error('ERROR: data/films.json not found. Run `npm run fetch:all` first.');
  process.exit(1);
}

// Patch process.exit so build-site.js's bootstrap doesn't slip past us.
// (build-site.js's IIFE-style top-level execution kicks off build() which
// runs the full pipeline. Importing it would do too much.)
//
// Instead, spawn a focused import of just the helper module.
process.env.PLATFORMS_ONLY = '1';

// Build pipeline: do enough setup to call generatePlatformPages.
// build-site.js's build() function is module-top-level — importing the
// module runs the whole thing. Hack: we duplicate the platform-pages call
// here using the same exported helper from facet-builder.js.

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { generateTagFacetPages } from './lib/facet-builder.js';

// === Replicate just the deps generatePlatformPages needs ===

const films       = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const stats       = JSON.parse(readFileSync('./data/stats.json', 'utf-8'));
const platformMeta = existsSync('./data/platform-meta.json')
  ? JSON.parse(readFileSync('./data/platform-meta.json', 'utf-8'))
  : { platforms: {} };

const SITE_URL = 'https://animationarchive.netlify.app';
const BUILD_DATE = new Date().toISOString().split('T')[0];
const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎞️</text></svg>">`;
const FONT_HEAD = `<link rel="preload" href="../fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/playfair-display.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:'Inter';font-style:normal;font-weight:400 600;font-display:swap;src:url('../fonts/inter.woff2') format('woff2')}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 600;font-display:swap;src:url('../fonts/jetbrains-mono.woff2') format('woff2')}
@font-face{font-family:'Playfair Display';font-style:normal;font-weight:400 600;font-display:swap;src:url('../fonts/playfair-display.woff2') format('woff2')}
@font-face{font-family:'Playfair Display';font-style:italic;font-weight:400;font-display:swap;src:url('../fonts/playfair-display-italic.woff2') format('woff2')}
@font-face{font-family:'Source Serif 4';font-style:normal;font-weight:400;font-display:swap;src:url('../fonts/source-serif-4.woff2') format('woff2')}
@font-face{font-family:'Source Serif 4';font-style:italic;font-weight:400;font-display:swap;src:url('../fonts/source-serif-4-italic.woff2') format('woff2')}
</style>`;

// === Lite re-implementations of helpers we need (escapeHtml, slugify, etc) ===
// Cribbed from build-site.js; kept in sync manually if those change.

function slugify(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const WATCHABLE_STATUSES = new Set(['Verified']);
const GATED_STATUSES     = new Set(['Restricted', 'Unverified']);
function isWatchable(l) { return Boolean(l && l.url && WATCHABLE_STATUSES.has(l.status)); }
function isGated(l)     { return Boolean(l && l.url && GATED_STATUSES.has(l.status)); }
function isVisible(l)   { return isWatchable(l) || isGated(l); }
function getBestWatchLink(film) {
  if (!Array.isArray(film.watchLinks) || film.watchLinks.length === 0) return null;
  return film.watchLinks.find(isWatchable) || film.watchLinks.find(isGated) || null;
}

const countryCodes = {
  'USA': 'USA', 'Japan': 'JPN', 'France': 'FRA', 'Germany': 'DEU', 'UK': 'GBR',
  'USSR': 'SUN', 'Russia': 'RUS', 'China': 'CHN', 'Czechoslovakia': 'CZE',
  'Czech Republic': 'CZE', 'Yugoslavia': 'YUG', 'Hungary': 'HUN', 'Poland': 'POL',
  'Romania': 'ROU', 'Bulgaria': 'BGR', 'Estonia': 'EST', 'Latvia': 'LVA',
  'Lithuania': 'LTU', 'Canada': 'CAN', 'Australia': 'AUS', 'India': 'IND',
  'South Korea': 'KOR', 'Korea': 'KOR', 'Thailand': 'THA', 'Vietnam': 'VNM',
  'Indonesia': 'IDN', 'Philippines': 'PHL', 'Malaysia': 'MYS', 'Singapore': 'SGP',
  'Taiwan': 'TWN', 'Hong Kong': 'HKG', 'Mexico': 'MEX', 'Brazil': 'BRA',
  'Argentina': 'ARG', 'Chile': 'CHL', 'Cuba': 'CUB', 'Venezuela': 'VEN',
  'Egypt': 'EGY', 'Nigeria': 'NGA', 'South Africa': 'ZAF', 'Turkey': 'TUR',
  'Iran': 'IRN', 'Israel': 'ISR', 'Lebanon': 'LBN', 'Italy': 'ITA',
  'Spain': 'ESP', 'Portugal': 'PRT', 'Netherlands': 'NLD', 'Belgium': 'BEL',
  'Switzerland': 'CHE', 'Austria': 'AUT', 'Sweden': 'SWE', 'Norway': 'NOR',
  'Denmark': 'DNK', 'Finland': 'FIN', 'Iceland': 'ISL', 'Ireland': 'IRL',
  'New Zealand': 'NZL', 'Croatia': 'HRV', 'Serbia': 'SRB', 'Slovenia': 'SVN',
  'Slovakia': 'SVK', 'Greece': 'GRC', 'Ukraine': 'UKR', 'Belarus': 'BLR',
  'Montenegro': 'MNE', 'North Macedonia': 'MKD', 'Bosnia': 'BIH',
};
function getCountryCode(country) { return countryCodes[country] || (country ? country.slice(0, 3).toUpperCase() : ''); }

function getFilmUrl(film) {
  const slug = slugify(film.titleEnglish || film.title || 'untitled');
  return `films/${slug}-${film.id.slice(0, 8)}.html`;
}

// Minimal generateTableRows — enough for platform pages
function generateTableRows(films, opts = {}) {
  const basePath = opts.basePath || '';
  return films.map(film => {
    const dec = film.year ? Math.floor(film.year / 10) * 10 : '';
    const link = getBestWatchLink(film);
    const watchCell = link
      ? `<a href="${escapeHtml(link.url)}" class="watch-btn${isGated(link) ? ' watch-btn-gated' : ''}" target="_blank" rel="noopener" aria-label="Watch ${escapeHtml(film.titleEnglish || 'this film')} on ${escapeHtml(link.platform || 'platform')} (opens in new tab)">${isGated(link) ? `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg><span class="watch-btn-platform">${escapeHtml((link.platform || 'OPEN').toUpperCase())}</span>` : '▶ WATCH'}</a>${(!isGated(link) && film.hasSubtitles) ? '<span class="subs-badge">EN subs</span>' : ''}`
      : '<span class="no-link">—</span>';
    return `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${dec}" data-technique="${escapeHtml((film.technique || []).join(','))}" data-watchable="${film.watchLinks?.some(isVisible) ? 'true' : 'false'}" data-verified="${film.watchLinks?.some(isWatchable) ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
      <td><a href="${basePath}${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish || 'Untitled')}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${film.director ? `<strong>${escapeHtml(film.director)}</strong>` : ''}${film.studio ? `${film.director ? '<br>' : ''}${escapeHtml(film.studio)}` : ''}</td>
      <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td class="table-runtime hide-mobile">${escapeHtml(film.runtime) || '—'}</td>
      <td class="hide-mobile"><span class="confidence-pips"><span class="filled">${'■'.repeat((film.confidence || '').length)}</span><span class="empty">${'□'.repeat(5 - (film.confidence || '').length)}</span></span></td>
      <td class="watch-cell">${watchCell}</td>
    </tr>`;
  }).join('');
}

function generateBreadcrumb(items, basePath = '') {
  const itemList = items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast) return `<li class="breadcrumb-item"><span aria-current="page">${item.label}</span></li>`;
    return `<li class="breadcrumb-item"><a href="${basePath}${item.url}">${item.label}</a><span class="breadcrumb-sep">›</span></li>`;
  }).join('');
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
    <ol class="breadcrumb-list">
      ${itemList}
    </ol>
  </nav>
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.label,
      ...(item.url ? { item: `${SITE_URL}/${item.url}` } : {}),
    })),
  })}</script>`;
}

function generateFooter(basePath = '') {
  return `<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${new Date().toISOString()}</div></div></footer>`;
}

// === Now the actual call ===

const config = {
  name: 'Platform',
  slug: 'platforms',
  label: 'Streaming Platforms',
  extract: (film) => {
    const links = Array.isArray(film.watchLinks) ? film.watchLinks : [];
    const set = new Set();
    for (const l of links) {
      if (!l || !l.platform) continue;
      if (!isVisible(l)) continue;
      set.add(l.platform);
    }
    return [...set];
  },
  films,
  sizeThresholds: [
    { min: 300, size: 'xl' }, { min: 100, size: 'lg' },
    { min: 40,  size: 'md' }, { min: 15,  size: 'sm' }, { min: 0, size: 'xs' },
  ],
  detailTitle: (value, sorted) => {
    const meta = platformMeta.platforms[value];
    const prefix = meta?.tier === 'free' ? 'Free animated films' : 'Animated films';
    return `${prefix} on ${value} (${sorted.length}) — Global Animation Archive`;
  },
  describe: (value, sorted) => {
    const meta = platformMeta.platforms[value];
    const tag = meta?.tagline ? ` ${meta.tagline}.` : '';
    return `${sorted.length} animated films you can watch on ${value} — verified entries from the Global Animation Archive.${tag}`;
  },
  detailOgDescription: (value, sorted) => {
    const meta = platformMeta.platforms[value];
    if (meta?.intro) return meta.intro.length > 280 ? meta.intro.slice(0, 277) + '...' : meta.intro;
    return `${sorted.length} animated films you can watch on ${value}.`;
  },
  detailHero: (value, sorted) => {
    const meta = platformMeta.platforms[value];
    const tierLabel = meta?.tier ? ({ free: 'Free', paid: 'Paid', mixed: 'Mixed', library: 'Library' }[meta.tier] || meta.tier) : null;
    const regionLabel = meta?.region
      ? (meta.region === 'global' ? 'Global'
          : ({ US: 'US-only', EU: 'EU-only', JP: 'Japan-only', CN: 'China-only',
              KR: 'Korea-only', RU: 'Russia-only', MENA: 'MENA-only', library: 'Library card' }[meta.region] || meta.region))
      : null;
    const tierBadge = tierLabel ? `<span class="tag-badge tag-badge--tier-${meta.tier}">${escapeHtml(tierLabel)}</span>` : '';
    const regionBadge = regionLabel ? `<span class="tag-badge tag-badge--region">${escapeHtml(regionLabel)}</span>` : '';
    const linkOut = meta?.url
      ? `<a href="${escapeHtml(meta.url)}" target="_blank" rel="noopener" class="platform-hero-link">${escapeHtml(meta.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))} &nearr;</a>`
      : '';
    const intro = meta?.intro ? `<p class="platform-hero-lede">${escapeHtml(meta.intro)}</p>` : '';
    const tagline = meta?.tagline ? `<p class="platform-hero-tagline">${escapeHtml(meta.tagline)}</p>` : '';
    return `<section class="platform-hero">
  <div class="platform-hero-top">
    <div class="platform-hero-identity">
      <span class="platform-hero-type">Streaming Platform</span>
      <h1 class="platform-hero-name">${escapeHtml(value)}</h1>
      ${(tierBadge || regionBadge) ? `<div class="platform-hero-badges">${tierBadge}${regionBadge}</div>` : ''}
      ${tagline}
    </div>
    <div class="platform-hero-stat">
      <span class="platform-hero-stat-value">${sorted.length}</span>
      <span class="platform-hero-stat-label">${sorted.length === 1 ? 'film catalogued' : 'films catalogued'}</span>
    </div>
  </div>
  ${intro}
  ${linkOut ? `<div class="platform-hero-meta">${linkOut}</div>` : ''}
</section>`;
  },
  detailCuratorPicks: (value, sorted) => {
    if (sorted.length < 30) return '';
    const verifiedHere = sorted
      .filter(f => Array.isArray(f.watchLinks) && f.watchLinks.some(l =>
        l && l.url && l.platform === value && l.status === 'Verified'))
      .map(f => ({
        film: f,
        link: f.watchLinks.find(l => l && l.url && l.platform === value && l.status === 'Verified'),
        confidence: (f.confidence || '').length,
      }))
      .filter(p => p.confidence >= 4)
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return (b.film.year || 0) - (a.film.year || 0);
      })
      .slice(0, 4);
    if (verifiedHere.length < 3) return '';
    const cards = verifiedHere.map(({ film, link }) => {
      const title = escapeHtml(film.titleEnglish || film.title || 'Untitled');
      const year = film.year || '';
      const cc = getCountryCode(film.country);
      const director = film.director ? escapeHtml(film.director.split(',')[0].trim()) : '';
      return `<article class="pick-card">
        <div class="pick-meta"><span class="pick-year">${year}</span><span class="pick-divider">·</span><span class="pick-country">${cc}</span><span class="pick-divider">·</span><span class="pick-platform">★ ${'★'.repeat((film.confidence || '').length - 1)}</span></div>
        <h3 class="pick-title"><a href="../${getFilmUrl(film)}">${title}</a></h3>
        ${director ? `<div class="pick-credit">${director}</div>` : ''}
        <a href="${escapeHtml(link.url)}" class="pick-watch-btn" target="_blank" rel="noopener" aria-label="Watch ${title} on ${escapeHtml(value)} (opens in new tab)">▶ Watch</a>
      </article>`;
    }).join('');
    return `<section class="featured-picks platform-picks" aria-labelledby="platform-picks-title">
  <div class="featured-picks-header">
    <h2 id="platform-picks-title" class="featured-picks-title">Curator's picks on <em>${escapeHtml(value)}</em></h2>
    <p class="featured-picks-subtitle">${verifiedHere.length} highest-confidence films from this platform's verified catalog.</p>
  </div>
  <div class="featured-picks-grid">${cards}</div>
</section>`;
  },
  detailJsonLd: (value, sorted) => {
    const meta = platformMeta.platforms[value];
    return JSON.stringify({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `Animated films on ${value}`,
      description: meta?.intro || `${sorted.length} animated films available on ${value}.`,
      url: `${SITE_URL}/platforms/${slugify(value)}.html`,
      about: { '@type': 'Service', name: value, ...(meta?.url ? { url: meta.url } : {}) },
      numberOfItems: sorted.length,
      isPartOf: { '@type': 'CollectionPage', name: 'Global Animation Archive', url: SITE_URL },
    });
  },
  indexHeading: 'Streaming Platforms',
  indexSubtitle: () => 'Where to watch world animation — sorted by catalog size.',
  describeIndex: (sorted, total) => `Browse ${sorted.length} streaming platforms. ${total} animated films with verified watch links in the Global Animation Archive.`,
  deps: {
    slugify, escapeHtml, generateTableRows, generateBreadcrumb, generateFooter,
    SITE_URL, FAVICON, BUILD_DATE, FONT_HEAD,
    writeFileSync: (path, content) => {
      try { writeFileSync(path, content); }
      catch (err) {
        if (err.code === 'EAGAIN' || err.errno === -35 || /deadlock/i.test(err.message)) {
          console.warn(`  ⚠ skipped ${path} (filesystem lock)`);
        } else throw err;
      }
    },
    mkdirSync,
  },
};

console.log('Regenerating platform pages...');
const { count } = generateTagFacetPages(config);
console.log(`  ✓ ${count} platform pages + index regenerated`);
