import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync } from 'fs';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { generateWatchLinksHTML, WATCH_LINKS_CSS } from './watch-links-renderer.js';
import { generateTagFacetPages } from './lib/facet-builder.js';

/**
 * Batch D2: content-hashed asset helpers.
 *
 * Hashes a string (sha256, 8 hex chars) for fingerprinting generated JS.
 * The hash is embedded in the filename (e.g. films-index-a1b2c3d4.js) so
 * we can serve those assets with `max-age=31536000, immutable` — the URL
 * itself changes whenever the content changes, guaranteeing cache safety.
 */
function contentHash(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

/**
 * Wipe stale hashed assets from a previous build matching `prefix-*.ext`.
 * Prevents dist/ accumulating orphan files across rebuilds. Unhashed
 * siblings (e.g. a legacy plain app.js) are left alone.
 */
function cleanHashedAssets(dir, prefix, ext) {
  if (!existsSync(dir)) return;
  const re = new RegExp('^' + prefix + '-[a-f0-9]{8}\\.' + ext + '$');
  for (const name of readdirSync(dir)) {
    if (re.test(name)) {
      try { unlinkSync(`${dir}/${name}`); } catch {}
    }
  }
  // Also sweep legacy unhashed sibling (e.g. pre-D2 plain app.js / films-index.js)
  // left over from a previous build. Safe because the current build no longer
  // emits the unhashed form.
  const legacy = `${dir}/${prefix}.${ext}`;
  if (existsSync(legacy)) {
    try { unlinkSync(legacy); } catch {}
  }
}

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const stats = JSON.parse(readFileSync('./data/stats.json', 'utf-8'));

// ===== Derived stats computed at build time (not persisted to stats.json) =====
// Platform stats: count of films reachable per streaming platform via their
// embedded watchLinks array. Feeds the sidebar Platform filter + /platforms/ facet.
// A film counts toward a platform if it has at least one non-Dead link with a URL.
(function computePlatformStats() {
  const counts = {};
  for (const f of films) {
    const links = Array.isArray(f.watchLinks) ? f.watchLinks : [];
    const seen = new Set();
    for (const l of links) {
      if (!l || !l.platform || !l.url) continue;
      if (l.status === 'Dead') continue;
      if (seen.has(l.platform)) continue;
      seen.add(l.platform);
      counts[l.platform] = (counts[l.platform] || 0) + 1;
    }
  }
  stats.platforms = counts;
  stats.platformsSorted = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
})();

// Load related data files (may not exist yet)
const studios = existsSync('./data/studios.json') ? JSON.parse(readFileSync('./data/studios.json', 'utf-8')) : [];
const directorsData = existsSync('./data/directors.json') ? JSON.parse(readFileSync('./data/directors.json', 'utf-8')) : [];
const seriesData = existsSync('./data/series.json') ? JSON.parse(readFileSync('./data/series.json', 'utf-8')) : [];

// Create lookup maps for entities
const studioMap = new Map(studios.map(s => [s.id, s]));
const directorMap = new Map(directorsData.map(d => [d.id, d]));
const seriesMap = new Map(seriesData.map(s => [s.id, s]));
const BUILD_DATE = new Date().toISOString().split('T')[0];
const BUILD_TIMESTAMP = new Date().toISOString();
const SITE_URL = 'https://animationarchive.netlify.app';
const FILMS_PER_PAGE = 50;
const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎞️</text></svg>">`;
const OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Self-hosted font block — replaces the Google Fonts <link> on every
 * page template (2026-04-26 perf). Eliminates DNS + CSS round-trip to
 * fonts.googleapis.com and cross-origin font fetches from fonts.gstatic.com.
 *
 * Files live in /fonts/ and ship under the immutable cache header
 * (already configured for /*.woff2 in netlify.toml — see below).
 *
 * Latin subset only (the catalog is ~99% Latin script with romanized
 * CJK/Cyrillic). Variable font binaries are shared across weights:
 * Inter, JetBrains Mono, and Playfair Display each have a single
 * woff2 covering 400/500/600.
 *
 * `font-display: swap` matches the original Google Fonts behavior —
 * fast paint with system fallback, swap to webfont when ready.
 *
 * Critical pair (`Inter` + `Playfair Display`) is preloaded; the rest
 * load on demand. Cuts FCP-blocking font fetch to 2 from 6.
 */
const FONT_HEAD = `<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/playfair-display.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:'Inter';font-style:normal;font-weight:400 600;font-display:swap;src:url('/fonts/inter.woff2') format('woff2')}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 600;font-display:swap;src:url('/fonts/jetbrains-mono.woff2') format('woff2')}
@font-face{font-family:'Playfair Display';font-style:normal;font-weight:400 600;font-display:swap;src:url('/fonts/playfair-display.woff2') format('woff2')}
@font-face{font-family:'Playfair Display';font-style:italic;font-weight:400;font-display:swap;src:url('/fonts/playfair-display-italic.woff2') format('woff2')}
@font-face{font-family:'Source Serif 4';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/source-serif-4.woff2') format('woff2')}
@font-face{font-family:'Source Serif 4';font-style:italic;font-weight:400;font-display:swap;src:url('/fonts/source-serif-4-italic.woff2') format('woff2')}
</style>`;

function confidenceToPips(confidence) {
  const levels = { '★': 1, '★★': 2, '★★★': 3, '★★★★': 4, '★★★★★': 5 };
  const level = levels[confidence] || 0;
  return `<span class="filled">${'■'.repeat(level)}</span><span class="empty">${'□'.repeat(5 - level)}</span>`;
}

// Complete country code mappings (all 47+ countries)
const countryCodes = {
  'USSR': 'USSR', 'Russia': 'RUS', 'Czechoslovakia': 'CSSR', 'Czech Republic': 'CZE',
  'Poland': 'POL', 'Hungary': 'HUN', 'Yugoslavia': 'YUG', 'Croatia': 'HRV',
  'Serbia': 'SRB', 'Romania': 'ROU', 'East Germany': 'DDR', 'Germany': 'DEU',
  'China': 'CHN', 'Japan': 'JPN', 'USA': 'USA', 'France': 'FRA', 'UK': 'GBR',
  'Canada': 'CAN', 'Italy': 'ITA', 'Australia': 'AUS', 'India': 'IND',
  'Thailand': 'THA', 'Vietnam': 'VNM', 'UAE': 'UAE', 'Cuba': 'CUB',
  'Brazil': 'BRA', 'Belgium': 'BEL', 'Philippines': 'PHL', 'Malaysia': 'MYS',
  'Indonesia': 'IDN', 'South Africa': 'ZAF', 'Egypt': 'EGY', 'Iran': 'IRN',
  'Argentina': 'ARG', 'Mexico': 'MEX', 'South Korea': 'KOR', 'Taiwan': 'TWN',
  'Turkey': 'TUR', 'Nigeria': 'NGA', 'Kenya': 'KEN', 'Zambia': 'ZMB',
  'Saudi Arabia': 'SAU', 'North Korea': 'PRK', 'Spain': 'ESP', 'Netherlands': 'NLD',
  'Sweden': 'SWE', 'Denmark': 'DNK', 'Norway': 'NOR', 'Switzerland': 'CHE',
  'Ireland': 'IRL', 'New Zealand': 'NZL', 'Singapore': 'SGP', 'Israel': 'ISR',
  'Slovakia': 'SVK', 'Bulgaria': 'BGR', 'Ukraine': 'UKR', 'Estonia': 'EST',
  'Latvia': 'LVA', 'Lithuania': 'LTU', 'Georgia': 'GEO', 'Armenia': 'ARM',
  'Chile': 'CHL', 'Colombia': 'COL', 'Peru': 'PER', 'Venezuela': 'VEN',
  'Ecuador': 'ECU', 'Uruguay': 'URY', 'Bolivia': 'BOL', 'Paraguay': 'PRY',
  'Portugal': 'PRT', 'Greece': 'GRC', 'Austria': 'AUT', 'Finland': 'FIN',
  'Iceland': 'ISL', 'Luxembourg': 'LUX', 'Malta': 'MLT', 'Cyprus': 'CYP',
  'Slovenia': 'SVN', 'Bosnia and Herzegovina': 'BIH', 'Montenegro': 'MNE',
  'North Macedonia': 'MKD', 'Albania': 'ALB', 'Moldova': 'MDA', 'Belarus': 'BLR',
  'Azerbaijan': 'AZE', 'Kazakhstan': 'KAZ', 'Uzbekistan': 'UZB', 'Turkmenistan': 'TKM',
  'Tajikistan': 'TJK', 'Kyrgyzstan': 'KGZ', 'Mongolia': 'MNG', 'Myanmar': 'MMR',
  'Cambodia': 'KHM', 'Laos': 'LAO', 'Bangladesh': 'BGD', 'Pakistan': 'PAK',
  'Sri Lanka': 'LKA', 'Nepal': 'NPL', 'Afghanistan': 'AFG', 'Iraq': 'IRQ',
  'Syria': 'SYR', 'Lebanon': 'LBN', 'Jordan': 'JOR', 'Palestine': 'PSE',
  'Kuwait': 'KWT', 'Qatar': 'QAT', 'Bahrain': 'BHR', 'Oman': 'OMN', 'Yemen': 'YEM',
  'Morocco': 'MAR', 'Algeria': 'DZA', 'Tunisia': 'TUN', 'Libya': 'LBY',
  'Sudan': 'SDN', 'Ethiopia': 'ETH', 'Tanzania': 'TZA', 'Uganda': 'UGA',
  'Rwanda': 'RWA', 'Ghana': 'GHA', 'Senegal': 'SEN', 'Ivory Coast': 'CIV',
  'Cameroon': 'CMR', 'DR Congo': 'COD', 'Angola': 'AGO', 'Mozambique': 'MOZ',
  'Zimbabwe': 'ZWE', 'Botswana': 'BWA', 'Namibia': 'NAM', 'Madagascar': 'MDG',
  'Mauritius': 'MUS', 'Jamaica': 'JAM', 'Haiti': 'HTI', 'Dominican Republic': 'DOM',
  'Puerto Rico': 'PRI', 'Trinidad and Tobago': 'TTO', 'Bahamas': 'BHS',
  'Costa Rica': 'CRI', 'Panama': 'PAN', 'Guatemala': 'GTM', 'Honduras': 'HND',
  'El Salvador': 'SLV', 'Nicaragua': 'NIC', 'Hong Kong': 'HKG', 'Macau': 'MAC',
  'Other': 'OTH'
};

function getCountryCode(country) { return countryCodes[country] || country?.substring(0, 3).toUpperCase() || '???'; }

// Technique descriptions for technique pages
const techniqueDescriptions = {
  '2D Cel': 'Traditional cel animation drawn frame by frame on transparent sheets',
  '2D Digital': 'Computer-generated 2D animation using digital drawing tools',
  'Stop Motion': 'Frame-by-frame animation of physical objects or puppets',
  'Cutout': 'Animation using flat characters and backgrounds cut from paper or card',
  'Puppet': 'Three-dimensional puppet animation, often with armatures',
  'Clay': 'Stop-motion using malleable clay or plasticine figures',
  'Pixilation': 'Stop-motion technique using live actors as frame-by-frame subjects',
  'Silhouette': 'Animation using backlit black shapes against bright backgrounds',
  'Sand': 'Animation created by manipulating sand on a lightbox',
  'Paint on Glass': 'Slow-drying oil paints manipulated on glass sheets',
  'Pinscreen': 'Animation using thousands of pins pushed through a screen',
  'Rotoscope': 'Animation traced over live-action footage',
  'CGI': 'Three-dimensional computer-generated imagery',
  'Mixed': 'Combination of multiple animation techniques',
  'Experimental': 'Non-traditional or avant-garde animation approaches',
  'Direct on Film': 'Animation drawn or scratched directly onto film stock',
  'Collage': 'Animation using assembled found materials and images',
  'Ink-Wash': 'Traditional East Asian ink wash painting animated frame by frame',
  'Paper Cut': 'Animation using traditional paper cutting techniques',
  'Documentary': 'Animated documentary combining real events with animation'
};

// Decade descriptions for decade pages
const decadeDescriptions = {
  1900: 'The birth of animation — pioneers experiment with motion pictures',
  1910: 'Early animation studios emerge, theatrical shorts gain popularity',
  1920: 'Silent era golden age — Felix the Cat, Fleischer Studios rise',
  1930: 'Sound transforms animation — Disney dominates, Snow White debuts',
  1940: 'Wartime propaganda and postwar experimentation across the globe',
  1950: 'Television reshapes the industry, UPA modernism, anime beginnings',
  1960: 'Artistic renaissance — Zagreb School, NFB, auteur animation flourishes',
  1970: 'Independent animation grows, Eastern European masters peak',
  1980: 'Anime goes global, MTV generation, early CGI experiments',
  1990: 'Digital revolution begins, Pixar emerges, anime mainstream breakthrough',
  2000: '3D CGI dominates mainstream, indie animation thrives online',
  2010: 'Streaming era, global co-productions, diverse voices emerge',
  2020: 'Pandemic production shifts, AI tools debut, hybrid techniques'
};

function escapeHtml(str) { if (!str) return ''; if (Array.isArray(str)) str = str.join(', '); if (typeof str !== 'string') str = String(str); return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(str) { return (str || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
// Helper to filter out N/A values from URLs
function getValidUrl(url) { return (url && url !== 'N/A' && url.toLowerCase() !== 'n/a' && url.startsWith('http')) ? url : null; }
function getFilmUrl(film, basePath = '') { return `${basePath}films/${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html`; }
function getFilmFilename(film) { return `${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html`; }
function getStudioUrl(studio, basePath = '') { return `${basePath}studios/${slugify(studio.name)}-${studio.id.slice(0,8)}.html`; }
function getDirectorUrl(director, basePath = '') { return `${basePath}directors/${slugify(director.name)}-${director.id.slice(0,8)}.html`; }
function getSeriesUrl(series, basePath = '') { return `${basePath}series/${slugify(series.name)}-${series.id.slice(0,8)}.html`; }

// Format watch order text into proper HTML list
function formatWatchOrder(text) {
  if (!text) return '';
  const lines = text.split('\n').filter(l => l.trim());
  const items = [];
  let isNumbered = false;
  let hasBullets = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Check for numbered items (1. or 1) format)
    if (/^\d+[\.\)]\s/.test(trimmed)) {
      isNumbered = true;
      items.push({ type: 'item', text: trimmed.replace(/^\d+[\.\)]\s*/, '') });
    }
    // Check for bullet items (- or • format)
    else if (/^[-•]\s/.test(trimmed)) {
      hasBullets = true;
      items.push({ type: 'item', text: trimmed.replace(/^[-•]\s*/, '') });
    }
    // Otherwise it's a header/note
    else if (items.length === 0 || trimmed.endsWith(':')) {
      items.push({ type: 'header', text: trimmed });
    } else {
      items.push({ type: 'text', text: trimmed });
    }
  }

  // Build HTML
  let html = '';
  let inList = false;
  const listTag = isNumbered ? 'ol' : 'ul';

  for (const item of items) {
    if (item.type === 'item') {
      if (!inList) { html += `<${listTag} class="watch-order-list">`; inList = true; }
      html += `<li>${escapeHtml(item.text)}</li>`;
    } else {
      if (inList) { html += `</${listTag}>`; inList = false; }
      if (item.type === 'header') {
        html += `<p class="watch-order-header">${escapeHtml(item.text)}</p>`;
      } else {
        html += `<p>${escapeHtml(item.text)}</p>`;
      }
    }
  }
  if (inList) html += `</${listTag}>`;

  return html || escapeHtml(text).replace(/\n/g, '<br>');
}

// Breadcrumb generator
function generateBreadcrumb(items, basePath = '../') {
  // items: [{label, url}, {label, url}, {label}] - last item has no url (current page)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.label,
      ...(item.url ? { "item": `${SITE_URL}/${item.url}` } : {})
    }))
  };

  return `<nav class="breadcrumb" aria-label="Breadcrumb">
    <ol class="breadcrumb-list">
      ${items.map((item, i) => `<li class="breadcrumb-item">${item.url ? `<a href="${basePath}${item.url}">${escapeHtml(item.label)}</a>` : `<span aria-current="page">${escapeHtml(item.label)}</span>`}${i < items.length - 1 ? '<span class="breadcrumb-sep">›</span>' : ''}</li>`).join('')}
    </ol>
  </nav>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

// Create lookup maps by name for fallback matching
const studiosByName = new Map();
studios.forEach(s => {
  if (s.name) studiosByName.set(s.name.toLowerCase().trim(), s);
});
const directorsByName = new Map();
directorsData.forEach(d => {
  if (d.name) directorsByName.set(d.name.toLowerCase().trim(), d);
});

// Helper to get linked studio HTML (uses entities, falls back to name matching, then plain text)
function getStudioLink(film, basePath = '') {
  // First try entity relations
  if (film.studioEntities && film.studioEntities.length > 0) {
    return film.studioEntities.map(s => {
      const studio = studioMap.get(s.id);
      if (studio) {
        return `<a href="${basePath}${getStudioUrl(studio)}">${escapeHtml(s.name)}</a>`;
      }
      return escapeHtml(s.name);
    }).join(', ');
  }
  // Fall back to text field with name matching
  if (film.studio) {
    const studioName = film.studio.trim();
    const matchedStudio = studiosByName.get(studioName.toLowerCase());
    if (matchedStudio) {
      return `<a href="${basePath}${getStudioUrl(matchedStudio)}">${escapeHtml(studioName)}</a>`;
    }
    return escapeHtml(studioName);
  }
  return '';
}

// Helper to get linked director HTML (uses entities, falls back to name matching, then plain text)
function getDirectorLink(film, basePath = '') {
  // First try entity relations
  if (film.directorEntities && film.directorEntities.length > 0) {
    return film.directorEntities.map(d => {
      const director = directorMap.get(d.id);
      if (director) {
        return `<a href="${basePath}${getDirectorUrl(director)}">${escapeHtml(d.name)}</a>`;
      }
      return escapeHtml(d.name);
    }).join(', ');
  }
  // Fall back to text field with name matching (handle comma-separated directors)
  if (film.director) {
    const directorNames = film.director.split(',').map(d => d.trim()).filter(d => d.length > 0);
    return directorNames.map(name => {
      const matchedDirector = directorsByName.get(name.toLowerCase());
      if (matchedDirector) {
        return `<a href="${basePath}${getDirectorUrl(matchedDirector)}">${escapeHtml(name)}</a>`;
      }
      return escapeHtml(name);
    }).join(', ');
  }
  return '';
}

// Generate sortable table headers and script for entity pages
function generateEntityTableSort() {
  return `<script>
(function(){
  const table=document.querySelector('.film-table');
  if(!table)return;
  const tbody=table.querySelector('tbody');
  const headers=table.querySelectorAll('th.sortable');
  let sortCol='year',sortDir='asc';

  function getVal(row,col){
    if(col==='year'){const t=row.querySelector('.table-year');return t?parseInt(t.textContent)||0:0;}
    if(col==='title'){const t=row.querySelector('.table-title');return t?t.textContent.toLowerCase():'';}
    return '';
  }

  function sortTable(){
    const rows=[...tbody.querySelectorAll('tr')];
    rows.sort((a,b)=>{
      const av=getVal(a,sortCol),bv=getVal(b,sortCol);
      let cmp=typeof av==='number'?av-bv:av.localeCompare(bv);
      return sortDir==='desc'?-cmp:cmp;
    });
    rows.forEach(r=>tbody.appendChild(r));
    headers.forEach(h=>{
      const ind=h.querySelector('.sort-indicator');
      if(h.dataset.col===sortCol){
        h.classList.add('active');
        if(ind)ind.textContent=sortDir==='asc'?'▲':'▼';
        h.setAttribute('aria-sort',sortDir==='asc'?'ascending':'descending');
      }else{
        h.classList.remove('active');
        if(ind)ind.textContent='⇅';
        h.setAttribute('aria-sort','none');
      }
    });
  }

  headers.forEach(h=>{
    const handle=()=>{
      const col=h.dataset.col;
      if(sortCol===col){sortDir=sortDir==='asc'?'desc':'asc';}
      else{sortCol=col;sortDir=col==='year'?'asc':'asc';}
      sortTable();
    };
    h.addEventListener('click',handle);
    h.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();handle();}
    });
  });
  sortTable();
})();
</script>`;
}

// Watch Links — uses structured arrays from fetch-watch-links.js via Watch Links (Linked) relation

/**
 * Notion 'Link Status' vocabulary, partitioned by what the UI should do.
 * Source of truth: collection://081a1b55-8709-423d-8320-fb977b9819e0
 * (confirmed live 2026-04-25). See scripts/lib/platform-trust.js.
 *
 *   WATCHABLE_STATUSES — render the primary "▶ WATCH" CTA. The link is
 *     verified live and (we believe) playable for any user clicking through.
 *
 *   GATED_STATUSES     — render a secondary "🔒 OPEN" CTA. URL resolves but
 *     requires login, region, or paid subscription. Still useful to users
 *     who have an account; honest about the gating.
 *
 *   HIDDEN_STATUSES    — never surface. Either confirmed broken or
 *     confirmed-not-in-catalog.
 *
 * Legacy 'Unverified' is treated as gated (not watchable) so the validator
 * has no incentive to leave entries in that intermediate state.
 */
const WATCHABLE_STATUSES = new Set(['Verified']);
const GATED_STATUSES     = new Set(['Restricted', 'Unverified']);
const HIDDEN_STATUSES    = new Set(['Broken', 'Unavailable', 'Dead', 'Redirect']);

function isWatchable(link) {
  return Boolean(link && link.url && WATCHABLE_STATUSES.has(link.status));
}
function isGated(link) {
  return Boolean(link && link.url && GATED_STATUSES.has(link.status));
}
function isVisible(link) {
  return isWatchable(link) || isGated(link);
}

/**
 * Check if a film has any visible (watchable OR gated) watch links.
 */
function hasWatchLinks(film) {
  if (!Array.isArray(film.watchLinks) || film.watchLinks.length === 0) return false;
  return film.watchLinks.some(isVisible);
}

/**
 * Pick the best watch link for a film. Preference order:
 *   1. First Watchable link (verified live).
 *   2. First Gated link (works if user has access).
 *   3. null.
 *
 * Returns the full link object — callers decide which fields to read.
 */
function getBestWatchLink(film) {
  if (!Array.isArray(film.watchLinks) || film.watchLinks.length === 0) return null;
  return film.watchLinks.find(isWatchable)
      || film.watchLinks.find(isGated)
      || null;
}

/**
 * Backwards-compat: most callers just want a URL string.
 * New callers that need to know whether the link is gated (to render a
 * lock icon / "Sign In" CTA) should use getBestWatchLink() directly.
 */
function getWatchUrl(film) {
  const link = getBestWatchLink(film);
  return link ? link.url : null;
}

/**
 * Watchable status semantics — disambiguating "playable" vs "surfacable".
 *
 *   isPlayable(film)   — at least one Watchable (Verified) link.
 *                        Use for stat counters that count "films a user
 *                        can stream right now without auth/region/sub".
 *
 *   isAccessible(film) — at least one Watchable OR Gated link.
 *                        Use for stat counters and filters that count
 *                        "films we can surface a button for at all".
 *
 * Until 2026-04-25 these were conflated in `hasWatchLinks(film)`, which
 * returned the Accessible-set semantic but was named ambiguously and
 * called from contexts that meant either thing. New code should pick
 * one explicitly. `hasWatchLinks` retained as alias for `isAccessible`
 * since most call sites mean "should we render a button at all".
 */
function isPlayable(film) {
  if (!Array.isArray(film.watchLinks) || film.watchLinks.length === 0) return false;
  return film.watchLinks.some(isWatchable);
}
function isAccessible(film) {
  return hasWatchLinks(film);  // alias — same semantics
}

/**
 * Single source of truth for the watch-cell rendering used in every
 * film table (homepage + country / decade / studio / director / series
 * pages). Centralizing this killed a class of drift bugs where each
 * page template had its own hand-typed copy of the watch-cell HTML
 * and only some of them were updated when the gated-status partition
 * shipped (2026-04-25 cross-page consistency audit).
 *
 * Variants:
 *   compact: false (default) — full "▶ WATCH" / "🔒 PLATFORM" with
 *            optional EN-subs badge. Used in main collection table.
 *   compact: true            — tight cell with only "▶" or lock icon.
 *            Used in entity-page tables (Studio / Director / Series)
 *            where width is tighter and the page context already tells
 *            the user what they're browsing.
 *
 * Returns the inner HTML for the <td class="watch-cell"> contents.
 * Callers wrap it in the <td> themselves.
 */
function renderWatchCell(film, { compact = false } = {}) {
  const link = getBestWatchLink(film);
  if (!link) return '<span class="no-link">—</span>';
  const gated = isGated(link);
  const lockSvg = gated
    ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>'
    : '';
  const cls = gated ? 'watch-btn watch-btn-gated' : 'watch-btn';
  let label;
  if (compact) {
    label = gated ? lockSvg : '▶';
  } else {
    label = gated
      ? `${lockSvg}<span class="watch-btn-platform">${escapeHtml((link.platform || 'OPEN').toUpperCase())}</span>`
      : '▶ WATCH';
  }
  const aria = gated
    ? `Open ${escapeHtml(film.titleEnglish || 'this film')} on ${escapeHtml(link.platform || 'platform')} — sign-in or subscription may be required (opens in new tab)`
    : `Watch ${escapeHtml(film.titleEnglish || 'this film')} (opens in new tab)`;
  const subs = (!compact && !gated && film.hasSubtitles) ? '<span class="subs-badge">EN subs</span>' : '';
  return `<a href="${escapeHtml(link.url)}" class="${cls}" target="_blank" rel="noopener" aria-label="${aria}">${label}</a>${subs}`;
}

/**
 * Generate the watch links section for a film detail page.
 */
function generateWatchLinksSection(film) {
  return generateWatchLinksHTML(film.watchLinks);
}

// Keyword categories for grouping in sidebar
const KEYWORD_CATEGORIES = {
  'Entities': ['Robots', 'AI', 'Aliens', 'Cyborgs', 'Androids', 'Monsters', 'Ghosts', 'Vampires', 'Zombies', 'Dragons'],
  'Settings': ['Space', 'Megacity', 'Dystopia', 'Utopia', 'Post-Apocalyptic', 'Underwater', 'Virtual Reality', 'Fantasy World'],
  'Concepts': ['Time Travel', 'Memory', 'Dreams', 'Identity', 'Consciousness', 'Evolution', 'Immortality', 'Parallel Worlds'],
  'Conflicts': ['War', 'Survival', 'Revolution', 'Invasion', 'Disaster', 'Pandemic', 'Class Struggle'],
  'Themes': ['Surveillance', 'Freedom', 'Love', 'Death', 'Nature', 'Technology', 'Religion', 'Politics', 'Family'],
  'Tone': ['Wordless', 'Surreal', 'Absurdist', 'Dark', 'Comedic', 'Philosophical', 'Experimental', 'Psychedelic'],
};

// Generate genre and keyword tags for film pages
function generateFilmTags(film) {
  const genres = film.genres || [];
  const keywords = film.keywords || [];

  if (genres.length === 0 && keywords.length === 0) return '';

  return `<div class="film-tags">
    ${genres.length > 0 ? `<div class="tag-section">
      <span class="tag-label">Genres</span>
      <div class="tag-list">
        ${genres.map(g => `<a href="../genres/${slugify(g)}.html" class="tag genre-tag">${escapeHtml(g)}</a>`).join('')}
      </div>
    </div>` : ''}
    ${keywords.length > 0 ? `<div class="tag-section">
      <span class="tag-label">Keywords</span>
      <div class="tag-list">
        ${keywords.map(k => `<a href="../keywords/${slugify(k)}.html" class="tag keyword-tag">${escapeHtml(k)}</a>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

// Generate linked entities section for film pages (Studio, Director, Series)
function generateLinkedEntities(film) {
  const parts = [];

  // Studio link (from relation or text field)
  if (film.studioEntities && film.studioEntities.length > 0) {
    const studioLinks = film.studioEntities.map(s => {
      const studio = studioMap.get(s.id);
      if (studio) {
        return `<a href="../${getStudioUrl(studio)}">${escapeHtml(s.name)}</a>`;
      }
      return escapeHtml(s.name);
    }).join(', ');
    parts.push(`<div class="meta-row"><span class="label">Studio:</span> ${studioLinks}</div>`);
  } else if (film.studio) {
    parts.push(`<div class="meta-row"><span class="label">Studio:</span> ${escapeHtml(film.studio)}</div>`);
  }

  // Director link (from relation or text field)
  if (film.directorEntities && film.directorEntities.length > 0) {
    const directorLinks = film.directorEntities.map(d => {
      const director = directorMap.get(d.id);
      if (director) {
        return `<a href="../${getDirectorUrl(director)}">${escapeHtml(d.name)}</a>`;
      }
      return escapeHtml(d.name);
    }).join(', ');
    parts.push(`<div class="meta-row"><span class="label">Director:</span> ${directorLinks}</div>`);
  }

  // Series link
  if (film.seriesEntities && film.seriesEntities.length > 0) {
    const seriesLinks = film.seriesEntities.map(s => {
      const series = seriesMap.get(s.id);
      if (series) {
        return `<a href="../${getSeriesUrl(series)}">${escapeHtml(s.name)}</a> <span class="series-type">(${escapeHtml(s.type || 'Series')})</span>`;
      }
      return escapeHtml(s.name);
    }).join(', ');
    parts.push(`<div class="meta-row"><span class="label">Part of:</span> ${seriesLinks}</div>`);
  }

  return parts.join('\n      ');
}

/// Generate footer with random film link
// pathPrefix: '' for root, '../' for sub-pages
function generateFooter(pathPrefix = '') {
  // For static pages, pick a random film at build time (changes daily with rebuilds)
  const randomFilm = films[Math.floor(Math.random() * films.length)];
  const randomUrl = pathPrefix + getFilmUrl(randomFilm);
  return `<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-links"><a href="${randomUrl}" class="footer-random">🎲 Random Film</a><a href="#report-form" target="_blank" class="footer-report">📝 Report broken link</a></div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer><button class="back-to-top" aria-label="Back to top">↑</button>`;
}

// Film of the Day: deterministic selection by calendar date.
//
// Selection runs both server-side (SSR pick at build time, for SEO and
// no-JS users) and client-side (rotates daily without a rebuild — see
// the FotD bootstrap block in generateJS()). Both sides use the same
// seed algorithm so the picks agree when the user's local date equals
// the build date.
//
// IMPORTANT: this seed depends on the *order* of `films` (or
// ALL_FILMS_DATA on the client). build-site.js sorts films by year-desc
// before passing to both the SSR call here and to buildFilmsIndexJs,
// which keeps the two arrays aligned. If you ever change one sort,
// change the other or the server/client picks will diverge on rebuild
// day. See test in scripts/lib/film-of-day-seed.test (TODO).
function dateSeed(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
function getFilmOfTheDay(filmList) {
  return filmList[dateSeed(new Date()) % filmList.length];
}
function todayLocalISO() {
  const t = new Date();
  return t.getFullYear() + '-' +
    String(t.getMonth() + 1).padStart(2, '0') + '-' +
    String(t.getDate()).padStart(2, '0');
}

function generateFilmOfTheDayCard(film) {
  const synopsis = film.synopsis ? (film.synopsis.length > 120 ? film.synopsis.substring(0, 117) + '...' : film.synopsis) : '';
  const techniques = film.technique?.join(', ') || 'Unknown';
  const buildDateISO = todayLocalISO();
  // Mount wrapper carries the SSR build date so the client bootstrap can
  // detect "today != build day" and swap in a fresh pick without a rebuild.
  // See generateJS() → "Film of the Day client rotation" block.
  return `
    <div id="film-of-day-mount" data-build-date="${buildDateISO}">
    <div class="film-of-day">
      <div class="film-of-day-header">
        <span class="film-of-day-label">Film of the Day</span>
        <span class="film-of-day-date">${buildDateISO}</span>
      </div>
      <div class="film-of-day-content">
        <div class="film-of-day-info">
          <a href="${getFilmUrl(film)}" class="film-of-day-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>
          <div class="film-of-day-meta">
            <span class="film-of-day-year">${film.year || '?'}</span>
            <span class="film-of-day-country">${getCountryCode(film.country)}</span>
            <span class="film-of-day-technique">${escapeHtml(techniques)}</span>
          </div>
          ${synopsis ? `<p class="film-of-day-synopsis">${escapeHtml(synopsis)}</p>` : ''}
        </div>
        <div class="film-of-day-actions">
          ${(() => {
            // Mirror the gated-aware logic the client-side rotation already
            // uses (rotateFilmOfDay in generateJS) so the SSR card on build
            // day doesn't lie about Restricted/Plex/Disney+ links.
            const link = getBestWatchLink(film);
            if (!link) return '';
            const lockSvg = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0;margin-right:4px"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>`;
            const gated = isGated(link);
            const cls = gated ? 'film-of-day-watch-btn film-of-day-watch-btn-gated' : 'film-of-day-watch-btn';
            const label = gated
              ? `${lockSvg}Open on ${escapeHtml(link.platform || 'platform')}`
              : `▶ Watch`;
            const aria = gated
              ? `Open ${escapeHtml(film.titleEnglish || 'Film of the Day')} on ${escapeHtml(link.platform || 'platform')} — sign-in or subscription may be required (opens in new tab)`
              : `Watch ${escapeHtml(film.titleEnglish || 'Film of the Day')} (opens in new tab)`;
            return `<a href="${escapeHtml(link.url)}" class="${cls}" target="_blank" rel="noopener" aria-label="${aria}">${label}</a>`;
          })()}
        </div>
      </div>
    </div>
    </div>`;
}

// Hash string to number for deterministic shuffling
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Seeded shuffle for deterministic results
function seededShuffle(array, seed) {
  const result = [...array];
  let currentSeed = seed;
  for (let i = result.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    const j = currentSeed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Get related films by category
function getRelatedFilms(currentFilm, allFilms, category, value, count = 5) {
  if (!value) return [];

  let matches;
  if (category === 'country') {
    matches = allFilms.filter(f => f.id !== currentFilm.id && f.country === value);
  } else if (category === 'decade') {
    matches = allFilms.filter(f => f.id !== currentFilm.id && f.year && Math.floor(f.year / 10) * 10 === value);
  } else if (category === 'technique') {
    matches = allFilms.filter(f => f.id !== currentFilm.id && f.technique?.[0] === value);
  } else if (category === 'director') {
    // value is the director name (string)
    const directorName = value.toLowerCase().trim();
    matches = allFilms.filter(f => {
      if (f.id === currentFilm.id) return false;
      // Check directorEntities
      if (f.directorEntities && f.directorEntities.some(d => d.name.toLowerCase().trim() === directorName)) return true;
      // Check director text field (comma-separated)
      if (f.director) {
        const directors = f.director.split(',').map(d => d.trim().toLowerCase());
        if (directors.includes(directorName)) return true;
      }
      return false;
    });
  } else {
    return [];
  }

  // Skip if fewer than 2 matches
  if (matches.length < 2) return [];

  // Deterministic shuffle based on current film ID
  const seed = hashString(currentFilm.id);
  return seededShuffle(matches, seed).slice(0, count);
}

// Generate related films section for a film detail page
function generateRelatedFilmsSection(film) {
  const sections = [];

  // More from Country
  if (film.country) {
    const countryFilms = getRelatedFilms(film, films, 'country', film.country, 5);
    if (countryFilms.length >= 2) {
      const totalCountry = films.filter(f => f.country === film.country).length;
      sections.push({
        title: `More from ${film.country}`,
        link: `../countries/${slugify(film.country)}.html`,
        count: totalCountry,
        films: countryFilms
      });
    }
  }

  // More from Decade
  if (film.year) {
    const decade = Math.floor(film.year / 10) * 10;
    const decadeFilms = getRelatedFilms(film, films, 'decade', decade, 5);
    if (decadeFilms.length >= 2) {
      const totalDecade = films.filter(f => f.year && Math.floor(f.year / 10) * 10 === decade).length;
      sections.push({
        title: `More from the ${decade}s`,
        link: `../decades/${decade}s.html`,
        count: totalDecade,
        films: decadeFilms
      });
    }
  }

  // More Technique
  const primaryTechnique = film.technique?.[0];
  if (primaryTechnique) {
    const techniqueFilms = getRelatedFilms(film, films, 'technique', primaryTechnique, 5);
    if (techniqueFilms.length >= 2) {
      const totalTechnique = films.filter(f => f.technique?.[0] === primaryTechnique).length;
      sections.push({
        title: `More ${primaryTechnique}`,
        link: `../techniques/${slugify(primaryTechnique)}.html`,
        count: totalTechnique,
        films: techniqueFilms
      });
    }
  }

  // More from Series/Universe (if film is part of one)
  if (film.seriesEntities && film.seriesEntities.length > 0) {
    const seriesEntity = film.seriesEntities[0];
    const series = seriesMap.get(seriesEntity.id);
    if (series) {
      const seriesFilms = films.filter(f =>
        f.id !== film.id &&
        f.seriesEntities?.some(s => s.id === seriesEntity.id)
      ).slice(0, 5);
      if (seriesFilms.length >= 1) {
        const totalSeries = films.filter(f => f.seriesEntities?.some(s => s.id === seriesEntity.id)).length;
        sections.unshift({ // Add at beginning since it's most relevant
          title: `More from ${seriesEntity.name}`,
          link: `../${getSeriesUrl(series)}`,
          count: totalSeries,
          films: seriesFilms
        });
      }
    }
  }

  // More by Director
  const primaryDirector = film.directorEntities?.[0]?.name || (film.director ? film.director.split(',')[0].trim() : null);
  if (primaryDirector) {
    const directorFilms = getRelatedFilms(film, films, 'director', primaryDirector, 5);
    if (directorFilms.length >= 2) {
      // Get total films by this director
      const directorNameLower = primaryDirector.toLowerCase();
      const totalDirector = films.filter(f =>
        (f.directorEntities && f.directorEntities.some(d => d.name.toLowerCase() === directorNameLower)) ||
        (f.director && f.director.split(',').map(d => d.trim().toLowerCase()).includes(directorNameLower))
      ).length;

      // Try to get director entity for linking
      const directorEntity = film.directorEntities?.[0] ? directorMap.get(film.directorEntities[0].id) : directorsByName.get(directorNameLower);
      const directorLink = directorEntity ? `../${getDirectorUrl(directorEntity)}` : `../directors/index.html`;

      sections.unshift({ // Add near beginning since it's highly relevant
        title: `More by ${primaryDirector}`,
        link: directorLink,
        count: totalDirector,
        films: directorFilms
      });
    }
  }

  if (sections.length === 0) return '';

  // Render up to N sections inline; fold the rest into a <details>
  // expander. The unshift() calls above already prioritized Director and
  // Series at positions 0-1; the natural order is then Country → Decade
  // → Technique. Decade + Technique are the most generic ("more films
  // from the 1980s"), so they're the right candidates to fold.
  const PRIMARY_LIMIT = 3;
  const primary = sections.slice(0, PRIMARY_LIMIT);
  const extra = sections.slice(PRIMARY_LIMIT);

  const renderSection = (section) => `
    <div class="related-section">
      <h3 class="related-header">
        <a href="${section.link}">${escapeHtml(section.title)}</a>
        <span class="related-count">${section.count} films →</span>
      </h3>
      <div class="related-grid">
        ${section.films.map(f => {
          const link = getBestWatchLink(f);
          // Indicator honesty: only show ▶ for verified-watchable films;
          // gated films get a small lock so users aren't lured into
          // expecting playback. Hidden links get nothing.
          const indicator = link
            ? (isGated(link)
              ? '<svg class="related-watch related-watch-gated" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>'
              : '<span class="related-watch" aria-hidden="true">▶</span>')
            : '';
          return `
        <a href="${getFilmFilename(f)}" class="related-card">
          <span class="related-title">${escapeHtml(f.titleEnglish) || 'Untitled'}</span>
          <span class="related-meta">${f.year || '?'}${f.director ? ` · ${escapeHtml(f.director.split(',')[0].trim())}` : ''}</span>
          ${indicator}
        </a>`;
        }).join('')}
      </div>
    </div>`;

  const extraHtml = extra.length > 0
    ? `<details class="related-extra">
        <summary class="related-extra-summary">+ More like this (${extra.length} more way${extra.length > 1 ? 's' : ''} to browse)</summary>
        ${extra.map(renderSection).join('')}
      </details>`
    : '';

  return `
  <section class="related-films">
    ${primary.map(renderSection).join('')}
    ${extraHtml}
  </section>`;
}

function generateTableRows(filmList, basePath = '') {
  return filmList.map(film => {
    const directorHtml = getDirectorLink(film, basePath);
    const studioHtml = getStudioLink(film, basePath);
    return `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${isAccessible(film) ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}" data-director="${escapeHtml(film.director || '')}">
      <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
      <td><a href="${getFilmUrl(film, basePath)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${directorHtml ? `<strong>${directorHtml}</strong><br>` : ''}${studioHtml}</td>
      <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td class="table-runtime hide-mobile">${escapeHtml(film.runtime) || '—'}</td>
      <td class="hide-mobile"><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${renderWatchCell(film)}</td>
    </tr>`;
  }).join('\n');
}

function generateFilterItems(items, type) {
  return items.slice(0, 25).map(item => {
    const value = escapeHtml(item.name || item.decade?.toString());
    const displayName = escapeHtml(item.name || `${item.decade}s`);
    return `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${value}" role="option">
      <span class="name">${displayName}</span><span class="count">${item.count}</span>
    </div>`;
  }).join('\n');
}

// JSON-LD structured data for the collection
function generateCollectionJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Global Animation Archive",
    "description": "A comprehensive database of animated films from around the world, documenting the art of animation from every corner of the globe.",
    "url": SITE_URL,
    "numberOfItems": stats.total,
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  });
}

// JSON-LD structured data for individual films
function generateFilmJsonLd(film) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": film.titleEnglish || 'Untitled',
    "url": `${SITE_URL}/${getFilmUrl(film)}`,
    "datePublished": film.year ? `${film.year}` : undefined,
    "countryOfOrigin": film.country ? { "@type": "Country", "name": film.country } : undefined,
    "description": film.synopsis || `${film.titleEnglish || 'Animated film'} (${film.year || 'Year unknown'}) from ${film.country || 'Unknown country'}`,
    "genre": "Animation"
  };
  if (film.director) data.director = { "@type": "Person", "name": film.director };
  if (film.studio) data.productionCompany = { "@type": "Organization", "name": film.studio };
  if (film.runtime) data.duration = film.runtime;
  if (film.originalTitle) data.alternateName = film.originalTitle;
  // Clean undefined values
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
  return JSON.stringify(data);
}

function generateIndexPage() {
  // Sort so current/past films come first (year desc), future films go to end
  const currentYear = new Date().getFullYear();
  const sortedFilms = [...films].sort((a, b) => {
    const aFuture = (a.year || 0) > currentYear ? 1 : 0;
    const bFuture = (b.year || 0) > currentYear ? 1 : 0;
    if (aFuture !== bFuture) return aFuture - bFuture;
    return (b.year || 0) - (a.year || 0);
  });
  const initialFilms = sortedFilms.slice(0, FILMS_PER_PAGE);
  const hasMore = sortedFilms.length > FILMS_PER_PAGE;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Global Animation Archive — World Animation Database</title>
<meta name="description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries. A comprehensive database documenting the art of animation from every corner of the world.">
<meta name="keywords" content="animation, animated films, world cinema, film database, international animation, stop motion, hand-drawn animation">
<link rel="canonical" href="${SITE_URL}/">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Global Animation Archive">
<meta property="og:description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries. Documenting the art of animation from every corner of the world.">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Global Animation Archive">
<meta name="twitter:description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries.">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateCollectionJsonLd()}</script>

${FONT_HEAD}
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span>EST. 2024</span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1><p class="masthead-subtitle">Documenting the art of animation from every corner of the world</p></div>
</header>
<div class="stats-bar" role="region" aria-label="Archive statistics">
  <div class="stat-block"><span class="stat-label">Films</span><span class="stat-value">${stats.total.toLocaleString()}</span></div>
  <div class="stat-block"><span class="stat-label">Countries</span><span class="stat-value">${Object.keys(stats.countries).length}</span></div>
  <div class="stat-block"><span class="stat-label">Techniques</span><span class="stat-value">${Object.keys(stats.techniques).length}</span></div>
  <div class="stat-block"><span class="stat-label">Watchable</span><span class="stat-value">${stats.watchable.toLocaleString()}</span></div>
</div>
<nav class="main-nav" aria-label="Main navigation"><a href="index.html" class="active" aria-current="page">Collection</a><a href="countries/">Countries</a><a href="techniques/">Techniques</a><a href="studios/">Studios</a><a href="directors/">Directors</a><a href="series/">Series</a><a href="decades/">Decades</a><a href="platforms/">Platforms</a><a href="#about">About</a></nav>
<div class="main-layout">
  <aside class="sidebar" role="complementary" aria-label="Browse and filter">
    <button class="drawer-close-bar" id="drawer-close" aria-label="Close filters">DONE</button>
    <div class="sidebar-group">
      <div class="sidebar-group-header">Browse</div>
      <nav class="browse-nav" aria-label="Browse sections">
        <a href="countries/" class="browse-link"><span class="browse-arrow">→</span> Countries <span class="count">${Object.keys(stats.countries).length}</span></a>
        <a href="techniques/" class="browse-link"><span class="browse-arrow">→</span> Techniques <span class="count">${Object.keys(stats.techniques).length}</span></a>
        <a href="studios/" class="browse-link"><span class="browse-arrow">→</span> Studios <span class="count">${stats.studioCount || studios.length}</span></a>
        <a href="directors/" class="browse-link"><span class="browse-arrow">→</span> Directors <span class="count">${stats.directorCount || directorsData.length || 547}</span></a>
        <a href="series/" class="browse-link"><span class="browse-arrow">→</span> Series <span class="count">${stats.seriesCount || seriesData.length}</span></a>
        <a href="decades/" class="browse-link"><span class="browse-arrow">→</span> Decades <span class="count">${stats.decadesSorted.length}</span></a>
        <a href="platforms/" class="browse-link"><span class="browse-arrow">→</span> Platforms <span class="count">${stats.platformsSorted.length}</span></a>
      </nav>
    </div>
    <div class="sidebar-group">
      <div class="sidebar-group-header">Filter</div>
      <div class="query-display" id="active-query" style="display:none;"><div class="query-label">Active Filters</div><div class="query-tags" id="query-tags"></div></div>
      <div class="sidebar-section"><div class="sidebar-header">Format</div><div class="filter-list" role="listbox" aria-label="Filter by format">
        <div class="filter-item" data-filter-type="format" data-filter-value="Feature" role="option"><span class="name">Feature</span><span class="count">${stats.formats.Feature || 0}</span></div>
        <div class="filter-item" data-filter-type="format" data-filter-value="Short" role="option"><span class="name">Short</span><span class="count">${stats.formats.Short || 0}</span></div>
        <div class="filter-item" data-filter-type="format" data-filter-value="Series" role="option"><span class="name">Series</span><span class="count">${stats.formats.Series || 0}</span></div>
      </div></div>
      <div class="sidebar-section"><div class="sidebar-header">Country <span class="count">${Object.keys(stats.countries).length}</span></div><div class="filter-list" role="listbox" aria-label="Filter by country">${generateFilterItems(stats.countriesSorted, 'country')}</div></div>
      <div class="sidebar-section"><div class="sidebar-header">Technique <span class="count">${Object.keys(stats.techniques).length}</span></div><div class="filter-list" role="listbox" aria-label="Filter by technique">${generateFilterItems(stats.techniquesSorted, 'technique')}</div></div>
      <div class="sidebar-section"><div class="sidebar-header">Era</div><div class="filter-list" role="listbox" aria-label="Filter by decade">${generateFilterItems(stats.decadesSorted.map(d => ({ name: `${d.decade}–${d.decade + 9}`, count: d.count, decade: d.decade })), 'decade')}</div></div>
      <div class="sidebar-section"><div class="sidebar-header">Watch Status</div><div class="filter-list" role="listbox" aria-label="Filter by watch status">
        <div class="filter-item" data-filter-type="watchable" data-filter-value="true" role="option"><span class="name">Has Watch Link</span><span class="count">${stats.watchable}</span></div>
        <div class="filter-item" data-filter-type="subtitles" data-filter-value="true" role="option"><span class="name">EN Subtitles</span><span class="count">${stats.withSubtitles}</span></div>
      </div></div>
      ${stats.platformsSorted && stats.platformsSorted.length > 0 ? `<div class="sidebar-section collapsible"><div class="sidebar-header collapsible-header" data-collapsed="false" role="button" tabindex="0" aria-expanded="true" aria-controls="filter-platform-list">Platform <span class="count">${stats.platformsSorted.length}</span> <span class="collapse-icon" aria-hidden="true">▼</span></div><div id="filter-platform-list" class="filter-list collapsible-content" role="listbox" aria-label="Filter by streaming platform">${generateFilterItems(stats.platformsSorted, 'platform')}</div></div>` : ''}
      ${stats.genresSorted && stats.genresSorted.length > 0 ? `<div class="sidebar-section collapsible"><div class="sidebar-header collapsible-header" data-collapsed="false" role="button" tabindex="0" aria-expanded="true" aria-controls="filter-genre-list">Genre <span class="count">${stats.genresSorted.length}</span> <span class="collapse-icon" aria-hidden="true">▼</span></div><div id="filter-genre-list" class="filter-list collapsible-content" role="listbox" aria-label="Filter by genre">${generateFilterItems(stats.genresSorted, 'genre')}</div></div>` : ''}
      ${stats.keywordsSorted && stats.keywordsSorted.length > 0 ? `<div class="sidebar-section collapsible"><div class="sidebar-header collapsible-header" data-collapsed="true" role="button" tabindex="0" aria-expanded="false" aria-controls="filter-keyword-list">Keywords <span class="count">${stats.keywordsSorted.length}</span> <span class="collapse-icon" aria-hidden="true">▶</span></div><div id="filter-keyword-list" class="filter-list collapsible-content collapsed" role="listbox" aria-label="Filter by keyword">${generateFilterItems(stats.keywordsSorted.slice(0, 50), 'keyword')}</div></div>` : ''}
    </div>
  </aside>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <main class="content" id="main-content">
    <div class="content-header"><div><h2 class="content-title">From the Collection</h2><span class="content-meta" id="results-count">${stats.total.toLocaleString()} films</span></div><div class="search-actions"><div class="search-box"><label for="search-input" class="visually-hidden">Search films</label><input type="text" id="search-input" placeholder="Search titles, directors..." aria-describedby="results-count" /></div><button class="mobile-filter-toggle" id="mobile-filter-toggle" aria-label="Open filters">FILTERS</button><button id="random-film-btn" class="random-btn" aria-label="Go to random film">🎲 Random</button></div><div class="keyboard-hints"><kbd>/</kbd> search <kbd>r</kbd> random <kbd>esc</kbd> clear</div></div>
    <div class="active-filters-bar" id="active-filters-bar"><span class="active-filters-label">Filtered:</span></div>
    ${generateFilmOfTheDayCard(getFilmOfTheDay(sortedFilms))}
    <div class="table-wrapper"><table class="film-table"><thead><tr><th scope="col" style="width:90px" class="sortable active" data-sort="year" tabindex="0" aria-sort="descending">Year <span class="sort-indicator" aria-hidden="true">▼</span></th><th scope="col" class="sortable" data-sort="title" tabindex="0" aria-sort="none">Title <span class="sort-indicator" aria-hidden="true"></span></th><th scope="col">Director / Studio</th><th scope="col" style="width:100px" class="sortable hide-mobile" data-sort="technique" tabindex="0" aria-sort="none">Technique <span class="sort-indicator" aria-hidden="true"></span></th><th scope="col" style="width:70px" class="hide-mobile">Runtime</th><th scope="col" style="width:90px" class="hide-mobile">Confidence</th><th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th></tr></thead><tbody id="film-tbody">${generateTableRows(initialFilms)}</tbody></table></div>
    <div id="no-results" class="no-results" style="display:none"><h3 class="no-results-title">No films match your criteria</h3><p class="no-results-message" id="no-results-detail">Try adjusting your search or filters.</p><button id="clear-all-btn" class="clear-all-btn" style="display:none">Clear All Filters</button></div>
    ${hasMore ? `<div class="load-more-container"><button id="load-more-btn" class="load-more-btn" data-loaded="${FILMS_PER_PAGE}" data-total="${sortedFilms.length}">Load More <span class="load-more-count">(${sortedFilms.length - FILMS_PER_PAGE} remaining)</span></button></div>` : ''}
  </main>
</div>
<section class="about-section" id="about">
  <div class="about-inner">
    <div class="about-text"><h2>World animation,<br><em>made accessible</em></h2><p>Most film databases are Western-centric. This archive documents the full breadth of world animation—with verified watch links and scholarly documentation.</p></div>
    <div class="about-data"><div class="about-data-title">Archive Statistics</div>
      <div class="about-stat-row"><span class="about-stat-label">Films Catalogued</span><span class="about-stat-value">${stats.total.toLocaleString()}</span></div>
      <div class="about-stat-row"><span class="about-stat-label">Countries</span><span class="about-stat-value">${Object.keys(stats.countries).length}</span></div>
      <div class="about-stat-row"><span class="about-stat-label">Watchable</span><span class="about-stat-value">${stats.watchable.toLocaleString()}</span></div>
      <div class="about-stat-row"><span class="about-stat-label">EN Subtitles</span><span class="about-stat-value">${stats.withSubtitles.toLocaleString()}</span></div>
    </div>
  </div>
</section>
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><a href="#" class="footer-random" id="footer-random-link">🎲 Random</a><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
<button class="back-to-top" aria-label="Back to top">↑</button>
<script>window.__CATALOG_URL=${JSON.stringify('/' + ASSET_URLS.filmsIndex)}</script>
<script src="${ASSET_URLS.app}" defer></script>
<!-- Catalog (films-index.js, ~280KB gz) is now lazy-loaded by app.js on
     first interaction or after 2s of idle — see ensureCatalog() in
     generateJS(). Most homepage visitors browse the SSR'd 50 rows and
     click into a film without needing the catalog at all. -->
</body></html>`;
}

/**
 * Batch D: Performance split.
 *
 * The film catalog used to ride inline inside index.html (~2.1MB of JSON
 * bloating every HTML response with max-age=0). We now emit it as a
 * standalone films-index.js that:
 *
 *   1. Is served with its own cache policy (1h must-revalidate), so repeat
 *      visits revalidate fast without re-downloading the catalog on every
 *      HTML response.
 *   2. Ships a trimmed watchLinks schema (only url / platform / status —
 *      the three fields app.js actually reads), cutting the payload ~31%.
 *   3. Loads with `defer`, so the initial 50 server-rendered rows paint
 *      before the script even parses.
 *
 * Kept as window globals so app.js needs no compat shim.
 */
function buildFilmsIndexJs(sortedFilms, studios, directorsData) {
  const slimFilms = sortedFilms.map(f => ({
    // Truncated to 8 chars (2026-04-26 perf trim): the only consumer of
    // this id on the client is URL construction (`films/{slug}-{id8}.html`),
    // and inequality dedup checks like `f.id !== currentFilm.id` work as
    // long as both sides come from the slim catalog (both 8 chars).
    // Saves ~63 KB raw / ~16 KB gzipped vs full UUIDs.
    id: f.id.slice(0, 8),
    title: f.titleEnglish,
    original: f.originalTitle,
    year: f.year,
    country: f.country,
    director: f.director,
    studio: f.studio,
    technique: f.technique,
    format: f.format,
    runtime: f.runtime,
    confidence: f.confidence,
    // Trim watchLinks to just the fields app.js reads. Preserves the
    // {url, platform, status} shape so renderRow / platform filter /
    // watchable filter / watch button all keep working unchanged.
    watchLinks: Array.isArray(f.watchLinks)
      ? f.watchLinks.map(l => ({ url: l.url, platform: l.platform, status: l.status }))
      : [],
    hasSubtitles: f.hasSubtitles,
    genres: f.genres || []
    // keywords lazy-loaded 2026-04-26 (perf trim): pulled out of the slim
    // catalog (~111 KB raw / ~30 KB gz off the critical path) and emitted
    // as ./dist/keywords-index.json. Client fetches it on first need
    // (search keystroke or keyword-filter activation) — see loadKeywords()
    // in generateJS. ~80% of users never trigger that path.
    // studioEntities / directorEntities dropped 2026-04-26 (perf trim):
    // ~339 KB raw / ~85 KB gz saved. Client-side getDirectorLinks /
    // getStudioLinks already have a name-lookup fallback against
    // STUDIOS_DATA / DIRECTORS_DATA, which handles every director/studio
    // with a unique name (~99% of the catalog). Risk: same-named
    // directors (~5-10 in audit-report.json) get the wrong entity link.
    // Server-side templates (renderRow, related films, entity pages)
    // continue using the full film object via the `films` module-level
    // variable and are unaffected.
  }));

  const slimStudios = studios.map(s => ({
    id: s.id,
    name: s.name,
    slug: slugify(s.name) + '-' + s.id.slice(0, 8)
  }));

  const slimDirectors = directorsData.map(d => ({
    id: d.id,
    name: d.name,
    slug: slugify(d.name) + '-' + d.id.slice(0, 8)
  }));

  return `/* Global Animation Archive — client catalog. Generated ${BUILD_DATE}. */
window.ALL_FILMS_DATA=${JSON.stringify(slimFilms)};
window.STUDIOS_DATA=${JSON.stringify(slimStudios)};
window.DIRECTORS_DATA=${JSON.stringify(slimDirectors)};
`;
}

function generateFilmPage(film) {
  const techniques = film.technique?.join(', ') || 'Unknown';
  const specs = [film.format, film.color, film.sound].filter(Boolean).join(' · ');
  const description = film.synopsis || `${film.titleEnglish || 'Animated film'} (${film.year || 'Year unknown'}) - ${techniques} animation from ${film.country || 'Unknown country'}`;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'}) — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description.substring(0, 160))}">
<link rel="canonical" href="${SITE_URL}/${getFilmUrl(film)}">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="video.movie">
<meta property="og:title" content="${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'})">
<meta property="og:description" content="${escapeHtml(description.substring(0, 200))}">
<meta property="og:url" content="${SITE_URL}/${getFilmUrl(film)}">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:image" content="${OG_IMAGE}">
${film.year ? `<meta property="video:release_date" content="${film.year}">` : ''}

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'})">
<meta name="twitter:description" content="${escapeHtml(description.substring(0, 200))}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateFilmJsonLd(film)}</script>

${FONT_HEAD}
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
  { label: 'Films', url: 'index.html' },
  { label: escapeHtml(film.titleEnglish || 'Untitled') }
], '../')}
<main class="detail-page" id="main-content">
  <article>
  <div class="detail-header">
    <div class="detail-year-block"><div class="detail-year">${film.year || '?'}</div><div class="detail-country">${getCountryCode(film.country)}</div></div>
    <div class="detail-title-section">
      <div class="detail-technique">${escapeHtml(techniques.toUpperCase())}</div>
      <h1 class="detail-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</h1>
      ${film.originalTitle ? `<div class="detail-original" lang="und">${escapeHtml(film.originalTitle)}</div>` : ''}
      <div class="detail-credits">${getDirectorLink(film, '../') ? `Directed by <strong>${getDirectorLink(film, '../')}</strong><br>` : ''}${getStudioLink(film, '../') ? `Produced by <strong>${getStudioLink(film, '../')}</strong>` : ''}${film.runtime ? ` · ${escapeHtml(film.runtime)}` : ''}</div>
    </div>
    <div class="detail-actions">${(() => {
      // Gated-aware CTA: same partitioning as renderRow (build-site.js
      // WATCHABLE_STATUSES / GATED_STATUSES) so a Restricted Plex link
      // doesn't render as a verified-playback "▶ WATCH NOW" promise.
      // Inline lock SVG to dodge cross-OS emoji rendering inconsistency.
      const link = getBestWatchLink(film);
      if (!link) {
        return `<a href="#report-form" class="detail-suggest-link" aria-label="Help us find a watch link for ${escapeHtml(film.titleEnglish || 'this film')}">Help us find a watch link →</a>`;
      }
      const lockSvg = `<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0;margin-right:6px"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>`;
      const gated = isGated(link);
      const cls = gated ? 'detail-watch-btn detail-watch-btn-gated' : 'detail-watch-btn';
      const label = gated
        ? `${lockSvg}OPEN ON ${escapeHtml((link.platform || 'PLATFORM').toUpperCase())}`
        : `▶ WATCH NOW`;
      const aria = gated
        ? `Open ${escapeHtml(film.titleEnglish || 'this film')} on ${escapeHtml(link.platform || 'platform')} — sign-in or subscription may be required (opens in new tab)`
        : `Watch ${escapeHtml(film.titleEnglish || 'this film')} (opens in new tab)`;
      const subs = (!gated && film.hasSubtitles) ? '<span class="detail-subs">EN SUBTITLES AVAILABLE</span>' : '';
      return `<a href="${escapeHtml(link.url)}" class="${cls}" target="_blank" rel="noopener" aria-label="${aria}">${label}</a>${subs}`;
    })()}</div>
  </div>
  <div class="detail-body">
    <div class="detail-content">
      ${/* Watch links lifted above the prose 2026-04-25 — primary user
            intent on a film page is "where can I watch this", not
            "tell me about it". The card has its own visual treatment
            (cream box, crimson left border) so it doesn't disrupt the
            editorial rhythm of the prose sections below. */ ''}
      ${generateWatchLinksSection(film)}
      ${film.synopsis ? `<h2>Synopsis</h2><p>${escapeHtml(film.synopsis)}</p>` : ''}
      ${film.historicalContext ? `<h2>Historical Context</h2><p>${escapeHtml(film.historicalContext)}</p>` : ''}
      ${film.keyCredits ? `<h2>Key Credits</h2><p>${escapeHtml(film.keyCredits)}</p>` : ''}
      ${film.notes ? `<h2>Notes</h2><p>${escapeHtml(film.notes)}</p>` : ''}
      ${film.researchSources ? `<div class="research-sources"><h2>Research Sources</h2><p class="sources-list">${escapeHtml(film.researchSources).split(',').map(s => s.trim()).filter(s => s).join(' · ')}</p></div>` : ''}
      ${!film.synopsis && !film.historicalContext && !film.keyCredits && !film.notes ? '<div class="empty-state"><p class="empty-state-message">No detailed information available yet.</p><a href="#report-form" class="empty-state-cta">Help us add details for this film →</a></div>' : ''}
      ${generateFilmTags(film)}
    </div>
    <aside class="detail-data-panel" aria-label="Film metadata">
      <div class="data-panel-title">Film Data</div>
      <dl class="data-list">
      <div class="data-row"><dt class="data-label">Technique</dt><dd class="data-value">${escapeHtml(techniques)}</dd></div>
      <div class="data-row"><dt class="data-label">Format</dt><dd class="data-value">${escapeHtml(specs) || '—'}</dd></div>
      ${film.studioEntities && film.studioEntities.length > 0 ? `<div class="data-row"><dt class="data-label">Studio</dt><dd class="data-value">${film.studioEntities.map(s => { const studio = studioMap.get(s.id); return studio ? `<a href="../${getStudioUrl(studio)}">${escapeHtml(s.name)}</a>` : escapeHtml(s.name); }).join(', ')}</dd></div>` : film.studio ? `<div class="data-row"><dt class="data-label">Studio</dt><dd class="data-value">${escapeHtml(film.studio)}</dd></div>` : ''}
      ${film.directorEntities && film.directorEntities.length > 0 ? `<div class="data-row"><dt class="data-label">Director</dt><dd class="data-value">${film.directorEntities.map(d => { const director = directorMap.get(d.id); return director ? `<a href="../${getDirectorUrl(director)}">${escapeHtml(d.name)}</a>` : escapeHtml(d.name); }).join(', ')}</dd></div>` : ''}
      ${film.seriesEntities && film.seriesEntities.length > 0 ? `<div class="data-row"><dt class="data-label">Part of</dt><dd class="data-value">${film.seriesEntities.map(s => { const series = seriesMap.get(s.id); return series ? `<a href="../${getSeriesUrl(series)}">${escapeHtml(s.name)}</a>` : escapeHtml(s.name); }).join(', ')}</dd></div>` : ''}
      ${film.sourceMaterial ? `<div class="data-row"><dt class="data-label">Source</dt><dd class="data-value">${escapeHtml(film.sourceMaterial)}</dd></div>` : ''}
      ${film.runtime ? `<div class="data-row"><dt class="data-label">Runtime</dt><dd class="data-value">${escapeHtml(film.runtime)}</dd></div>` : ''}
      <div class="data-row"><dt class="data-label">Confidence</dt><dd class="data-value confidence-pips">${confidenceToPips(film.confidence)}</dd></div>
      <div class="data-row"><dt class="data-label">Updated</dt><dd class="data-value">${film.lastUpdated?.split('T')[0] || '—'}</dd></div>
      </dl>
      ${(() => { const imdb = getValidUrl(film.imdb); const letterboxd = getValidUrl(film.letterboxd); const wikipedia = getValidUrl(film.wikipedia); return (imdb || letterboxd || wikipedia) ? `<nav class="data-links" aria-label="External links">${imdb ? `<a href="${escapeHtml(imdb)}" class="data-link" target="_blank" rel="noopener">IMDb</a>` : ''}${letterboxd ? `<a href="${escapeHtml(letterboxd)}" class="data-link" target="_blank" rel="noopener">Letterboxd</a>` : ''}${wikipedia ? `<a href="${escapeHtml(wikipedia)}" class="data-link" target="_blank" rel="noopener">Wikipedia</a>` : ''}</nav>` : ''; })()}
    </aside>
  </div>
  </article>
  ${generateRelatedFilmsSection(film)}
</main>
${generateFooter('../')}
</body></html>`;
}

function generateCSS() {
  return `*{margin:0;padding:0;box-sizing:border-box}:root{--cream:#f8f6f1;--cream-dark:#eae6dd;--paper:#fffef9;--ink:#1c1917;--ink-light:#44403c;--ink-muted:#6b655e;--ink-faint:#6b6660;--rule:#d6d3d1;--rule-dark:#a8a29e;--accent:#9f1239;--data-bg:#f3f1ec;--mono:'JetBrains Mono',monospace;
/* Type scale — three semantic title roles. New page templates should use
   these tokens instead of inventing px values. Existing selectors that
   pre-date the tokens are migrated incrementally; one-off sizes
   (.decade-name 56px display, .film-of-day-title 22px, .masthead-title 36px)
   stay because they're intentional editorial choices. */
--type-page-hero:42px;     /* top-of-page entity name (country, director, studio, series, tag, error) */
--type-section-hero:22px;  /* h2-equivalent within content */
--type-card-hero:18px;     /* card title in a grid of cards (country-card, entity-card, director-card, related) */
}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--ink);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}a{color:inherit}.skip-link{position:absolute;top:-40px;left:0;background:var(--ink);color:var(--cream);padding:8px 16px;z-index:1000;font-family:var(--mono);font-size:12px;text-decoration:none}.skip-link:focus{top:0}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.masthead{background:var(--paper);border-bottom:1px solid var(--rule)}.masthead-top{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.masthead-main{text-align:center;padding:28px 32px 24px}.masthead-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;letter-spacing:.02em;margin-bottom:4px}.masthead-subtitle{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.stats-bar{background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:11px;display:flex}.stat-block{flex:1;padding:8px 20px;border-right:1px solid rgba(255,255,255,.15);display:flex;justify-content:space-between;align-items:baseline;gap:12px}.stat-block:last-child{border-right:none}.stat-label{opacity:.6;text-transform:uppercase;letter-spacing:.1em;font-size:10px}.stat-value{font-size:13px;font-weight:600}.main-nav{display:flex;justify-content:center;gap:40px;padding:14px 32px;background:var(--cream);border-bottom:2px solid var(--ink)}.main-nav a{font-size:11px;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;color:var(--ink-light);font-weight:500;transition:color .2s}.main-nav a:hover,.main-nav a.active{color:var(--accent)}.main-layout{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 200px)}.sidebar{background:var(--paper);border-right:1px solid var(--rule);font-family:var(--mono);font-size:12px}.sidebar-group{border-bottom:1px solid var(--rule)}.sidebar-group-header{padding:12px 16px;background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:600}.browse-nav{display:flex;flex-direction:column}.browse-link{display:flex;align-items:center;padding:12px 16px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:12px;color:var(--ink-light);text-decoration:none;border-bottom:1px solid var(--rule);transition:background .15s,color .15s}.browse-link:last-child{border-bottom:none}.browse-link:hover{background:var(--cream);color:var(--accent)}.browse-link:focus{outline:2px solid var(--accent);outline-offset:-2px;color:var(--accent)}.browse-arrow{margin-right:8px;color:var(--ink-faint)}.browse-link:hover .browse-arrow{color:var(--accent)}.browse-link .count{margin-left:auto;color:var(--ink-faint);font-size:11px}.sidebar-section{border-bottom:1px solid var(--rule)}.sidebar-header{padding:12px 16px;background:var(--data-bg);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);display:flex;justify-content:space-between;border-bottom:1px solid var(--rule)}.query-display{padding:16px;background:var(--cream-dark);border-bottom:1px solid var(--rule)}.query-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;font-weight:600}.query-tags{display:flex;flex-wrap:wrap;gap:6px}.query-tag{background:var(--paper);border:1px solid var(--rule);padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:8px}.query-tag .remove{color:var(--ink-faint);cursor:pointer;font-size:14px}.query-tag .remove:hover{color:var(--accent)}.filter-list{max-height:200px;overflow-y:auto}.filter-item{display:flex;justify-content:space-between;align-items:center;min-height:44px;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent}.filter-item:hover{background:var(--cream);border-left-color:var(--rule-dark)}.filter-item:focus{outline:2px solid var(--accent);outline-offset:-2px}.filter-item.active{background:var(--cream);border-left-color:var(--accent)}.filter-item .name{color:var(--ink-light)}.filter-item.active .name{color:var(--ink);font-weight:500}.filter-item .count{color:var(--ink-faint)}.content{background:var(--cream)}.content-header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;border-bottom:1px solid var(--rule);background:var(--paper)}.content-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:400}.content-meta{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.search-box input{padding:10px 16px;border:1px solid var(--rule);background:var(--cream);font-family:var(--mono);font-size:12px;width:280px}.search-box input:focus{outline:2px solid var(--accent);outline-offset:-2px;border-color:var(--ink)}.table-wrapper{overflow-x:auto}.film-table{width:100%;border-collapse:collapse;font-size:13px}.film-table thead{position:sticky;top:0;z-index:10;transition:box-shadow .2s}.film-table thead.is-sticky{box-shadow:0 2px 8px rgba(0,0,0,.1)}.film-table th{background:var(--data-bg);padding:12px 16px;text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);border-bottom:2px solid var(--rule-dark);font-weight:600}.film-table td{padding:16px;border-bottom:1px solid var(--rule);vertical-align:top;background:var(--paper)}.film-table tr:hover td{background:var(--cream)}.film-table tr.hidden{display:none}.table-year{font-family:'Playfair Display',serif;font-size:24px;font-weight:500;color:var(--ink);line-height:1}.table-country{font-family:var(--mono);font-size:10px;color:var(--ink-muted);margin-top:4px;letter-spacing:.05em}.table-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.3;text-decoration:none;display:block}.table-title:hover{color:var(--accent)}.table-title:focus{outline:2px solid var(--accent);outline-offset:2px}.table-original{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.table-meta{font-size:12px;color:var(--ink-light);line-height:1.7}.table-meta strong{font-weight:500;color:var(--ink)}.table-technique{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500}.table-runtime{font-family:var(--mono);font-size:12px;color:var(--ink-light)}.confidence-pips{font-family:var(--mono);font-size:14px;letter-spacing:2px}.confidence-pips .filled{color:var(--accent)}.confidence-pips .empty{color:var(--rule)}.watch-cell{text-align:right}.watch-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--ink);color:var(--cream);padding:10px 18px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.05em;text-decoration:none;transition:background .2s}.watch-btn:hover,.watch-btn:focus{background:var(--accent)}.subs-badge{display:block;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--ink-muted)}.no-link{font-family:var(--mono);font-size:12px;color:var(--ink-faint)}.load-more-container{padding:32px;text-align:center;background:var(--paper);border-top:1px solid var(--rule)}.load-more-btn{background:var(--ink);color:var(--cream);border:none;padding:16px 40px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;cursor:pointer;transition:background .2s}.load-more-btn:hover,.load-more-btn:focus{background:var(--accent);outline:none}.load-more-btn:disabled{background:var(--ink-muted);cursor:not-allowed}.load-more-count{opacity:.6;font-weight:400}.detail-page{padding:48px 32px;max-width:1200px;margin:0 auto}.detail-header{display:grid;grid-template-columns:180px 1fr auto;gap:40px;padding-bottom:40px;border-bottom:2px solid var(--ink);margin-bottom:40px}.detail-year-block{background:var(--data-bg);padding:32px;text-align:center;border:1px solid var(--rule)}.detail-year{font-family:'Playfair Display',serif;font-size:56px;font-weight:400;line-height:1;color:var(--ink)}.detail-country{font-family:var(--mono);font-size:12px;letter-spacing:.15em;color:var(--ink-muted);margin-top:12px}.detail-title-section{display:flex;flex-direction:column;justify-content:center}.detail-technique{font-family:var(--mono);font-size:11px;letter-spacing:.15em;color:var(--accent);font-weight:600;margin-bottom:12px}.detail-title{font-family:'Playfair Display',serif;font-size:38px;font-weight:400;line-height:1.15;margin-bottom:8px}.detail-original{font-family:'Source Serif 4',serif;font-size:20px;font-style:italic;color:var(--ink-muted);margin-bottom:20px}.detail-credits{font-size:15px;color:var(--ink-light);line-height:1.8}.detail-credits strong{font-weight:500;color:var(--ink)}.detail-actions{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:12px}.detail-watch-btn{display:flex;align-items:center;justify-content:center;gap:12px;background:var(--ink);color:var(--cream);padding:18px 32px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-decoration:none;transition:background .2s}.detail-watch-btn:hover,.detail-watch-btn:focus{background:var(--accent)}/* Gated detail CTA — Restricted/Unverified status. Honest about the gating without making the page's primary button look broken. */.detail-watch-btn-gated{background:transparent;color:var(--ink);border:1.5px solid var(--ink);padding:16.5px 30.5px}.detail-watch-btn-gated:hover,.detail-watch-btn-gated:focus{background:var(--ink);color:var(--cream)}/* Empty-state CTA replacing the dead "NO WATCH LINK AVAILABLE" text. Encourages contribution rather than ending the journey. */.detail-suggest-link{display:inline-flex;align-items:center;font-family:var(--mono);font-size:12px;color:var(--ink-muted);text-decoration:underline;text-underline-offset:3px;padding:12px 0;min-height:44px;transition:color .15s}.detail-suggest-link:hover,.detail-suggest-link:focus{color:var(--accent)}.detail-subs{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.detail-body{display:grid;grid-template-columns:1fr 280px;gap:60px}.detail-content h2{font-family:'Playfair Display',serif;font-size:var(--type-section-hero);font-weight:400;margin-bottom:16px;margin-top:36px}.detail-content h2:first-child{margin-top:0}.detail-content p{font-family:'Source Serif 4',serif;font-size:16px;line-height:1.9;color:var(--ink-light);margin-bottom:20px}.detail-content .no-content{font-style:italic;color:var(--ink-muted)}.detail-data-panel{background:var(--data-bg);border:1px solid var(--rule);padding:24px;font-family:var(--mono);font-size:12px;height:fit-content;position:sticky;top:16px;align-self:start;max-height:calc(100vh - 32px);overflow-y:auto}.data-panel-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}.data-list{display:block}.data-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}.data-row:last-of-type{border-bottom:none}.data-label{color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;font-size:10px}.data-value{color:var(--ink);text-align:right;font-weight:500}.data-links{margin-top:24px;padding-top:24px;border-top:1px solid var(--rule)}.data-link{display:flex;align-items:center;padding:12px 0;min-height:44px;box-sizing:border-box;color:var(--ink-light);text-decoration:none;transition:color .15s;border-bottom:1px solid var(--rule)}.data-link:last-child{border-bottom:none}.data-link:hover{color:var(--accent)}.data-link:focus{outline:2px solid var(--accent);outline-offset:2px;color:var(--accent)}.data-link::before{content:'→';margin-right:8px;color:var(--ink-faint)}.about-section{background:var(--paper);border-top:2px solid var(--ink);padding:80px 32px}.about-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px}.about-text h2{font-family:'Playfair Display',serif;font-size:32px;font-weight:400;line-height:1.3;margin-bottom:24px}.about-text h2 em{font-style:italic}.about-text p{font-family:'Source Serif 4',serif;font-size:15px;line-height:1.9;color:var(--ink-light);margin-bottom:16px}.about-data{background:var(--data-bg);border:1px solid var(--rule);padding:32px;font-family:var(--mono)}.about-data-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:24px}.about-stat-row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--rule);align-items:baseline}.about-stat-row:last-child{border-bottom:none}.about-stat-label{font-size:12px;color:var(--ink-light)}.about-stat-value{font-size:24px;font-weight:600;color:var(--ink)}.footer{background:var(--ink);color:var(--cream);padding:32px}.footer-inner{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}.footer-logo{font-family:'Playfair Display',serif;font-size:18px}.footer-timestamp{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.7)}/* Mobile filter toggle */
.mobile-filter-toggle{display:none;background:var(--ink);color:var(--cream);border:none;padding:10px 16px;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:background .2s;white-space:nowrap}
.mobile-filter-toggle:hover,.mobile-filter-toggle:focus{background:var(--accent)}
.filter-badge{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:var(--cream);border-radius:50%;width:18px;height:18px;font-size:10px;margin-left:6px}
.drawer-close-bar{display:none;padding:12px 16px;background:var(--ink);color:var(--cream);border:none;width:100%;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-align:center;border-bottom:1px solid rgba(255,255,255,.15)}
.drawer-close-bar:hover{background:var(--accent)}
.sidebar-overlay{display:none}
/* Active filters bar (outside sidebar) */
.active-filters-bar{display:none;padding:10px 16px;background:var(--cream-dark);border-bottom:1px solid var(--rule);gap:8px;align-items:center;flex-wrap:wrap}
.active-filters-bar.has-filters{display:flex}
.active-filters-label{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:600}
.active-filter-tag{background:var(--paper);border:1px solid var(--rule);padding:4px 10px;font-family:var(--mono);font-size:11px;display:inline-flex;align-items:center;gap:8px}
.active-filter-tag .remove{color:var(--ink-light);cursor:pointer;font-size:16px;line-height:1;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;padding:4px}
.active-filter-tag .remove:hover{color:var(--accent)}
.clear-filters-btn{background:none;border:none;font-family:var(--mono);font-size:10px;color:var(--ink-muted);cursor:pointer;text-decoration:underline;margin-left:auto}
.clear-filters-btn:hover{color:var(--accent)}
@media(max-width:900px){.mobile-filter-toggle{display:inline-flex;align-items:center}.drawer-close-bar{display:block}}
@media(max-width:900px){.main-layout{grid-template-columns:1fr}.sidebar{display:block;position:fixed;bottom:0;left:0;right:0;max-height:70vh;overflow-y:auto;transform:translateY(100%);transition:transform .3s ease;z-index:200;border-right:none;border-top:2px solid var(--ink);box-shadow:0 -4px 20px rgba(0,0,0,.15)}.sidebar.open{transform:translateY(0)}.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:199}.sidebar-overlay.visible{display:block}.stats-bar{flex-wrap:wrap}.stat-block{flex:1 1 50%}.detail-header{grid-template-columns:1fr}.detail-body{grid-template-columns:1fr}.about-inner{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}.back-to-top{position:fixed;bottom:2rem;right:2rem;width:44px;height:44px;background:var(--ink);color:var(--cream);border:none;border-radius:50%;font-size:1.25rem;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;z-index:100}.back-to-top.visible{opacity:.8;visibility:visible}.back-to-top:hover{opacity:1}.keyboard-hints{font-family:var(--mono);font-size:10px;color:var(--ink-faint);margin-top:8px;text-align:right}.keyboard-hints kbd{display:inline-block;background:var(--data-bg);border:1px solid var(--rule);border-radius:3px;padding:2px 6px;font-size:10px;margin:0 2px}
/* Country Pages */
.country-page{padding:48px 32px;max-width:1400px;margin:0 auto}
.country-header{display:grid;grid-template-columns:auto 1fr auto;gap:32px;align-items:center;padding-bottom:32px;border-bottom:2px solid var(--ink);margin-bottom:40px}
.country-code-block{background:var(--ink);color:var(--cream);padding:24px 32px;text-align:center}
.country-code-large{font-family:var(--mono);font-size:32px;font-weight:600;letter-spacing:.1em}
.country-title-section h1.country-name{font-family:'Playfair Display',serif;font-size:var(--type-page-hero);font-weight:400;margin-bottom:8px}
.country-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.country-nav{text-align:right}
.country-back-link{font-family:var(--mono);font-size:12px;color:var(--ink-muted);text-decoration:none;letter-spacing:.05em}
.country-back-link:hover{color:var(--accent)}
.country-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:48px}
.country-stat-card{background:var(--paper);border:1px solid var(--rule);padding:24px}
.stat-card-title{font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:12px}
.stat-card-value{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;line-height:1}
.stat-card-detail{font-family:var(--mono);font-size:11px;color:var(--ink-muted);margin-top:8px}
.stat-card-list{display:flex;flex-wrap:wrap;gap:8px}
.stat-tag{font-family:var(--mono);font-size:11px;background:var(--data-bg);padding:6px 10px;border:1px solid var(--rule)}
.stat-tag em{font-style:normal;color:var(--ink-muted)}
.country-films-section{margin-top:40px}
.section-title{font-family:'Playfair Display',serif;font-size:24px;font-weight:400;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid var(--rule)}
/* Countries Index */
.countries-index{padding:48px 32px;max-width:1400px;margin:0 auto}
.countries-header{text-align:center;margin-bottom:48px;padding-bottom:32px;border-bottom:2px solid var(--ink)}
.countries-header h1{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:12px}
.countries-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.countries-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.country-card{display:grid;grid-template-columns:80px 1fr;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s}
.country-card:hover{border-color:var(--ink);box-shadow:4px 4px 0 var(--rule)}
.country-card:focus{outline:2px solid var(--accent);outline-offset:2px}
.country-card-code{background:var(--ink);color:var(--cream);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:14px;font-weight:600;letter-spacing:.1em}
.country-card-info{padding:20px}
.country-card-name{font-family:'Playfair Display',serif;font-size:20px;font-weight:400;margin-bottom:8px}
.country-card-meta{display:flex;gap:16px;font-family:var(--mono);font-size:11px;color:var(--ink-muted);margin-bottom:8px}
.country-card-count{color:var(--ink)}
.country-card-technique{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500}
/* Filter link styling */
.filter-item .filter-link{text-decoration:none;color:inherit;display:block;flex:1}
.filter-item .filter-link:hover .name{color:var(--accent)}
.filter-item .filter-link .name{transition:color .15s}
@media(max-width:900px){.country-header{grid-template-columns:1fr;text-align:center}.country-code-block{width:fit-content;margin:0 auto}.country-nav{text-align:center;margin-top:16px}.countries-grid{grid-template-columns:1fr}}
/* Technique Pages */
.technique-page{padding:48px 32px;max-width:1400px;margin:0 auto}
.technique-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:32px;border-bottom:2px solid var(--ink);margin-bottom:40px}
.technique-title-section h1.technique-name{font-family:'Playfair Display',serif;font-size:42px;font-weight:400;margin-bottom:12px}
.technique-description{font-family:'Source Serif 4',serif;font-size:18px;color:var(--ink-light);margin-bottom:8px;max-width:600px}
.technique-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.technique-nav{text-align:right;padding-top:8px}
.technique-back-link{font-family:var(--mono);font-size:12px;color:var(--ink-muted);text-decoration:none;letter-spacing:.05em}
.technique-back-link:hover{color:var(--accent)}
.technique-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:48px}
.technique-stat-card{background:var(--paper);border:1px solid var(--rule);padding:24px}
.technique-films-section{margin-top:40px}
.table-country-cell{font-family:var(--mono);font-size:11px}
.table-country-code{display:block;color:var(--accent);font-weight:600;letter-spacing:.05em}
.table-country-name{display:block;color:var(--ink-muted);font-size:10px;margin-top:2px}
/* Techniques Index */
.techniques-index{padding:48px 32px;max-width:1400px;margin:0 auto}
.techniques-header{text-align:center;margin-bottom:48px;padding-bottom:32px;border-bottom:2px solid var(--ink)}
.techniques-header h1{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:12px}
.techniques-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.techniques-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
.technique-card{display:block;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s;padding:24px}
.technique-card:hover{border-color:var(--ink);box-shadow:4px 4px 0 var(--rule)}
.technique-card:focus{outline:2px solid var(--accent);outline-offset:2px}
.technique-card-name{font-family:'Playfair Display',serif;font-size:24px;font-weight:400;margin-bottom:8px}
.technique-card-desc{font-family:'Source Serif 4',serif;font-size:14px;color:var(--ink-light);margin-bottom:12px;line-height:1.5}
.technique-card-meta{display:flex;gap:16px;font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
.technique-card-count{color:var(--ink);font-weight:500}
@media(max-width:900px){.technique-header{flex-direction:column;text-align:center}.technique-nav{text-align:center;margin-top:16px}.techniques-grid{grid-template-columns:1fr}}
/* Directors Index */
.directors-index{padding:48px 32px;max-width:1400px;margin:0 auto}
.directors-header{text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid var(--ink)}
.directors-header h1{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:12px}
.directors-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.directors-stats{display:flex;justify-content:center;gap:48px;margin-bottom:32px;padding:24px;background:var(--data-bg);border:1px solid var(--rule)}
.directors-stat{text-align:center}
.directors-stat .stat-value{display:block;font-family:'Playfair Display',serif;font-size:36px;font-weight:400;color:var(--ink)}
.directors-stat .stat-label{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-muted)}
.directors-alphabet{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:40px;padding:16px;background:var(--paper);border:1px solid var(--rule)}
.alphabet-link{font-family:var(--mono);font-size:14px;font-weight:600;padding:8px 12px;text-decoration:none;color:var(--ink-muted);transition:color .15s,background .15s}
.alphabet-link:hover,.alphabet-link:focus{color:var(--accent);background:var(--cream)}
.directors-list{display:flex;flex-direction:column;gap:40px}
.directors-letter-section{scroll-margin-top:20px}
.letter-heading{font-family:'Playfair Display',serif;font-size:32px;font-weight:400;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule);color:var(--accent)}
.directors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.director-card{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s}
.director-card:hover{border-color:var(--ink);box-shadow:3px 3px 0 var(--rule)}
.director-card:focus{outline:2px solid var(--accent);outline-offset:2px}
.director-name{font-family:'Source Serif 4',serif;font-size:16px;color:var(--ink)}
.director-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.director-count{font-family:var(--mono);font-size:12px;color:var(--ink);font-weight:500}
.director-countries{font-family:var(--mono);font-size:10px;color:var(--ink-muted);letter-spacing:.05em}
@media(max-width:900px){.directors-stats{flex-direction:column;gap:16px}.directors-grid{grid-template-columns:1fr}}
/* Decade Pages */
.decade-page{padding:48px 32px;max-width:1400px;margin:0 auto}
.decade-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:32px;border-bottom:2px solid var(--ink);margin-bottom:40px}
.decade-title-section h1.decade-name{font-family:'Playfair Display',serif;font-size:56px;font-weight:400;margin-bottom:4px}
.decade-range{font-family:var(--mono);font-size:14px;color:var(--ink-muted);letter-spacing:.1em;margin-bottom:16px}
.decade-description{font-family:'Source Serif 4',serif;font-size:18px;color:var(--ink-light);margin-bottom:8px;max-width:600px}
.decade-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.decade-nav{text-align:right;padding-top:8px}
.decade-back-link{font-family:var(--mono);font-size:12px;color:var(--ink-muted);text-decoration:none;letter-spacing:.05em}
.decade-back-link:hover{color:var(--accent)}
.decade-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:48px}
.decade-stat-card{background:var(--paper);border:1px solid var(--rule);padding:24px}
.decade-films-section{margin-top:40px}
/* Decades Index */
.decades-index{padding:48px 32px;max-width:1200px;margin:0 auto}
.decades-header{text-align:center;margin-bottom:48px;padding-bottom:32px;border-bottom:2px solid var(--ink)}
.decades-header h1{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:12px}
.decades-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.decades-timeline{display:flex;flex-direction:column;gap:16px}
.decade-card{display:grid;grid-template-columns:120px 1fr;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s}
.decade-card:hover{border-color:var(--ink);box-shadow:4px 4px 0 var(--rule)}
.decade-card:focus{outline:2px solid var(--accent);outline-offset:2px}
.decade-card-year{background:var(--ink);color:var(--cream);display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:28px;font-weight:400}
.decade-card-info{padding:24px}
.decade-card-title{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--ink-muted);margin-bottom:8px}
.decade-card-desc{font-family:'Source Serif 4',serif;font-size:16px;color:var(--ink);margin-bottom:12px;line-height:1.5}
.decade-card-meta{display:flex;gap:24px;font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
.decade-card-count{color:var(--accent);font-weight:600}
.decade-card-country{color:var(--ink-light)}
@media(max-width:900px){.decade-header{flex-direction:column;text-align:center}.decade-nav{text-align:center;margin-top:16px}.decade-card{grid-template-columns:80px 1fr}.decade-card-year{font-size:20px}}
/* Random Button & Film of the Day */
.search-actions{display:flex;gap:12px;align-items:center}
.random-btn{background:var(--ink);color:var(--cream);border:none;padding:10px 16px;font-family:var(--mono);font-size:12px;font-weight:500;cursor:pointer;transition:background .2s;white-space:nowrap}
.random-btn:hover,.random-btn:focus{background:var(--accent);outline:none}
.film-of-day{background:var(--paper);border:2px solid var(--accent);border-left-width:4px;padding:20px 24px;margin:20px 32px;display:flex;justify-content:space-between;align-items:center;gap:24px}
.film-of-day-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.film-of-day-label{font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);font-weight:600}
.film-of-day-date{font-family:var(--mono);font-size:10px;color:var(--ink-muted)}
.film-of-day-content{display:flex;justify-content:space-between;align-items:center;gap:24px;flex:1}
.film-of-day-info{flex:1}
.film-of-day-title{font-family:'Playfair Display',serif;font-size:22px;font-weight:500;text-decoration:none;color:var(--ink);display:block;margin-bottom:8px}
.film-of-day-title:hover{color:var(--accent)}
.film-of-day-meta{display:flex;gap:16px;font-family:var(--mono);font-size:12px;margin-bottom:8px}
.film-of-day-year{color:var(--ink);font-weight:500}
.film-of-day-country{color:var(--accent);font-weight:600}
.film-of-day-technique{color:var(--ink-muted)}
.film-of-day-synopsis{font-family:'Source Serif 4',serif;font-size:14px;color:var(--ink-light);margin:0;line-height:1.5}
.film-of-day-actions{display:flex;gap:12px;flex-shrink:0}
.film-of-day-watch-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:11px;padding:10px 16px;background:var(--ink);color:var(--cream);text-decoration:none;transition:background .2s}
.film-of-day-watch-btn:hover{background:var(--accent)}
/* Gated FotD CTA — Restricted/Unverified status. Honest about the gating
   without making the card look broken: muted ink instead of bright crimson
   on hover, lock icon + platform name surfaces the actual ask. */
.film-of-day-watch-btn-gated{background:transparent;color:var(--ink);border:1px solid var(--ink);font-weight:500}
.film-of-day-watch-btn-gated:hover{background:var(--ink);color:var(--cream)}
.footer-random{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.6);text-decoration:none;transition:color .2s}
.footer-random:hover{color:var(--cream)}
@media(max-width:900px){.search-actions{flex-direction:column;align-items:stretch;gap:8px}.search-box input{width:100%}.film-of-day{flex-direction:column;margin:20px 16px}.film-of-day-content{flex-direction:column;align-items:flex-start}.film-of-day-actions{width:100%;justify-content:flex-start}}
/* Related Films */
.related-films{padding:48px 32px;max-width:1200px;margin:0 auto;border-top:2px solid var(--rule)}
.related-section{margin-bottom:40px}
.related-section:last-child{margin-bottom:0}
.related-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}
.related-header a{font-family:'Playfair Display',serif;font-size:var(--type-section-hero);font-weight:400;text-decoration:none;color:var(--ink)}
.related-header a:hover{color:var(--accent)}
.related-count{font-family:var(--mono);font-size:11px;color:var(--ink-muted);letter-spacing:.05em}
.related-count:hover{color:var(--accent)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.related-card{display:block;background:var(--paper);border:1px solid var(--rule);padding:16px;min-height:44px;box-sizing:border-box;text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s;position:relative}
.related-card:hover{border-color:var(--ink);box-shadow:3px 3px 0 var(--rule)}
.related-card:focus{outline:2px solid var(--accent);outline-offset:2px}
.related-title{display:block;font-family:'Playfair Display',serif;font-size:15px;font-weight:500;line-height:1.3;margin-bottom:8px;color:var(--ink)}
.related-meta{display:block;font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
.related-watch{position:absolute;top:12px;right:12px;font-size:12px;color:var(--accent)}
.related-watch-gated{color:var(--ink-muted)}
/* Folded "More like this" expander — keeps Decade/Technique sections
   accessible without dumping 25 cards on every detail page. */
.related-extra{margin-top:24px;border-top:1px solid var(--rule);padding-top:24px}
.related-extra-summary{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);cursor:pointer;padding:12px 0;min-height:44px;display:flex;align-items:center;list-style:none;transition:color .15s}
.related-extra-summary::-webkit-details-marker{display:none}
.related-extra-summary::before{content:'▸';margin-right:8px;color:var(--ink-faint);transition:transform .15s}
.related-extra[open] .related-extra-summary::before{transform:rotate(90deg);display:inline-block}
.related-extra-summary:hover,.related-extra-summary:focus{color:var(--accent)}
.related-extra[open] .related-extra-summary{margin-bottom:24px}
@media(max-width:900px){.related-films{padding:32px 16px}.related-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.related-header{flex-direction:column;gap:8px}.related-header a{font-size:18px}}
/* 404 Error Page */
.error-page{display:flex;align-items:center;justify-content:center;min-height:60vh;padding:48px 32px}
.error-content{text-align:center;max-width:500px}
.error-code{font-family:var(--mono);font-size:120px;font-weight:600;color:var(--rule);line-height:1;margin-bottom:16px}
.error-title{font-family:'Playfair Display',serif;font-size:var(--type-page-hero);font-weight:400;margin-bottom:16px}
.error-message{font-family:'Source Serif 4',serif;font-size:18px;color:var(--ink-muted);margin-bottom:24px}
/* Echoes the URL the user actually tried — populated by inline JS on
   the 404 page, hidden when JS is off (window.location unavailable to
   the template). Sits above the search form as recovery context. */
.error-path{font-family:var(--mono);font-size:12px;color:var(--ink-muted);margin-bottom:24px;word-break:break-all}
.error-path code{background:var(--data-bg);padding:2px 6px;color:var(--ink);border-radius:2px}
.error-search{display:flex;gap:0;justify-content:center;margin-bottom:24px;max-width:380px;margin-left:auto;margin-right:auto}
.error-search-input{flex:1;padding:12px 16px;border:1px solid var(--rule);border-right:none;background:var(--paper);font-family:var(--mono);font-size:13px;min-height:44px;box-sizing:border-box}
.error-search-input:focus{outline:2px solid var(--accent);outline-offset:-2px;border-color:var(--ink)}
.error-search-btn{padding:12px 20px;border:1px solid var(--ink);background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;min-height:44px;box-sizing:border-box;transition:background .2s}
.error-search-btn:hover,.error-search-btn:focus{background:var(--accent);border-color:var(--accent);outline:none}
.error-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.error-btn{font-family:var(--mono);font-size:12px;font-weight:500;padding:14px 24px;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;text-decoration:none;transition:all .2s}
.error-btn-primary{background:var(--ink);color:var(--cream)}
.error-btn-primary:hover,.error-btn-primary:focus{background:var(--accent);outline:none}
.error-btn-secondary{background:var(--paper);color:var(--ink);border:1px solid var(--rule)}
.error-btn-secondary:hover,.error-btn-secondary:focus{border-color:var(--ink);outline:none}
/* Empty search state */
/* Shared empty-state pattern. Five "nothing here" surfaces share this:
   .no-results (homepage filter→nothing), .no-content (detail page no
   prose), .no-links (watch-links section all dead), and the 404 page's
   .error-content. Pattern: centered text, muted color, optional CTA.
   See generateFilmPage / generate404Page / generateIndexPage for usage. */
.empty-state{text-align:center;color:var(--ink-muted);font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;line-height:1.6}
.empty-state-title{font-family:'Playfair Display',serif;font-style:normal;font-size:var(--type-section-hero);color:var(--ink);margin-bottom:12px}
.empty-state-message{margin-bottom:16px}
.empty-state-cta{display:inline-flex;align-items:center;font-family:var(--mono);font-style:normal;font-size:12px;color:var(--ink-muted);text-decoration:underline;text-underline-offset:3px;padding:12px 0;min-height:44px;transition:color .15s}
.empty-state-cta:hover,.empty-state-cta:focus{color:var(--accent)}
.no-results{padding:48px 32px;background:var(--paper);text-align:center;color:var(--ink-muted);font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;line-height:1.6}
.no-results-title{font-family:'Playfair Display',serif;font-style:normal;font-size:var(--type-section-hero);color:var(--ink);margin-bottom:12px}
.no-results-message{font-family:'Source Serif 4',serif;color:var(--ink-muted);font-size:16px;margin-bottom:16px}
.clear-all-btn{background:var(--ink);color:var(--cream);border:none;padding:12px 24px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:12px;font-weight:500;cursor:pointer;transition:background .2s;margin-top:8px}
.clear-all-btn:hover,.clear-all-btn:focus{background:var(--accent);outline:none}
/* Sortable table headers */
.sortable{cursor:pointer;user-select:none;transition:color .15s}
.sortable:hover{color:var(--accent)}
.sort-indicator{margin-left:4px;opacity:0.4;font-size:10px}
.sortable.active .sort-indicator{opacity:1;color:var(--accent)}
/* Watch Links Section */
.watch-links-section{margin-top:32px;padding:24px;background:var(--data-bg);border:1px solid var(--rule)}
.watch-links-section h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:16px}
.watch-links-grid{display:flex;flex-direction:column;gap:8px}
.watch-link-group{display:flex;flex-direction:column;gap:8px}
.group-label{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-muted);margin:8px 0 4px}
.watch-link-card{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:var(--ink);transition:border-color .2s,box-shadow .2s}
.watch-link-card:hover{border-color:var(--ink);box-shadow:2px 2px 0 var(--rule);transform:translateY(-1px)}
/* Gated card — Restricted/Unverified status. URL works but needs login,
   region access, or paid subscription. Slightly desaturated so primary
   "▶ WATCH" CTA still wins on rows with multiple links. */
.watch-link-card-gated{background:color-mix(in srgb,var(--paper) 85%,var(--data-bg));border-color:var(--rule);opacity:.92}
.watch-link-card-gated:hover{opacity:1}
.link-gate-icon{display:inline-block;margin-left:4px;vertical-align:-1px;color:var(--ink-muted)}
/* Row-level gated watch button. Applied via .watch-btn-gated next to .watch-btn
   in the renderRow template — hex of the lock instead of the play triangle. */
.watch-btn-gated{background:transparent;color:var(--ink-muted);border:1px solid var(--rule);font-weight:500}
.watch-btn-gated:hover{background:var(--data-bg);color:var(--ink);border-color:var(--ink-muted)}
.link-icon{font-size:1.3rem;flex-shrink:0;width:2rem;text-align:center}
.link-info{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:1}
.link-platform{font-family:'Source Serif 4',serif;font-size:15px;font-weight:600}
.link-badge{display:inline-block;padding:3px 8px;border-radius:9999px;font-family:var(--mono);font-size:10px;font-weight:600;color:white;text-transform:uppercase;letter-spacing:.03em}
.link-chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{display:inline-block;padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:10px;background:var(--data-bg);color:var(--ink-muted)}
.link-notes{font-family:'Source Serif 4',serif;font-size:12px;color:var(--ink-muted);font-style:italic;width:100%}
.verified-date,.status-icon{flex-shrink:0;font-size:14px}
.no-links{font-family:'Source Serif 4',serif;color:var(--ink-muted);font-style:italic}
.dead-links-notice{margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--ink-light)}
@media(max-width:600px){.watch-link-card{padding:8px 12px}.link-chips{display:none}}
/* Research Sources */
.research-sources{margin-top:32px;padding:20px;background:var(--cream);border:1px solid var(--rule);border-left:3px solid var(--accent)}
.research-sources h2{font-family:'Playfair Display',serif;font-size:16px;font-weight:400;margin-bottom:12px;color:var(--ink-muted)}
.sources-list{font-family:var(--mono);font-size:12px;color:var(--ink-light);line-height:1.8}
/* Film Tags */
.film-tags{margin-top:32px}
.tag-section{margin-bottom:16px}
.tag-label{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-muted);display:block;margin-bottom:8px}
.tag-list{display:flex;flex-wrap:wrap;gap:8px}
.tag{display:inline-flex;align-items:center;padding:8px 12px;min-height:44px;box-sizing:border-box;font-family:var(--mono);font-size:12px;text-decoration:none;border:1px solid var(--rule);transition:all .2s}.tag:hover{border-color:var(--ink);color:var(--accent)}.tag:focus{outline:2px solid var(--accent);outline-offset:2px;color:var(--accent)}
.tag:hover{border-color:var(--ink);background:var(--cream)}
.genre-tag{background:var(--paper);color:var(--ink)}
.keyword-tag{background:var(--data-bg);color:var(--ink-light)}
/* Entity Pages (Studios, Directors, Series) */
.entity-page{padding:48px 32px;max-width:1200px;margin:0 auto}
.entity-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:32px;border-bottom:2px solid var(--ink);margin-bottom:32px}
.entity-title-section{flex:1}
.entity-name{font-family:'Playfair Display',serif;font-size:var(--type-page-hero);font-weight:400;margin-bottom:8px}
.entity-native-name{font-family:'Source Serif 4',serif;font-size:20px;font-style:italic;color:var(--ink-muted);margin-bottom:8px}
.entity-subtitle{font-family:'Source Serif 4',serif;color:var(--ink-light);font-size:16px;margin-bottom:4px}
.entity-dates{font-family:var(--mono);font-size:13px;color:var(--ink-muted)}
.entity-type-badge{display:inline-block;font-family:var(--mono);font-size:11px;padding:4px 10px;background:var(--accent);color:var(--cream);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px}
.entity-type-badge.small{font-size:10px;padding:3px 8px;margin-bottom:8px}
.entity-nav{text-align:right}
.entity-back-link{font-family:var(--mono);font-size:12px;color:var(--ink-muted);text-decoration:none}
.entity-back-link:hover{color:var(--accent)}
.entity-description{margin-bottom:32px}
.entity-description h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:12px}
.entity-description p{font-family:'Source Serif 4',serif;font-size:16px;line-height:1.8;color:var(--ink-light)}
.entity-meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.entity-meta-card{background:var(--paper);border:1px solid var(--rule);padding:20px}
.meta-card-title{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-muted);margin-bottom:8px}
.meta-card-value{font-family:'Playfair Display',serif;font-size:28px;font-weight:400}
.meta-card-detail{font-family:var(--mono);font-size:11px;color:var(--ink-muted);margin-top:4px}
.meta-card-tags{display:flex;flex-wrap:wrap;gap:6px}
.meta-tag{font-family:var(--mono);font-size:11px;padding:4px 8px;background:var(--data-bg);border:1px solid var(--rule)}
.entity-links{margin-bottom:32px}
.entity-links h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:12px}
.entity-link{display:block;font-family:var(--mono);font-size:13px;color:var(--ink-light);text-decoration:none;padding:8px 0;border-bottom:1px solid var(--rule)}
.entity-link:hover{color:var(--accent)}
.entity-awards{margin-bottom:32px;padding:20px;background:var(--data-bg);border:1px solid var(--rule)}
.entity-awards h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:12px}
.entity-awards p{font-family:'Source Serif 4',serif;font-size:15px;color:var(--ink-light);line-height:1.7}
.entity-collaborators{margin-bottom:32px}
.entity-collaborators h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:12px}
.collaborator-tags{display:flex;flex-wrap:wrap;gap:8px}
.collaborator-tag{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:12px;padding:6px 12px;background:var(--paper);border:1px solid var(--rule);color:var(--ink-light);text-decoration:none;transition:border-color .2s,color .2s}
.collaborator-tag:hover{border-color:var(--ink);color:var(--accent)}
.collab-count{color:var(--ink-faint);font-size:11px}
.entity-watch-order{margin-bottom:32px;padding:20px;background:var(--paper);border:1px solid var(--rule)}
.entity-watch-order h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:400;margin-bottom:12px}
.watch-order-content{font-family:'Source Serif 4',serif;font-size:15px;color:var(--ink-light);line-height:1.8}
.watch-order-list{margin:12px 0;padding-left:24px}
.watch-order-list li{margin-bottom:8px;padding-left:8px}
.watch-order-header{font-family:var(--mono);font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-muted);margin:16px 0 8px}
ol.watch-order-list{list-style:decimal}
ul.watch-order-list{list-style:disc}
.entity-films-section{margin-top:40px}
/* Entity Index Pages */
.entity-index{padding:48px 32px;max-width:1400px;margin:0 auto}
.entity-index-header{text-align:center;margin-bottom:48px;padding-bottom:32px;border-bottom:2px solid var(--ink)}
.entity-index-header h1{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:12px}
.entity-index-subtitle{font-family:'Source Serif 4',serif;font-style:italic;color:var(--ink-muted);font-size:16px}
.entity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.entity-card{display:block;background:var(--paper);border:1px solid var(--rule);padding:20px;text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s}
.entity-card:hover{border-color:var(--ink);box-shadow:4px 4px 0 var(--rule)}
.entity-card-name{font-family:'Playfair Display',serif;font-size:20px;font-weight:400;margin-bottom:8px;color:var(--ink)}
.entity-card-meta{display:flex;gap:12px;font-family:var(--mono);font-size:11px;color:var(--ink-muted);margin-bottom:4px}
.entity-card-country{color:var(--accent)}
.entity-card-count{color:var(--ink)}
.entity-card-dates{font-family:var(--mono);font-size:11px;color:var(--ink-faint)}
/* Tag Pages (Genres, Keywords) */
.tag-page{padding:48px 32px;max-width:1200px;margin:0 auto}
.tag-header{text-align:center;margin-bottom:40px;padding-bottom:32px;border-bottom:2px solid var(--ink)}
.tag-type{display:inline-block;font-family:var(--mono);font-size:11px;padding:4px 12px;background:var(--ink);color:var(--cream);text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px}
.tag-name{font-family:'Playfair Display',serif;font-size:48px;font-weight:400;margin-bottom:8px}
.tag-count{font-family:var(--mono);font-size:14px;color:var(--ink-muted)}
.tag-films-section{margin-top:24px}
/* Tag Cloud */
.tag-cloud{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;padding:24px}
.tag-cloud-item{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:var(--ink);transition:all .2s;border-radius:4px}
.tag-cloud-item:hover{border-color:var(--ink);box-shadow:3px 3px 0 var(--rule);transform:translateY(-1px)}
.tag-cloud-item .tag-name{font-family:'Source Serif 4',serif}
.tag-cloud-item .tag-count{font-family:var(--mono);font-size:11px;color:var(--ink-muted);background:var(--data-bg);padding:2px 6px;border-radius:3px}
.tag-size-xs{font-size:13px;padding:6px 10px}
.tag-size-xs .tag-count{font-size:10px}
.tag-size-sm{font-size:14px;padding:8px 12px}
.tag-size-md{font-size:16px;padding:10px 16px}
.tag-size-lg{font-size:18px;padding:12px 18px;font-weight:500}
.tag-size-xl{font-size:22px;padding:14px 22px;font-weight:500;background:var(--data-bg)}
@media(max-width:900px){.tag-cloud{gap:8px;padding:16px}.tag-cloud-item{padding:8px 12px}}
/* Collapsible Sidebar Sections */
.collapsible-header{cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center}
.collapse-icon{font-size:10px;color:var(--ink-faint);transition:transform .2s}
.collapsible-content.collapsed{display:none}
/* Footer Report Link */
.footer-links{display:flex;gap:24px;align-items:center}
.footer-report{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.5);text-decoration:none}
.footer-report:hover{color:var(--cream)}
/* Series type in film meta */
.series-type{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
/* Breadcrumb Navigation */
.breadcrumb{padding:12px 32px;background:var(--paper);border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:12px}
.breadcrumb-list{display:flex;flex-wrap:wrap;align-items:center;list-style:none;gap:0}
.breadcrumb-item{display:inline-flex;align-items:center}
.breadcrumb-item a{color:var(--ink-muted);text-decoration:none;transition:color .15s}
.breadcrumb-item a:hover{color:var(--accent)}
.breadcrumb-item span[aria-current]{color:var(--ink);font-weight:500}
.breadcrumb-sep{color:var(--ink-faint);margin:0 8px}
@media(max-width:900px){.entity-header{flex-direction:column}.entity-nav{margin-top:16px}.entity-grid{grid-template-columns:1fr}.breadcrumb{padding:12px 16px;font-size:11px}.breadcrumb-sep{margin:0 6px}.main-nav{gap:20px;padding:14px 16px;flex-wrap:wrap}}
@media(max-width:480px){
.main-nav{overflow-x:auto;flex-wrap:nowrap;gap:24px;padding:14px 16px;justify-content:flex-start;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none}
.main-nav::-webkit-scrollbar{display:none}
.main-nav a{white-space:nowrap;flex-shrink:0}
.masthead-main{padding:20px 16px 16px}
.masthead-title{font-size:24px}
.masthead-top{padding:8px 16px;flex-wrap:wrap;justify-content:center;gap:4px}
.masthead-top span:nth-child(2){display:none}
.stat-block{flex:1 1 100%;padding:12px 16px}
.content-header{padding:12px 16px;flex-direction:column;gap:8px;align-items:flex-start}
.search-box input{width:100%}
.keyboard-hints{display:none}
.hide-mobile{display:none}
.film-table thead{display:none}
.film-table,.film-table tbody{display:block}
.film-table tr{display:flex;flex-wrap:wrap;align-items:baseline;padding:14px 16px;border-bottom:1px solid var(--rule);background:var(--paper);gap:2px 12px}
.film-table tr:hover{background:var(--cream)}
.film-table tr.hidden{display:none}
.film-table td{padding:0;border:none;background:none!important}
.film-table td:first-child{order:1}
.table-year{font-size:14px;display:inline}
.table-country{display:inline;margin-top:0;margin-left:4px}
.film-table td:nth-child(2){order:0;width:100%;flex-basis:100%}
.table-title{font-size:16px;font-weight:600}
.table-original{font-size:12px}
.film-table td:nth-child(3){order:2;flex:1;min-width:0}
.table-meta{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.film-table td:last-child{order:3}
.watch-btn{padding:6px 10px;font-size:10px}
.watch-cell{text-align:center}
.subs-badge{display:none}
.no-link{display:none}
.detail-page{padding:24px 16px}
.detail-header{gap:20px;padding-bottom:24px;margin-bottom:24px}
.detail-year-block{padding:20px;display:flex;align-items:center;gap:16px}
.detail-year{font-size:36px}
.detail-country{margin-top:0}
.detail-title{font-size:24px}
.detail-original{font-size:16px}
.detail-credits{font-size:14px}
.detail-watch-btn{padding:14px 20px;width:100%;justify-content:center}
.detail-actions{align-items:stretch}
.detail-body{gap:24px}
.detail-content h2{font-size:18px;margin-top:24px}
.detail-content p{font-size:15px}
.detail-data-panel{padding:16px}
.about-section{padding:40px 16px}
.about-text h2{font-size:24px}
.about-inner{gap:32px}
.about-data{padding:20px}
.about-stat-value{font-size:20px}
.country-page,.technique-page,.directors-index,.decades-index,.entity-page,.entity-index,.tag-page{padding:24px 16px}
.country-name,.technique-name,.entity-name{font-size:28px}
.entity-index-header h1,.tag-name{font-size:32px}
.stat-card-value{font-size:36px}
.decade-name{font-size:36px}
.decade-description,.technique-description{font-size:16px}
.section-title{font-size:20px}
.meta-card-value{font-size:24px}
.breadcrumb{padding:8px 12px;font-size:10px}
.film-of-day{margin:12px 16px;padding:16px}
.film-of-day-title{font-size:18px}
.related-films{padding:24px 16px}
.related-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.error-code{font-size:72px}
.error-title{font-size:24px}
.error-message{font-size:16px}
.footer{padding:20px 16px}
.footer-inner{flex-direction:column;gap:12px;text-align:center}
.alphabet-link{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center}
.tag-cloud-item{min-height:44px}
.load-more-btn{min-height:44px}
.decade-card{grid-template-columns:60px 1fr}
.decade-card-year{font-size:16px}
.decade-card-info{padding:16px}
.watch-links-section{padding:16px}
.watch-link-card{padding:8px 12px}
.link-chips{display:none}
.no-results{padding:24px 16px}
.no-results-title{font-size:20px}
}`;
}

function generateJS() {
  return `document.addEventListener('DOMContentLoaded',function(){
const tbody=document.getElementById('film-tbody');
const searchInput=document.getElementById('search-input');
const resultsCount=document.getElementById('results-count');
const activeQueryBox=document.getElementById('active-query');
const queryTags=document.getElementById('query-tags');
const filterItems=document.querySelectorAll('.filter-item');
const loadMoreBtn=document.getElementById('load-more-btn');
// Catalog is lazy-loaded — see ensureCatalog() below. Until first
// interaction (or 2s idle fallback), allFilms is empty and the SSR'd
// 50 rows in the table are what the user sees. After load, mutated in
// place so existing references (sortFilms, getFilteredFilms, FotD
// rotation, etc.) automatically pick up the data.
let allFilms=window.ALL_FILMS_DATA||[];
let studioMap=new Map((window.STUDIOS_DATA||[]).map(s=>[s.id,s]));
let directorMap=new Map((window.DIRECTORS_DATA||[]).map(d=>[d.id,d]));
let studiosByName=new Map((window.STUDIOS_DATA||[]).map(s=>[s.name.toLowerCase().trim(),s]));
let directorsByName=new Map((window.DIRECTORS_DATA||[]).map(d=>[d.name.toLowerCase().trim(),d]));
let activeFilters={};

// ===== Catalog lazy-load =====
// 470KB gzipped pulled off the homepage critical path. Catalog ships only
// when the user actually needs it — search keystroke, filter click, sort
// click, load-more click, or after 2s idle (so first interaction feels
// instant for most). FotD rotation and other catalog-dependent code is
// re-fired in onCatalogReady().
let catalogReady=allFilms.length>0;
let catalogLoading=null;
function ensureCatalog(){
  if(catalogReady)return Promise.resolve();
  if(catalogLoading)return catalogLoading;
  const url=window.__CATALOG_URL||'/films-index.js';
  catalogLoading=new Promise(function(resolve){
    const s=document.createElement('script');
    s.src=url;
    s.async=true;
    s.onload=function(){
      allFilms=window.ALL_FILMS_DATA||[];
      studioMap=new Map((window.STUDIOS_DATA||[]).map(s=>[s.id,s]));
      directorMap=new Map((window.DIRECTORS_DATA||[]).map(d=>[d.id,d]));
      studiosByName=new Map((window.STUDIOS_DATA||[]).map(s=>[s.name.toLowerCase().trim(),s]));
      directorsByName=new Map((window.DIRECTORS_DATA||[]).map(d=>[d.name.toLowerCase().trim(),d]));
      catalogReady=true;
      // Re-fire deferred renderers: FotD rotation needs the catalog to
      // pick today's film; loadedCount caps need real total to update
      // the load-more button.
      if(typeof rotateFilmOfDay==='function')rotateFilmOfDay();
      if(loadMoreBtn)loadMoreBtn.dataset.total=allFilms.length;
      resolve();
    };
    s.onerror=function(){catalogReady=true;resolve();};
    document.head.appendChild(s);
  });
  return catalogLoading;
}
// Idle-load after 2s so first interaction (which usually comes within
// 1-3s on engaged users) doesn't pay the catalog round-trip latency.
// Users who never interact never pay either way — page is already
// usable from the SSR'd rows.
setTimeout(ensureCatalog, 2000);

// Keywords lazy-loaded from /keywords-index.json on first need.
// ~80% of users never trigger this fetch. ~30 KB gzipped off critical
// path. See ensureCatalog() above for the same pattern at larger scale.
let keywordsCache={};
let keywordsLoaded=false;
let keywordsLoading=null;
function loadKeywords(){
  if(keywordsLoaded)return Promise.resolve(keywordsCache);
  if(keywordsLoading)return keywordsLoading;
  keywordsLoading=fetch('/keywords-index.json',{cache:'force-cache'})
    .then(r=>r.ok?r.json():{})
    .then(data=>{keywordsCache=data||{};keywordsLoaded=true;return keywordsCache;})
    .catch(()=>{keywordsLoaded=true;return keywordsCache;});
  return keywordsLoading;
}
let loadedCount=parseInt(loadMoreBtn?.dataset.loaded||allFilms.length);
const BATCH_SIZE=50;
let currentSort={column:'year',direction:'desc'};

const countryCodes={USSR:'USSR',Russia:'RUS',Czechoslovakia:'CSSR','Czech Republic':'CZE',Poland:'POL',Hungary:'HUN',Yugoslavia:'YUG',Croatia:'HRV',Serbia:'SRB',Romania:'ROU','East Germany':'DDR',Germany:'DEU',China:'CHN',Japan:'JPN',USA:'USA',France:'FRA',UK:'GBR',Canada:'CAN',Italy:'ITA',Australia:'AUS',India:'IND',Thailand:'THA',Vietnam:'VNM',UAE:'UAE',Cuba:'CUB',Brazil:'BRA',Belgium:'BEL',Philippines:'PHL',Malaysia:'MYS',Indonesia:'IDN','South Africa':'ZAF',Egypt:'EGY',Iran:'IRN',Argentina:'ARG',Mexico:'MEX','South Korea':'KOR',Taiwan:'TWN',Turkey:'TUR',Nigeria:'NGA',Kenya:'KEN',Zambia:'ZMB','Saudi Arabia':'SAU','North Korea':'PRK',Spain:'ESP',Netherlands:'NLD',Sweden:'SWE',Denmark:'DNK',Norway:'NOR',Switzerland:'CHE',Ireland:'IRL','New Zealand':'NZL',Singapore:'SGP',Israel:'ISR',Slovakia:'SVK',Bulgaria:'BGR',Ukraine:'UKR',Estonia:'EST',Latvia:'LVA',Lithuania:'LTU',Georgia:'GEO',Armenia:'ARM',Chile:'CHL',Other:'OTH'};
function getCC(c){return countryCodes[c]||c?.substring(0,3).toUpperCase()||'???';}
function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function slugify(s){return(s||'untitled').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
function confPips(c){const l={'★':1,'★★':2,'★★★':3,'★★★★':4,'★★★★★':5};const n=l[c]||0;return '<span class="filled">'+'■'.repeat(n)+'</span><span class="empty">'+'□'.repeat(5-n)+'</span>';}
// Watch-link status partitioning, kept in sync with build-site.js
// WATCHABLE_STATUSES / GATED_STATUSES / HIDDEN_STATUSES. A link is
// "visible" if it's Watchable or Gated; gated links open with a lock icon.
// See scripts/lib/platform-trust.js for the canonical Notion vocabulary.
const WATCHABLE=new Set(['Verified']);
const GATED=new Set(['Restricted','Unverified']);
function isWatchable(l){return l&&l.url&&WATCHABLE.has(l.status);}
function isGated(l){return l&&l.url&&GATED.has(l.status);}
function getBestLink(wl){if(!wl||!Array.isArray(wl))return null;return wl.find(isWatchable)||wl.find(isGated)||null;}
function getWatchUrl(wl){const l=getBestLink(wl);return l?l.url:null;}
function hasWatchLinksClient(wl){return Array.isArray(wl)&&wl.some(l=>isWatchable(l)||isGated(l));}

// Build lookup maps for studios and directors
// (studioMap / directorMap / studiosByName / directorsByName declared
//  earlier with let so they can be re-bound when the lazy catalog loads.)

function getDirectorLinks(f){
  if(f.directorEntities&&f.directorEntities.length>0){
    return f.directorEntities.map(d=>{
      const dir=directorMap.get(d.id);
      return dir?'<a href="directors/'+dir.slug+'.html">'+escHtml(d.name)+'</a>':escHtml(d.name);
    }).join(', ');
  }
  if(f.director){
    return f.director.split(',').map(n=>n.trim()).filter(n=>n).map(name=>{
      const dir=directorsByName.get(name.toLowerCase());
      return dir?'<a href="directors/'+dir.slug+'.html">'+escHtml(name)+'</a>':escHtml(name);
    }).join(', ');
  }
  return '';
}

function getStudioLinks(f){
  if(f.studioEntities&&f.studioEntities.length>0){
    return f.studioEntities.map(s=>{
      const stu=studioMap.get(s.id);
      return stu?'<a href="studios/'+stu.slug+'.html">'+escHtml(s.name)+'</a>':escHtml(s.name);
    }).join(', ');
  }
  if(f.studio){
    const stu=studiosByName.get(f.studio.toLowerCase().trim());
    return stu?'<a href="studios/'+stu.slug+'.html">'+escHtml(f.studio)+'</a>':escHtml(f.studio);
  }
  return '';
}

const CURRENT_YEAR=new Date().getFullYear();
function sortFilms(films,column,direction){
  return [...films].sort((a,b)=>{
    // When sorting by year desc, push future films to end
    if(column==='year'&&direction==='desc'){
      const aFuture=(a.year||0)>CURRENT_YEAR?1:0;
      const bFuture=(b.year||0)>CURRENT_YEAR?1:0;
      if(aFuture!==bFuture)return aFuture-bFuture;
    }
    let valA,valB;
    switch(column){
      case 'year':valA=a.year||0;valB=b.year||0;break;
      case 'title':valA=(a.title||'').toLowerCase();valB=(b.title||'').toLowerCase();break;
      case 'country':valA=(a.country||'zzz').toLowerCase();valB=(b.country||'zzz').toLowerCase();break;
      case 'technique':valA=(a.technique&&a.technique[0]||'zzz').toLowerCase();valB=(b.technique&&b.technique[0]||'zzz').toLowerCase();break;
      default:return 0;
    }
    if(valA<valB)return direction==='asc'?-1:1;
    if(valA>valB)return direction==='asc'?1:-1;
    return 0;
  });
}

function renderRow(f){
  const dec=f.year?Math.floor(f.year/10)*10:'';
  const dirLinks=getDirectorLinks(f);
  const stuLinks=getStudioLinks(f);
  return '<tr data-country="'+escHtml(f.country||'')+'" data-decade="'+dec+'" data-technique="'+escHtml((f.technique||[]).join(','))+'" data-watchable="'+(hasWatchLinksClient(f.watchLinks)?'true':'false')+'" data-subs="'+(f.hasSubtitles?'true':'false')+'" data-director="'+escHtml(f.director||'')+'">'+
    '<td><div class="table-year">'+(f.year||'—')+'</div><div class="table-country">'+getCC(f.country)+'</div></td>'+
    '<td><a href="films/'+slugify(f.title)+'-'+f.id.slice(0,8)+'.html" class="table-title">'+(escHtml(f.title)||'Untitled')+'</a>'+(f.original?'<div class="table-original">'+escHtml(f.original)+'</div>':'')+'</td>'+
    '<td class="table-meta">'+(dirLinks?'<strong>'+dirLinks+'</strong><br>':'')+stuLinks+'</td>'+
    '<td class="table-technique hide-mobile">'+((f.technique&&f.technique[0])?f.technique[0].toUpperCase():'—')+'</td>'+
    '<td class="table-runtime hide-mobile">'+(escHtml(f.runtime)||'—')+'</td>'+
    '<td class="hide-mobile"><span class="confidence-pips">'+confPips(f.confidence)+'</span></td>'+
    '<td class="watch-cell">'+(function(){
      const link=getBestLink(f.watchLinks);
      if(!link)return '<span class="no-link">—</span>';
      const gated=isGated(link);
      const cls=gated?'watch-btn watch-btn-gated':'watch-btn';
      // Gated rows surface the platform name as the verb so the user
      // knows what login/sub they would need ("Plex" / "Disney+" /
      // "Netflix") instead of the opaque "OPEN". Inline SVG lock to
      // dodge cross-OS emoji rendering.
      const lockSvg=gated?'<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>':'';
      const label=gated
        ?lockSvg+'<span class="watch-btn-platform">'+escHtml((link.platform||'OPEN').toUpperCase())+'</span>'
        :'▶ WATCH';
      const aria=gated
        ?'Open '+escHtml(f.title||'this film')+' on '+escHtml(link.platform||'platform')+' — sign-in or subscription may be required (opens in new tab)'
        :'Watch '+escHtml(f.title||'this film')+' (opens in new tab)';
      const subs=(!gated&&f.hasSubtitles)?'<span class="subs-badge">EN subs</span>':'';
      return '<a href="'+escHtml(link.url)+'" class="'+cls+'" target="_blank" rel="noopener" aria-label="'+aria+'">'+label+'</a>'+subs;
    })()+'</td></tr>';
}

function getFilteredFilms(){
  const term=searchInput.value.toLowerCase();
  const filtered=allFilms.filter(f=>{
    if(term){
      const t=(f.title||'').toLowerCase();
      const o=(f.original||'').toLowerCase();
      const d=(f.director||'').toLowerCase();
      const s=(f.studio||'').toLowerCase();
      const g=(f.genres||[]).join(' ').toLowerCase();
      // Keywords lazy-loaded — once keywordsCache is populated this
      // matches against them too. Until then, search just covers the
      // SSR'd fields (title/original/director/studio/genres). Search
      // input listener triggers loadKeywords() on first keystroke.
      const fk=keywordsCache[f.id]||[];
      const k=fk.length?fk.join(' ').toLowerCase():'';
      if(!t.includes(term)&&!o.includes(term)&&!d.includes(term)&&!s.includes(term)&&!g.includes(term)&&!k.includes(term))return false;
    }
    if(activeFilters.format&&f.format!==activeFilters.format)return false;
    if(activeFilters.country&&f.country!==activeFilters.country)return false;
    if(activeFilters.decade){const dec=f.year?Math.floor(f.year/10)*10:0;if(dec!=activeFilters.decade)return false;}
    if(activeFilters.technique&&!(f.technique||[]).includes(activeFilters.technique))return false;
    if(activeFilters.watchable&&!hasWatchLinksClient(f.watchLinks))return false;
    if(activeFilters.subtitles&&!f.hasSubtitles)return false;
    if(activeFilters.director){const dirs=(f.director||'').split(',').map(d=>d.trim());if(!dirs.includes(activeFilters.director))return false;}
    if(activeFilters.genre&&!(f.genres||[]).includes(activeFilters.genre))return false;
    if(activeFilters.keyword&&!(keywordsCache[f.id]||[]).includes(activeFilters.keyword))return false;
    if(activeFilters.platform){var pf=activeFilters.platform;var wl=f.watchLinks||[];if(!wl.some(function(l){return l&&l.platform===pf&&(isWatchable(l)||isGated(l));}))return false;}
    return true;
  });
  return sortFilms(filtered,currentSort.column,currentSort.direction);
}

function updateDisplay(resetPagination){
  const sorted=getFilteredFilms();
  const isFiltered=searchInput.value||Object.keys(activeFilters).length>0;
  const noResultsEl=document.getElementById('no-results');
  const noResultsDetail=document.getElementById('no-results-detail');
  const clearAllBtn=document.getElementById('clear-all-btn');
  if(resetPagination)loadedCount=BATCH_SIZE;
  if(isFiltered){
    if(sorted.length===0){
      tbody.innerHTML='';
      if(noResultsEl){
        noResultsEl.style.display='block';
        // Build detailed message about active filters
        const parts=[];
        if(searchInput.value)parts.push('search "'+searchInput.value+'"');
        Object.entries(activeFilters).forEach(([type,val])=>parts.push(type+': '+val));
        if(noResultsDetail){
          noResultsDetail.textContent=parts.length>0?'No films match '+parts.join(' + ')+'. Try removing some filters or broadening your search.':'Try adjusting your search or filters.';
        }
        if(clearAllBtn)clearAllBtn.style.display='inline-block';
      }
    }else{
      tbody.innerHTML=sorted.map(renderRow).join('');
      if(noResultsEl)noResultsEl.style.display='none';
    }
    if(loadMoreBtn)loadMoreBtn.style.display='none';
  }else{
    if(noResultsEl)noResultsEl.style.display='none';
    tbody.innerHTML=sorted.slice(0,loadedCount).map(renderRow).join('');
    if(loadMoreBtn){
      loadMoreBtn.style.display=loadedCount>=sorted.length?'none':'inline-block';
      const rem=sorted.length-loadedCount;
      loadMoreBtn.querySelector('.load-more-count').textContent='('+rem+' remaining)';
    }
  }
  resultsCount.textContent=sorted.length.toLocaleString()+' films';
  updateQueryDisplay();
  if(typeof updateActiveFiltersBar==='function')updateActiveFiltersBar();
}

function updateQueryDisplay(){
  const hasFilters=Object.keys(activeFilters).length>0;
  activeQueryBox.style.display=hasFilters?'block':'none';
  if(hasFilters){
    queryTags.innerHTML=Object.entries(activeFilters).map(([type,value])=>'<span class="query-tag">'+value+' <span class="remove" data-type="'+type+'" tabindex="0" role="button" aria-label="Remove '+value+' filter">×</span></span>').join('');
    queryTags.querySelectorAll('.remove').forEach(btn=>{
      const handler=function(){delete activeFilters[this.dataset.type];document.querySelectorAll('.filter-item.active').forEach(item=>{if(item.dataset.filterType===this.dataset.type)item.classList.remove('active')});updateDisplay();};
      btn.addEventListener('click',handler);
      btn.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();handler.call(this);}});
    });
  }
}

searchInput.addEventListener('input',function(){
  // Search needs the full catalog AND the lazy keywords map. Both kick
  // off in parallel; updateDisplay re-renders as each resolves. Until
  // catalog is ready, the SSR'd 50 rows stay visible — the user sees
  // their query reflected in the input but no row filtering yet.
  ensureCatalog().then(function(){if(searchInput.value)updateDisplay();});
  loadKeywords().then(function(){if(searchInput.value)updateDisplay();});
  if(catalogReady)updateDisplay();
});

filterItems.forEach(item=>{
  item.setAttribute('tabindex','0');
  item.setAttribute('role','option');
  const handler=function(){
    const type=this.dataset.filterType;
    let value=this.dataset.filterValue;
    if(type==='decade')value=parseInt(value.split('–')[0]);
    // Filtering needs the full catalog. The visual selected state
    // toggles immediately (instant feedback) but the row filtering
    // waits for ensureCatalog to resolve.
    ensureCatalog().then(updateDisplay);
    if(type==='keyword')loadKeywords().then(updateDisplay);
    if(activeFilters[type]===value){delete activeFilters[type];this.classList.remove('active');this.setAttribute('aria-selected','false');}
    else{filterItems.forEach(fi=>{if(fi.dataset.filterType===type){fi.classList.remove('active');fi.setAttribute('aria-selected','false');}});activeFilters[type]=value;this.classList.add('active');this.setAttribute('aria-selected','true');}
    if(catalogReady)updateDisplay();
  };
  item.addEventListener('click',handler);
  item.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();handler.call(this);}});
});

if(loadMoreBtn){
  loadMoreBtn.addEventListener('click',function(){
    const sorted=getFilteredFilms();
    const newCount=Math.min(loadedCount+BATCH_SIZE,sorted.length);
    const fragment=document.createDocumentFragment();
    for(let i=loadedCount;i<newCount;i++){
      const temp=document.createElement('template');
      temp.innerHTML=renderRow(sorted[i]);
      fragment.appendChild(temp.content.firstChild);
    }
    tbody.appendChild(fragment);
    loadedCount=newCount;
    this.dataset.loaded=loadedCount;
    updateDisplay();
  });
}

// Clear all filters button
const clearAllBtn=document.getElementById('clear-all-btn');
if(clearAllBtn){
  clearAllBtn.addEventListener('click',function(){
    searchInput.value='';
    activeFilters={};
    filterItems.forEach(item=>{item.classList.remove('active');item.setAttribute('aria-selected','false');});
    updateDisplay(true);
    clearAllBtn.style.display='none';
  });
}

// Check for ?director=X URL parameter and apply filter
const urlParams=new URLSearchParams(window.location.search);
const directorParam=urlParams.get('director');
if(directorParam){
  activeFilters.director=directorParam;
  updateDisplay();
}

// Random film function - respects active filters
function goToRandomFilm(){
  const filtered=getFilteredFilms();
  if(filtered.length===0)return;
  const randomFilm=filtered[Math.floor(Math.random()*filtered.length)];
  window.location.href='films/'+slugify(randomFilm.title)+'-'+randomFilm.id.slice(0,8)+'.html';
}

// Random film button in content header
const randomBtn=document.getElementById('random-film-btn');
if(randomBtn){randomBtn.addEventListener('click',goToRandomFilm);}

// Sortable column headers
const sortableHeaders=document.querySelectorAll('.sortable');
function updateSortIndicators(){
  sortableHeaders.forEach(th=>{
    const col=th.dataset.sort;
    const indicator=th.querySelector('.sort-indicator');
    if(col===currentSort.column){
      th.classList.add('active');
      indicator.textContent=currentSort.direction==='asc'?'▲':'▼';
      th.setAttribute('aria-sort',currentSort.direction==='asc'?'ascending':'descending');
    }else{
      th.classList.remove('active');
      indicator.textContent='';
      th.setAttribute('aria-sort','none');
    }
  });
}
sortableHeaders.forEach(th=>{
  th.style.cursor='pointer';
  const handler=function(){
    const col=th.dataset.sort;
    if(currentSort.column===col){
      currentSort.direction=currentSort.direction==='asc'?'desc':'asc';
    }else{
      currentSort.column=col;
      currentSort.direction=col==='year'?'desc':'asc';
    }
    updateSortIndicators();
    updateDisplay(true);
  };
  th.addEventListener('click',handler);
  th.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();handler();}
  });
});

// Footer random link
const footerRandomLink=document.getElementById('footer-random-link');
if(footerRandomLink){footerRandomLink.addEventListener('click',function(e){e.preventDefault();goToRandomFilm();});}

// Sticky header shadow
const thead=document.querySelector('.film-table thead');
if(thead){
  const observer=new IntersectionObserver(([e])=>thead.classList.toggle('is-sticky',e.intersectionRatio<1),{threshold:[1],rootMargin:'-1px 0px 0px 0px'});
  observer.observe(thead);
}

// Back to top button
const backBtn=document.querySelector('.back-to-top');
if(backBtn){
  window.addEventListener('scroll',()=>{backBtn.classList.toggle('visible',window.scrollY>300);});
  backBtn.addEventListener('click',()=>{window.scrollTo({top:0,behavior:'smooth'});});
}

// Keyboard shortcuts
document.addEventListener('keydown',(e)=>{
  if(e.target.matches('input,textarea,select'))return;
  switch(e.key){
    case '/':
      e.preventDefault();
      searchInput?.focus();
      break;
    case 'r':
      goToRandomFilm();
      break;
    case 'Escape':
      if(searchInput){searchInput.value='';searchInput.dispatchEvent(new Event('input'));}
      document.querySelectorAll('.filter-item.active').forEach(f=>f.click());
      break;
  }
});

// Collapsible sidebar sections
document.querySelectorAll('.collapsible-header').forEach(header=>{
  const toggle=function(){
    const content=header.nextElementSibling;
    const icon=header.querySelector('.collapse-icon');
    const isCollapsed=content.classList.toggle('collapsed');
    header.dataset.collapsed=isCollapsed;
    header.setAttribute('aria-expanded',String(!isCollapsed));
    if(icon)icon.textContent=isCollapsed?'▶':'▼';
  };
  header.addEventListener('click',toggle);
  header.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}
  });
});

// Mobile filter drawer
const sidebar=document.querySelector('.sidebar');
const sidebarOverlay=document.getElementById('sidebar-overlay');
const filterToggle=document.getElementById('mobile-filter-toggle');
const drawerClose=document.getElementById('drawer-close');
function openDrawer(){if(sidebar){sidebar.classList.add('open');if(sidebarOverlay)sidebarOverlay.classList.add('visible');document.body.style.overflow='hidden';}}
function closeDrawer(){if(sidebar){sidebar.classList.remove('open');if(sidebarOverlay)sidebarOverlay.classList.remove('visible');document.body.style.overflow='';}}
if(filterToggle)filterToggle.addEventListener('click',openDrawer);
if(drawerClose)drawerClose.addEventListener('click',closeDrawer);
if(sidebarOverlay)sidebarOverlay.addEventListener('click',closeDrawer);

// Active filters bar (visible on mobile)
const activeFiltersBar=document.getElementById('active-filters-bar');
function updateActiveFiltersBar(){
  if(!activeFiltersBar)return;
  const keys=Object.keys(activeFilters);
  if(keys.length===0){activeFiltersBar.classList.remove('has-filters');return;}
  activeFiltersBar.classList.add('has-filters');
  let html='<span class="active-filters-label">Filtered:</span>';
  keys.forEach(type=>{
    html+='<span class="active-filter-tag">'+activeFilters[type]+' <span class="remove" data-type="'+type+'" tabindex="0" role="button" aria-label="Remove filter">×</span></span>';
  });
  html+='<button class="clear-filters-btn" id="clear-filters-btn2">Clear all</button>';
  activeFiltersBar.innerHTML=html;
  activeFiltersBar.querySelectorAll('.remove').forEach(btn=>{
    btn.addEventListener('click',function(){delete activeFilters[this.dataset.type];document.querySelectorAll('.filter-item.active').forEach(item=>{if(item.dataset.filterType===this.dataset.type)item.classList.remove('active')});updateDisplay();});
  });
  const clearBtn2=document.getElementById('clear-filters-btn2');
  if(clearBtn2)clearBtn2.addEventListener('click',function(){activeFilters={};document.querySelectorAll('.filter-item.active').forEach(item=>{item.classList.remove('active');item.setAttribute('aria-selected','false')});updateDisplay();});
  // Update filter toggle badge
  if(filterToggle){filterToggle.innerHTML='FILTERS'+(keys.length>0?'<span class="filter-badge">'+keys.length+'</span>':'');}
}
updateActiveFiltersBar();

// ===== URL ?q= param → search prefill =====
// Lets the 404 page's search form (and any future external link) deep-
// link into a filtered catalog. e.g. /?q=spirited+away lands here with
// the search box pre-populated and results filtered. Cleans the URL on
// load so a refresh or share doesn't re-trigger.
(function(){
  if (!searchInput) return;
  try {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && q.length > 0) {
      searchInput.value = q;
      searchInput.dispatchEvent(new Event('input'));
      // Strip the param from the URL so a refresh doesn't re-fire.
      // Keeps the rest of the URL (e.g. fragments) intact.
      if (window.history && window.history.replaceState) {
        params.delete('q');
        var qs = params.toString();
        var newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    }
  } catch (e) { /* malformed URL — ignore */ }
})();

// ===== Film of the Day — daily client rotation =====
// The SSR card is the build-day pick. If the user's local date differs
// from the build date (which it will for most visitors most of the time
// — builds happen at most once per day, and only on a Notion data diff),
// recompute today's deterministic index from window.ALL_FILMS_DATA and
// swap the card. Same seed algorithm as the server (build-site.js
// dateSeed()) so server and client agree on build day.
//
// Self-healing: works even if the cron has been failing for weeks. As
// long as ALL_FILMS_DATA loads, the user always sees a film selected
// for their local calendar date.
// Hoisted to a named function so ensureCatalog().onload can re-fire it
// once the catalog actually arrives. Initial call below runs immediately;
// no-ops gracefully if catalog hasn't loaded yet.
function rotateFilmOfDay(){
  if(!Array.isArray(allFilms)||allFilms.length===0)return;
  const mount=document.getElementById('film-of-day-mount');
  if(!mount)return;
  const buildDate=mount.dataset.buildDate;
  const t=new Date();
  const todayKey=t.getFullYear()+'-'+
    String(t.getMonth()+1).padStart(2,'0')+'-'+
    String(t.getDate()).padStart(2,'0');
  if(todayKey===buildDate)return; // SSR card is correct, no swap needed
  const seed=t.getFullYear()*10000+(t.getMonth()+1)*100+t.getDate();
  const film=allFilms[seed%allFilms.length];
  if(!film)return;
  const url='films/'+slugify(film.title)+'-'+film.id.slice(0,8)+'.html';
  const techniques=(film.technique||[]).join(', ')||'Unknown';
  const link=getBestLink(film.watchLinks);
  let watchHtml='';
  if(link){
    const gated=isGated(link);
    // Surface the platform name in the gated CTA so the user knows what
    // they'd be signing into. Lock SVG is inline to avoid the cross-OS
    // emoji-rendering inconsistency (gold on Apple, grey on Windows, etc).
    const lockSvg='<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0;margin-right:4px"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>';
    const label=gated
      ?lockSvg+'Open on '+escHtml(link.platform||'platform')
      :'▶ Watch';
    const aria=gated
      ?'Open '+escHtml(film.title||'Film of the Day')+' on '+escHtml(link.platform||'platform')+' — sign-in or subscription may be required (opens in new tab)'
      :'Watch '+escHtml(film.title||'Film of the Day')+' (opens in new tab)';
    const cls=gated?'film-of-day-watch-btn film-of-day-watch-btn-gated':'film-of-day-watch-btn';
    watchHtml='<a href="'+escHtml(link.url)+'" class="'+cls+'" target="_blank" rel="noopener" aria-label="'+aria+'">'+label+'</a>';
  }
  // Note: synopsis is intentionally omitted — the slim client catalog
  // doesn't carry synopsis to keep films-index.js small. The SSR card
  // has it; the client-rotated card trades synopsis for freshness.
  mount.innerHTML='<div class="film-of-day">'+
    '<div class="film-of-day-header">'+
      '<span class="film-of-day-label">Film of the Day</span>'+
      '<span class="film-of-day-date">'+todayKey+'</span>'+
    '</div>'+
    '<div class="film-of-day-content">'+
      '<div class="film-of-day-info">'+
        '<a href="'+url+'" class="film-of-day-title">'+(escHtml(film.title)||'Untitled')+'</a>'+
        '<div class="film-of-day-meta">'+
          '<span class="film-of-day-year">'+(film.year||'?')+'</span>'+
          '<span class="film-of-day-country">'+getCC(film.country)+'</span>'+
          '<span class="film-of-day-technique">'+escHtml(techniques)+'</span>'+
        '</div>'+
      '</div>'+
      '<div class="film-of-day-actions">'+
        watchHtml+
      '</div>'+
    '</div>'+
  '</div>';
}
rotateFilmOfDay();
});`;
}

// JSON-LD for country collection pages
function generateCountryJsonLd(country, countryFilms) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${country} Animation — Global Animation Archive`,
    "description": `Explore ${countryFilms.length} animated films from ${country}. Part of the Global Animation Archive's comprehensive database of world animation.`,
    "url": `${SITE_URL}/countries/${slugify(country)}.html`,
    "numberOfItems": countryFilms.length,
    "isPartOf": {
      "@type": "WebSite",
      "name": "Global Animation Archive",
      "url": SITE_URL
    },
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  });
}

function generateCountryPage(country, countryFilms) {
  // Sort by year descending
  countryFilms.sort((a, b) => (b.year || 0) - (a.year || 0));

  // Calculate stats
  const techniques = {};
  const decades = {};
  const formats = {};
  let watchable = 0;
  let withSubs = 0;

  for (const film of countryFilms) {
    for (const t of film.technique || []) {
      techniques[t] = (techniques[t] || 0) + 1;
    }
    if (film.year) {
      const dec = Math.floor(film.year / 10) * 10;
      decades[dec] = (decades[dec] || 0) + 1;
    }
    if (film.format) {
      formats[film.format] = (formats[film.format] || 0) + 1;
    }
    if (hasWatchLinks(film)) watchable++;
    if (film.hasSubtitles) withSubs++;
  }

  const techniquesSorted = Object.entries(techniques).sort((a, b) => b[1] - a[1]);
  const decadesSorted = Object.entries(decades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const formatsSorted = Object.entries(formats).sort((a, b) => b[1] - a[1]);

  const countryCode = getCountryCode(country);
  const description = `Explore ${countryFilms.length} animated films from ${country}. Discover ${techniquesSorted[0]?.[0] || 'various'} animation and more from the Global Animation Archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(country)} Animation — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/countries/${slugify(country)}.html">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(country)} Animation — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/countries/${slugify(country)}.html">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(country)} Animation">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateCountryJsonLd(country, countryFilms)}</script>

${FONT_HEAD}
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
  { label: 'Countries', url: 'countries/index.html' },
  { label: escapeHtml(country) }
], '../')}
<main class="country-page" id="main-content">
  <div class="country-header">
    <div class="country-code-block"><span class="country-code-large">${countryCode}</span></div>
    <div class="country-title-section">
      <h1 class="country-name">${escapeHtml(country)}</h1>
      <p class="country-subtitle">${countryFilms.length} films in the archive</p>
    </div>
    <nav class="country-nav" aria-label="Country navigation">
      <a href="index.html" class="country-back-link">← All Countries</a>
    </nav>
  </div>

  <div class="country-stats-grid">
    <div class="country-stat-card">
      <div class="stat-card-title">Total Films</div>
      <div class="stat-card-value">${countryFilms.length}</div>
    </div>
    <div class="country-stat-card">
      <div class="stat-card-title">Watchable</div>
      <div class="stat-card-value">${watchable}</div>
      <div class="stat-card-detail">${withSubs} with EN subs</div>
    </div>
    <div class="country-stat-card">
      <div class="stat-card-title">Techniques</div>
      <div class="stat-card-list">${techniquesSorted.slice(0, 5).map(([t, c]) => `<span class="stat-tag">${escapeHtml(t)} <em>(${c})</em></span>`).join('')}</div>
    </div>
    <div class="country-stat-card">
      <div class="stat-card-title">Decades</div>
      <div class="stat-card-list">${decadesSorted.map(([d, c]) => `<span class="stat-tag">${d}s <em>(${c})</em></span>`).join('')}</div>
    </div>
    <div class="country-stat-card">
      <div class="stat-card-title">Formats</div>
      <div class="stat-card-list">${formatsSorted.map(([f, c]) => `<span class="stat-tag">${escapeHtml(f)} <em>(${c})</em></span>`).join('')}</div>
    </div>
  </div>

  <section class="country-films-section">
    <h2 class="section-title">All Films from ${escapeHtml(country)}</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead>
          <tr>
            <th scope="col" style="width:90px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
            <th scope="col" style="width:70px" class="hide-mobile">Runtime</th>
            <th scope="col" style="width:90px" class="hide-mobile">Confidence</th>
            <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
          </tr>
        </thead>
        <tbody>${generateTableRows(countryFilms, '../')}</tbody>
      </table>
    </div>
  </section>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateCountryIndexPage(countriesWithFilms) {
  const sortedCountries = Object.entries(countriesWithFilms)
    .sort((a, b) => b[1].length - a[1].length);

  const totalCountries = sortedCountries.length;
  const description = `Browse animated films from ${totalCountries} countries. Explore the Global Animation Archive's comprehensive collection organized by country of origin.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Countries — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/countries/">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Countries — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/countries/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Countries — Global Animation Archive">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Countries — Global Animation Archive",
    "description": description,
    "url": `${SITE_URL}/countries/`,
    "numberOfItems": totalCountries,
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  })}</script>

${FONT_HEAD}
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
  { label: 'Countries' }
], '../')}
<main class="countries-index" id="main-content">
  <div class="countries-header">
    <h1>Countries</h1>
    <p class="countries-subtitle">Explore ${totalCountries} countries with animated films in the archive</p>
  </div>

  <div class="countries-grid">
    ${sortedCountries.map(([country, countryFilms]) => {
      const techniques = {};
      for (const film of countryFilms) {
        for (const t of film.technique || []) {
          techniques[t] = (techniques[t] || 0) + 1;
        }
      }
      const topTechnique = Object.entries(techniques).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Various';
      const years = countryFilms.filter(f => f.year).map(f => f.year);
      const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—';

      return `<a href="${slugify(country)}.html" class="country-card">
      <div class="country-card-code">${getCountryCode(country)}</div>
      <div class="country-card-info">
        <h2 class="country-card-name">${escapeHtml(country)}</h2>
        <div class="country-card-meta">
          <span class="country-card-count">${countryFilms.length} films</span>
          <span class="country-card-years">${yearRange}</span>
        </div>
        <div class="country-card-technique">${escapeHtml(topTechnique)}</div>
      </div>
    </a>`;
    }).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

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

  let count = 0;
  for (const [country, countryFilms] of Object.entries(countriesWithFilms)) {
    const slug = slugify(country);
    writeFileSync(`./dist/countries/${slug}.html`, generateCountryPage(country, [...countryFilms]));
    count++;
  }

  // Generate index page
  writeFileSync('./dist/countries/index.html', generateCountryIndexPage(countriesWithFilms));

  return { count, countriesWithFilms };
}

// JSON-LD for technique collection pages
function generateTechniqueJsonLd(technique, techniqueFilms) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${technique} Animation — Global Animation Archive`,
    "description": `Explore ${techniqueFilms.length} ${technique.toLowerCase()} animated films. ${techniqueDescriptions[technique] || ''} Part of the Global Animation Archive.`,
    "url": `${SITE_URL}/techniques/${slugify(technique)}.html`,
    "numberOfItems": techniqueFilms.length,
    "isPartOf": {
      "@type": "WebSite",
      "name": "Global Animation Archive",
      "url": SITE_URL
    },
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  });
}

function generateTechniquePage(technique, techniqueFilms) {
  // Sort by year descending
  techniqueFilms.sort((a, b) => (b.year || 0) - (a.year || 0));

  // Calculate stats
  const countries = {};
  const decades = {};
  const formats = {};
  let watchable = 0;
  let withSubs = 0;

  for (const film of techniqueFilms) {
    if (film.country) {
      countries[film.country] = (countries[film.country] || 0) + 1;
    }
    if (film.year) {
      const dec = Math.floor(film.year / 10) * 10;
      decades[dec] = (decades[dec] || 0) + 1;
    }
    if (film.format) {
      formats[film.format] = (formats[film.format] || 0) + 1;
    }
    if (hasWatchLinks(film)) watchable++;
    if (film.hasSubtitles) withSubs++;
  }

  const countriesSorted = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  const decadesSorted = Object.entries(decades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const formatsSorted = Object.entries(formats).sort((a, b) => b[1] - a[1]);

  const techniqueDesc = techniqueDescriptions[technique] || 'A distinctive animation technique';
  const description = `Explore ${techniqueFilms.length} ${technique.toLowerCase()} animated films. ${techniqueDesc}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(technique)} Animation — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/techniques/${slugify(technique)}.html">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(technique)} Animation — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/techniques/${slugify(technique)}.html">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(technique)} Animation">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateTechniqueJsonLd(technique, techniqueFilms)}</script>

${FONT_HEAD}
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
  { label: 'Techniques', url: 'techniques/index.html' },
  { label: escapeHtml(technique) }
], '../')}
<main class="technique-page" id="main-content">
  <div class="technique-header">
    <div class="technique-title-section">
      <h1 class="technique-name">${escapeHtml(technique)}</h1>
      <p class="technique-description">${escapeHtml(techniqueDesc)}</p>
      <p class="technique-subtitle">${techniqueFilms.length} films in the archive</p>
    </div>
    <nav class="technique-nav" aria-label="Technique navigation">
      <a href="index.html" class="technique-back-link">← All Techniques</a>
    </nav>
  </div>

  <div class="technique-stats-grid">
    <div class="technique-stat-card">
      <div class="stat-card-title">Total Films</div>
      <div class="stat-card-value">${techniqueFilms.length}</div>
    </div>
    <div class="technique-stat-card">
      <div class="stat-card-title">Watchable</div>
      <div class="stat-card-value">${watchable}</div>
      <div class="stat-card-detail">${withSubs} with EN subs</div>
    </div>
    <div class="technique-stat-card">
      <div class="stat-card-title">Top Countries</div>
      <div class="stat-card-list">${countriesSorted.slice(0, 10).map(([c, n]) => `<span class="stat-tag">${escapeHtml(c)} <em>(${n})</em></span>`).join('')}</div>
    </div>
    <div class="technique-stat-card">
      <div class="stat-card-title">Decades</div>
      <div class="stat-card-list">${decadesSorted.map(([d, c]) => `<span class="stat-tag">${d}s <em>(${c})</em></span>`).join('')}</div>
    </div>
    <div class="technique-stat-card">
      <div class="stat-card-title">Formats</div>
      <div class="stat-card-list">${formatsSorted.map(([f, c]) => `<span class="stat-tag">${escapeHtml(f)} <em>(${c})</em></span>`).join('')}</div>
    </div>
  </div>

  <section class="technique-films-section">
    <h2 class="section-title">All ${escapeHtml(technique)} Films</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead>
          <tr>
            <th scope="col" style="width:90px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px" class="hide-mobile">Country</th>
            <th scope="col" style="width:70px" class="hide-mobile">Runtime</th>
            <th scope="col" style="width:90px" class="hide-mobile">Confidence</th>
            <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
          </tr>
        </thead>
        <tbody>${generateTechniqueTableRows(techniqueFilms)}</tbody>
      </table>
    </div>
  </section>
</main>
${generateFooter('../')}
</body></html>`;
}

// Table rows for technique pages (shows country instead of technique)
function generateTechniqueTableRows(filmList) {
  return filmList.map(film => {
    const directorHtml = getDirectorLink(film, '../');
    const studioHtml = getStudioLink(film, '../');
    return `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-watchable="${isAccessible(film) ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div></td>
      <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${directorHtml ? `<strong>${directorHtml}</strong><br>` : ''}${studioHtml}</td>
      <td class="table-country-cell hide-mobile"><span class="table-country-code">${getCountryCode(film.country)}</span><span class="table-country-name">${escapeHtml(film.country) || '—'}</span></td>
      <td class="table-runtime hide-mobile">${escapeHtml(film.runtime) || '—'}</td>
      <td class="hide-mobile"><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${renderWatchCell(film)}</td>
    </tr>`;
  }).join('\n');
}

function generateTechniqueIndexPage(techniquesWithFilms) {
  const sortedTechniques = Object.entries(techniquesWithFilms)
    .sort((a, b) => b[1].length - a[1].length);

  const totalTechniques = sortedTechniques.length;
  const description = `Explore ${totalTechniques} animation techniques from around the world. From traditional cel animation to experimental approaches.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Techniques — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/techniques/">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Techniques — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/techniques/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Techniques — Global Animation Archive">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Techniques — Global Animation Archive",
    "description": description,
    "url": `${SITE_URL}/techniques/`,
    "numberOfItems": totalTechniques,
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  })}</script>

${FONT_HEAD}
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
  { label: 'Techniques' }
], '../')}
<main class="techniques-index" id="main-content">
  <div class="techniques-header">
    <h1>Techniques</h1>
    <p class="techniques-subtitle">Explore ${totalTechniques} animation techniques from around the world</p>
  </div>

  <div class="techniques-grid">
    ${sortedTechniques.map(([technique, techniqueFilms]) => {
      const years = techniqueFilms.filter(f => f.year).map(f => f.year);
      const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—';
      const desc = techniqueDescriptions[technique] || 'A distinctive animation technique';

      return `<a href="${slugify(technique)}.html" class="technique-card">
      <div class="technique-card-info">
        <h2 class="technique-card-name">${escapeHtml(technique)}</h2>
        <p class="technique-card-desc">${escapeHtml(desc)}</p>
        <div class="technique-card-meta">
          <span class="technique-card-count">${techniqueFilms.length} films</span>
          <span class="technique-card-years">${yearRange}</span>
        </div>
      </div>
    </a>`;
    }).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateTechniquePages() {
  const techniquesWithFilms = {};

  // Group films by technique (a film can have multiple techniques)
  for (const film of films) {
    for (const technique of film.technique || []) {
      if (!techniquesWithFilms[technique]) {
        techniquesWithFilms[technique] = [];
      }
      techniquesWithFilms[technique].push(film);
    }
  }

  // Generate a page for each technique
  mkdirSync('./dist/techniques', { recursive: true });

  let count = 0;
  for (const [technique, techniqueFilms] of Object.entries(techniquesWithFilms)) {
    const slug = slugify(technique);
    writeFileSync(`./dist/techniques/${slug}.html`, generateTechniquePage(technique, [...techniqueFilms]));
    count++;
  }

  // Generate index page
  writeFileSync('./dist/techniques/index.html', generateTechniqueIndexPage(techniquesWithFilms));

  return { count, techniquesWithFilms };
}

// Director Index Page - groups directors alphabetically with film counts
function generateDirectorIndexPage(directorsData) {
  // directorsData is an array of { name, films: [...], countries: Set }
  const sortedDirectors = [...directorsData].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  // Group by first letter
  const byLetter = {};
  for (const director of sortedDirectors) {
    const firstChar = director.name.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
    if (!byLetter[letter]) byLetter[letter] = [];
    byLetter[letter].push(director);
  }

  const letters = Object.keys(byLetter).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  const totalDirectors = sortedDirectors.length;
  const totalFilms = sortedDirectors.reduce((sum, d) => sum + d.films.length, 0);
  const avgFilms = (totalFilms / totalDirectors).toFixed(1);

  const description = `Browse ${totalDirectors} directors from the Global Animation Archive. Alphabetical listing with film counts and primary countries.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Directors — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/directors/">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Directors — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/directors/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Directors — Global Animation Archive">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Directors — Global Animation Archive",
    "description": description,
    "url": `${SITE_URL}/directors/`,
    "numberOfItems": totalDirectors,
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  })}</script>

${FONT_HEAD}
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
  { label: 'Directors' }
], '../')}
<main class="directors-index" id="main-content">
  <div class="directors-header">
    <h1>Directors</h1>
    <p class="directors-subtitle">Browse ${totalDirectors} directors in the archive</p>
  </div>

  <div class="directors-stats">
    <div class="directors-stat"><span class="stat-value">${totalDirectors}</span><span class="stat-label">Directors</span></div>
    <div class="directors-stat"><span class="stat-value">${avgFilms}</span><span class="stat-label">Avg Films/Director</span></div>
  </div>

  <nav class="directors-alphabet" aria-label="Jump to letter">
    ${letters.map(letter => `<a href="#letter-${letter}" class="alphabet-link">${letter}</a>`).join('')}
  </nav>

  <div class="directors-list">
    ${letters.map(letter => `
    <section class="directors-letter-section" id="letter-${letter}">
      <h2 class="letter-heading">${letter}</h2>
      <div class="directors-grid">
        ${byLetter[letter].map(director => {
          const countryCodes = [...director.countries].slice(0, 3).map(c => getCountryCode(c)).join(', ');
          // Check if there's a director detail page for this name
          const matchedDirector = directorsByName.get(director.name.toLowerCase().trim());
          // Use just filename since we're already in /directors/
          const href = matchedDirector
            ? `${slugify(matchedDirector.name)}-${matchedDirector.id.slice(0,8)}.html`
            : `../index.html?director=${encodeURIComponent(director.name)}`;
          return `<a href="${href}" class="director-card">
          <span class="director-name">${escapeHtml(director.name)}</span>
          <span class="director-meta">
            <span class="director-count">${director.films.length} film${director.films.length !== 1 ? 's' : ''}</span>
            <span class="director-countries">${countryCodes}</span>
          </span>
        </a>`;
        }).join('\n        ')}
      </div>
    </section>`).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateDirectorPages() {
  // Parse directors: handle multiple directors (comma-separated), normalize names
  const directorsMap = new Map(); // name -> { name, films: [], countries: Set }

  for (const film of films) {
    if (!film.director) continue;

    // Split by comma and normalize each name
    const directorNames = film.director.split(',').map(d => d.trim()).filter(d => d.length > 0);

    for (const name of directorNames) {
      if (!directorsMap.has(name)) {
        directorsMap.set(name, { name, films: [], countries: new Set() });
      }
      const directorData = directorsMap.get(name);
      directorData.films.push(film);
      if (film.country) {
        directorData.countries.add(film.country);
      }
    }
  }

  const directorsData = Array.from(directorsMap.values());

  // Generate directory and index page
  mkdirSync('./dist/directors', { recursive: true });
  writeFileSync('./dist/directors/index.html', generateDirectorIndexPage(directorsData));

  return { count: directorsData.length };
}

// JSON-LD for decade collection pages
function generateDecadeJsonLd(decade, decadeFilms) {
  const decadeLabel = `${decade}s`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${decadeLabel} Animation — Global Animation Archive`,
    "description": `Explore ${decadeFilms.length} animated films from the ${decadeLabel}. ${decadeDescriptions[decade] || ''} Part of the Global Animation Archive.`,
    "url": `${SITE_URL}/decades/${decade}s.html`,
    "numberOfItems": decadeFilms.length,
    "isPartOf": {
      "@type": "WebSite",
      "name": "Global Animation Archive",
      "url": SITE_URL
    },
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  });
}

// Table rows for decade pages (shows country instead of year in first column)
function generateDecadeTableRows(filmList) {
  return filmList.map(film => {
    const directorHtml = getDirectorLink(film, '../');
    const studioHtml = getStudioLink(film, '../');
    return `
    <tr data-country="${escapeHtml(film.country || '')}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${isAccessible(film) ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div></td>
      <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${directorHtml ? `<strong>${directorHtml}</strong><br>` : ''}${studioHtml}</td>
      <td class="table-country-cell hide-mobile"><span class="table-country-code">${getCountryCode(film.country)}</span><span class="table-country-name">${escapeHtml(film.country) || '—'}</span></td>
      <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td class="hide-mobile"><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${renderWatchCell(film)}</td>
    </tr>`;
  }).join('\n');
}

function generateDecadePage(decade, decadeFilms) {
  // Sort by year ascending, then by title
  decadeFilms.sort((a, b) => {
    const yearDiff = (a.year || 0) - (b.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return (a.titleEnglish || '').localeCompare(b.titleEnglish || '');
  });

  // Calculate stats
  const countries = {};
  const techniques = {};
  const formats = {};
  let watchable = 0;
  let withSubs = 0;

  for (const film of decadeFilms) {
    if (film.country) {
      countries[film.country] = (countries[film.country] || 0) + 1;
    }
    for (const t of film.technique || []) {
      techniques[t] = (techniques[t] || 0) + 1;
    }
    if (film.format) {
      formats[film.format] = (formats[film.format] || 0) + 1;
    }
    if (hasWatchLinks(film)) watchable++;
    if (film.hasSubtitles) withSubs++;
  }

  const countriesSorted = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  const techniquesSorted = Object.entries(techniques).sort((a, b) => b[1] - a[1]);
  const formatsSorted = Object.entries(formats).sort((a, b) => b[1] - a[1]);

  const decadeLabel = `${decade}s`;
  const decadeRange = `${decade}–${decade + 9}`;
  const decadeDesc = decadeDescriptions[decade] || 'A decade in animation history';
  const description = `Explore ${decadeFilms.length} animated films from the ${decadeLabel}. ${decadeDesc}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${decadeLabel} Animation — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/decades/${decade}s.html">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="${decadeLabel} Animation — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/decades/${decade}s.html">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${decadeLabel} Animation">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateDecadeJsonLd(decade, decadeFilms)}</script>

${FONT_HEAD}
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
  { label: 'Decades', url: 'decades/index.html' },
  { label: decadeLabel }
], '../')}
<main class="decade-page" id="main-content">
  <div class="decade-header">
    <div class="decade-title-section">
      <h1 class="decade-name">${decadeLabel}</h1>
      <p class="decade-range">${decadeRange}</p>
      <p class="decade-description">${escapeHtml(decadeDesc)}</p>
      <p class="decade-subtitle">${decadeFilms.length} films in the archive</p>
    </div>
    <nav class="decade-nav" aria-label="Decade navigation">
      <a href="index.html" class="decade-back-link">← All Decades</a>
    </nav>
  </div>

  <div class="decade-stats-grid">
    <div class="decade-stat-card">
      <div class="stat-card-title">Total Films</div>
      <div class="stat-card-value">${decadeFilms.length}</div>
    </div>
    <div class="decade-stat-card">
      <div class="stat-card-title">Watchable</div>
      <div class="stat-card-value">${watchable}</div>
      <div class="stat-card-detail">${withSubs} with EN subs</div>
    </div>
    <div class="decade-stat-card">
      <div class="stat-card-title">Top Countries</div>
      <div class="stat-card-list">${countriesSorted.slice(0, 10).map(([c, n]) => `<span class="stat-tag">${escapeHtml(c)} <em>(${n})</em></span>`).join('')}</div>
    </div>
    <div class="decade-stat-card">
      <div class="stat-card-title">Techniques</div>
      <div class="stat-card-list">${techniquesSorted.slice(0, 8).map(([t, c]) => `<span class="stat-tag">${escapeHtml(t)} <em>(${c})</em></span>`).join('')}</div>
    </div>
    <div class="decade-stat-card">
      <div class="stat-card-title">Formats</div>
      <div class="stat-card-list">${formatsSorted.map(([f, c]) => `<span class="stat-tag">${escapeHtml(f)} <em>(${c})</em></span>`).join('')}</div>
    </div>
  </div>

  <section class="decade-films-section">
    <h2 class="section-title">All Films from the ${decadeLabel}</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead>
          <tr>
            <th scope="col" style="width:70px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px" class="hide-mobile">Country</th>
            <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
            <th scope="col" style="width:90px" class="hide-mobile">Confidence</th>
            <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
          </tr>
        </thead>
        <tbody>${generateDecadeTableRows(decadeFilms)}</tbody>
      </table>
    </div>
  </section>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateDecadeIndexPage(decadesWithFilms) {
  const sortedDecades = Object.entries(decadesWithFilms)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  const totalDecades = sortedDecades.length;
  const totalFilms = sortedDecades.reduce((sum, [, films]) => sum + films.length, 0);
  const description = `Explore ${totalFilms} animated films across ${totalDecades} decades of animation history, from the pioneering 1900s to today.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Decades — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/decades/">
${FAVICON}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Decades — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/decades/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${OG_IMAGE}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Decades — Global Animation Archive">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Decades — Global Animation Archive",
    "description": description,
    "url": `${SITE_URL}/decades/`,
    "numberOfItems": totalDecades,
    "publisher": {
      "@type": "Organization",
      "name": "Global Animation Archive"
    },
    "dateModified": BUILD_TIMESTAMP
  })}</script>

${FONT_HEAD}
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
  { label: 'Decades' }
], '../')}
<main class="decades-index" id="main-content">
  <div class="decades-header">
    <h1>Decades</h1>
    <p class="decades-subtitle">A timeline of animation history — ${totalDecades} decades, ${totalFilms} films</p>
  </div>

  <div class="decades-timeline">
    ${sortedDecades.map(([decade, decadeFilms]) => {
      const countries = {};
      for (const film of decadeFilms) {
        if (film.country) {
          countries[film.country] = (countries[film.country] || 0) + 1;
        }
      }
      const topCountry = Object.entries(countries).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Various';
      const desc = decadeDescriptions[parseInt(decade)] || '';

      return `<a href="${decade}s.html" class="decade-card">
      <div class="decade-card-year">${decade}s</div>
      <div class="decade-card-info">
        <h2 class="decade-card-title">${decade}–${parseInt(decade) + 9}</h2>
        <p class="decade-card-desc">${escapeHtml(desc)}</p>
        <div class="decade-card-meta">
          <span class="decade-card-count">${decadeFilms.length} films</span>
          <span class="decade-card-country">Top: ${escapeHtml(topCountry)}</span>
        </div>
      </div>
    </a>`;
    }).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateDecadePages() {
  const decadesWithFilms = {};

  // Group films by decade
  for (const film of films) {
    if (!film.year) continue;
    const decade = Math.floor(film.year / 10) * 10;
    if (!decadesWithFilms[decade]) {
      decadesWithFilms[decade] = [];
    }
    decadesWithFilms[decade].push(film);
  }

  // Generate a page for each decade
  mkdirSync('./dist/decades', { recursive: true });

  let count = 0;
  for (const [decade, decadeFilms] of Object.entries(decadesWithFilms)) {
    writeFileSync(`./dist/decades/${decade}s.html`, generateDecadePage(parseInt(decade), [...decadeFilms]));
    count++;
  }

  // Generate index page
  writeFileSync('./dist/decades/index.html', generateDecadeIndexPage(decadesWithFilms));

  return { count, decadesWithFilms };
}

// ===================== STUDIO PAGES =====================
function generateStudioPage(studio) {
  // Get films for this studio
  const studioFilms = films.filter(f =>
    (f.studioEntities && f.studioEntities.some(s => s.id === studio.id)) ||
    (f.studio && f.studio.toLowerCase().includes(studio.name.toLowerCase()))
  ).sort((a, b) => (a.year || 0) - (b.year || 0));

  const filmCount = studioFilms.length;
  const yearRange = studioFilms.length > 0 ?
    `${Math.min(...studioFilms.filter(f => f.year).map(f => f.year))}–${Math.max(...studioFilms.filter(f => f.year).map(f => f.year))}` : '';

  const statusText = studio.closed ? `${studio.founded || '?'} – ${studio.closed}` :
    studio.active ? `${studio.founded || '?'} – Present (Active)` :
    studio.founded ? `Founded ${studio.founded}` : '';

  const description = `${studio.name} animation studio from ${studio.country || 'Unknown'}. ${filmCount} films in the archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(studio.name)} — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/${getStudioUrl(studio)}">
${FAVICON}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(studio.name)} — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/${getStudioUrl(studio)}">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:image" content="${OG_IMAGE}">
${FONT_HEAD}
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
  { label: 'Studios', url: 'studios/index.html' },
  { label: escapeHtml(studio.name) }
], '../')}
<main class="entity-page studio-page" id="main-content">
  <div class="entity-header">
    <div class="entity-title-section">
      <h1 class="entity-name">${escapeHtml(studio.name)}</h1>
      ${studio.country ? `<p class="entity-subtitle">${escapeHtml(studio.country)}</p>` : ''}
      ${statusText ? `<p class="entity-dates">${statusText}</p>` : ''}
    </div>
    <nav class="entity-nav">
      <a href="index.html" class="entity-back-link">← All Studios</a>
    </nav>
  </div>

  ${studio.significance ? `<div class="entity-description"><p>${escapeHtml(studio.significance)}</p></div>` : ''}

  <div class="entity-meta-grid">
    ${studio.notableTechniques && studio.notableTechniques.length > 0 ? `
    <div class="entity-meta-card">
      <div class="meta-card-title">Notable Techniques</div>
      <div class="meta-card-tags">${studio.notableTechniques.map(t => `<span class="meta-tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="entity-meta-card">
      <div class="meta-card-title">Films in Archive</div>
      <div class="meta-card-value">${filmCount}</div>
      ${yearRange ? `<div class="meta-card-detail">${yearRange}</div>` : ''}
    </div>
  </div>

  ${(() => {
    // Get directors who've worked with this studio
    const workedWithDirectors = new Map();
    studioFilms.forEach(film => {
      if (film.directorEntities) {
        film.directorEntities.forEach(d => {
          const director = directorMap.get(d.id);
          if (director && !workedWithDirectors.has(d.id)) {
            workedWithDirectors.set(d.id, { director, count: 0 });
          }
          if (workedWithDirectors.has(d.id)) {
            workedWithDirectors.get(d.id).count++;
          }
        });
      } else if (film.director) {
        film.director.split(',').map(n => n.trim()).forEach(name => {
          const matchedDirector = directorsByName.get(name.toLowerCase());
          if (matchedDirector && !workedWithDirectors.has(matchedDirector.id)) {
            workedWithDirectors.set(matchedDirector.id, { director: matchedDirector, count: 0 });
          }
          if (matchedDirector && workedWithDirectors.has(matchedDirector.id)) {
            workedWithDirectors.get(matchedDirector.id).count++;
          }
        });
      }
    });
    const directorsList = [...workedWithDirectors.values()].sort((a, b) => b.count - a.count);
    if (directorsList.length === 0) return '';
    return `
  <div class="entity-collaborators">
    <h3>Directors</h3>
    <div class="collaborator-tags">
      ${directorsList.map(({ director, count }) => `<a href="../${getDirectorUrl(director)}" class="collaborator-tag">${escapeHtml(director.name)} <span class="collab-count">(${count})</span></a>`).join('')}
    </div>
  </div>`;
  })()}

  ${(studio.wikipedia || studio.website) ? `
  <div class="entity-links">
    <h3>External Links</h3>
    ${studio.wikipedia ? `<a href="${escapeHtml(studio.wikipedia)}" class="entity-link" target="_blank" rel="noopener">→ Wikipedia</a>` : ''}
    ${studio.website ? `<a href="${escapeHtml(studio.website)}" class="entity-link" target="_blank" rel="noopener">→ Official Website</a>` : ''}
  </div>` : ''}

  ${studioFilms.length > 0 ? `
  <section class="entity-films-section">
    <h2 class="section-title">Filmography (${filmCount} films)</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead><tr>
          <th scope="col" style="width:90px" class="sortable active" data-col="year" tabindex="0" aria-sort="ascending">Year <span class="sort-indicator" aria-hidden="true">▲</span></th>
          <th scope="col" class="sortable" data-col="title" tabindex="0" aria-sort="none">Title <span class="sort-indicator" aria-hidden="true">⇅</span></th>
          <th scope="col">Director</th>
          <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
          <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
        </tr></thead>
        <tbody>${studioFilms.map(film => `
          <tr>
            <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
            <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a></td>
            <td class="table-meta">${getDirectorLink(film, '../') || '—'}</td>
            <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
            <td class="watch-cell">${renderWatchCell(film, { compact: true })}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>` : ''}
</main>
${generateFooter('../')}
${studioFilms.length > 0 ? generateEntityTableSort() : ''}
</body></html>`;
}

function generateStudioIndexPage() {
  const sortedStudios = [...studios].sort((a, b) => {
    const aFilms = films.filter(f => f.studioEntities?.some(s => s.id === a.id)).length;
    const bFilms = films.filter(f => f.studioEntities?.some(s => s.id === b.id)).length;
    return bFilms - aFilms;
  });

  const description = `Browse ${studios.length} animation studios from around the world in the Global Animation Archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Studios — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/studios/">
${FAVICON}
<meta property="og:type" content="website">
<meta property="og:title" content="Studios — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
${FONT_HEAD}
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
  { label: 'Studios' }
], '../')}
<main class="entity-index studios-index" id="main-content">
  <div class="entity-index-header">
    <h1>Studios</h1>
    <p class="entity-index-subtitle">Browse ${studios.length} animation studios from around the world</p>
  </div>
  <div class="entity-grid">
    ${sortedStudios.map(studio => {
      const filmCount = films.filter(f => f.studioEntities?.some(s => s.id === studio.id)).length;
      return `<a href="${slugify(studio.name)}-${studio.id.slice(0,8)}.html" class="entity-card">
      <div class="entity-card-info">
        <h2 class="entity-card-name">${escapeHtml(studio.name)}</h2>
        <div class="entity-card-meta">
          ${studio.country ? `<span class="entity-card-country">${escapeHtml(studio.country)}</span>` : ''}
          <span class="entity-card-count">${filmCount} films</span>
        </div>
        ${studio.founded ? `<div class="entity-card-dates">${studio.founded}${studio.closed ? `–${studio.closed}` : studio.active ? '–Present' : ''}</div>` : ''}
      </div>
    </a>`;
    }).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateStudioPages() {
  if (studios.length === 0) {
    console.log('  ⚠ No studios data, skipping studio pages');
    return { count: 0 };
  }

  mkdirSync('./dist/studios', { recursive: true });

  let count = 0;
  for (const studio of studios) {
    const filename = `${slugify(studio.name)}-${studio.id.slice(0,8)}.html`;
    writeFileSync(`./dist/studios/${filename}`, generateStudioPage(studio));
    count++;
  }

  writeFileSync('./dist/studios/index.html', generateStudioIndexPage());
  return { count };
}

// ===================== DIRECTOR DETAIL PAGES =====================
function generateDirectorDetailPage(director) {
  // Get films for this director
  const directorFilms = films.filter(f =>
    (f.directorEntities && f.directorEntities.some(d => d.id === director.id)) ||
    (f.director && f.director.toLowerCase().includes(director.name.toLowerCase()))
  ).sort((a, b) => (a.year || 0) - (b.year || 0));

  const filmCount = directorFilms.length;
  const lifespan = director.birthYear ?
    `${director.birthYear}${director.deathYear ? ` – ${director.deathYear}` : ' – Present'}` : '';

  const nationalities = Array.isArray(director.nationality) ? director.nationality.join(', ') : (director.nationality || '');
  const description = `${director.name}${director.nativeName ? ` (${director.nativeName})` : ''} — ${nationalities ? nationalities + ' ' : ''}animator and director. ${filmCount} films in the archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(director.name)} — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/${getDirectorUrl(director)}">
${FAVICON}
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(director.name)} — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
${FONT_HEAD}
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
  { label: 'Directors', url: 'directors/index.html' },
  { label: escapeHtml(director.name) }
], '../')}
<main class="entity-page director-page" id="main-content">
  <div class="entity-header">
    <div class="entity-title-section">
      <h1 class="entity-name">${escapeHtml(director.name)}</h1>
      ${director.nativeName ? `<p class="entity-native-name">${escapeHtml(director.nativeName)}</p>` : ''}
      ${lifespan ? `<p class="entity-dates">${lifespan}</p>` : ''}
      ${nationalities ? `<p class="entity-subtitle">Nationality: ${escapeHtml(nationalities)}</p>` : ''}
    </div>
    <nav class="entity-nav">
      <a href="index.html" class="entity-back-link">← All Directors</a>
    </nav>
  </div>

  ${director.bio ? `<div class="entity-description"><h3>Biography</h3><p>${escapeHtml(director.bio)}</p></div>` : ''}
  ${director.significance ? `<div class="entity-description"><h3>Significance</h3><p>${escapeHtml(director.significance)}</p></div>` : ''}
  ${director.signatureStyle ? `<div class="entity-description"><h3>Signature Style</h3><p>${escapeHtml(director.signatureStyle)}</p></div>` : ''}

  <div class="entity-meta-grid">
    ${director.primaryTechnique ? `
    <div class="entity-meta-card">
      <div class="meta-card-title">Primary Technique</div>
      <div class="meta-card-value">${escapeHtml(director.primaryTechnique)}</div>
    </div>` : ''}
    <div class="entity-meta-card">
      <div class="meta-card-title">Films in Archive</div>
      <div class="meta-card-value">${filmCount}</div>
    </div>
  </div>

  ${director.awards ? `<div class="entity-awards"><h3>Awards</h3><p>${escapeHtml(director.awards)}</p></div>` : ''}

  ${(() => {
    // Get studios this director has worked with
    const workedWithStudios = new Map();
    directorFilms.forEach(film => {
      if (film.studioEntities) {
        film.studioEntities.forEach(s => {
          const studio = studioMap.get(s.id);
          if (studio && !workedWithStudios.has(s.id)) {
            workedWithStudios.set(s.id, { studio, count: 0 });
          }
          if (workedWithStudios.has(s.id)) {
            workedWithStudios.get(s.id).count++;
          }
        });
      } else if (film.studio) {
        const matchedStudio = studiosByName.get(film.studio.toLowerCase().trim());
        if (matchedStudio && !workedWithStudios.has(matchedStudio.id)) {
          workedWithStudios.set(matchedStudio.id, { studio: matchedStudio, count: 0 });
        }
        if (matchedStudio && workedWithStudios.has(matchedStudio.id)) {
          workedWithStudios.get(matchedStudio.id).count++;
        }
      }
    });
    const studiosList = [...workedWithStudios.values()].sort((a, b) => b.count - a.count);
    if (studiosList.length === 0) return '';
    return `
  <div class="entity-collaborators">
    <h3>Studios Collaborated With</h3>
    <div class="collaborator-tags">
      ${studiosList.map(({ studio, count }) => `<a href="../${getStudioUrl(studio)}" class="collaborator-tag">${escapeHtml(studio.name)} <span class="collab-count">(${count})</span></a>`).join('')}
    </div>
  </div>`;
  })()}

  ${(director.wikipedia || director.imdb) ? `
  <div class="entity-links">
    <h3>External Links</h3>
    ${director.wikipedia ? `<a href="${escapeHtml(director.wikipedia)}" class="entity-link" target="_blank" rel="noopener">→ Wikipedia</a>` : ''}
    ${director.imdb ? `<a href="${escapeHtml(director.imdb)}" class="entity-link" target="_blank" rel="noopener">→ IMDb</a>` : ''}
  </div>` : ''}

  ${directorFilms.length > 0 ? `
  <section class="entity-films-section">
    <h2 class="section-title">Filmography (${filmCount} films)</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead><tr>
          <th scope="col" style="width:90px" class="sortable active" data-col="year" tabindex="0" aria-sort="ascending">Year <span class="sort-indicator" aria-hidden="true">▲</span></th>
          <th scope="col" class="sortable" data-col="title" tabindex="0" aria-sort="none">Title <span class="sort-indicator" aria-hidden="true">⇅</span></th>
          <th scope="col">Studio</th>
          <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
          <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
        </tr></thead>
        <tbody>${directorFilms.map(film => `
          <tr>
            <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
            <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a></td>
            <td class="table-meta">${getStudioLink(film, '../') || '—'}</td>
            <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
            <td class="watch-cell">${renderWatchCell(film, { compact: true })}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>` : ''}
</main>
${generateFooter('../')}
${directorFilms.length > 0 ? generateEntityTableSort() : ''}
</body></html>`;
}

function generateDirectorDetailPages() {
  if (directorsData.length === 0) {
    console.log('  ⚠ No directors data from Notion, using legacy director index only');
    return { count: 0, legacyOnly: true };
  }

  // Note: We keep the existing director index (alphabetical list) but also generate detail pages
  let count = 0;
  for (const director of directorsData) {
    const filename = `${slugify(director.name)}-${director.id.slice(0,8)}.html`;
    writeFileSync(`./dist/directors/${filename}`, generateDirectorDetailPage(director));
    count++;
  }

  return { count };
}

// ===================== SERIES PAGES =====================
function generateSeriesPage(series) {
  // Get films for this series
  const seriesFilms = films.filter(f =>
    f.seriesEntities && f.seriesEntities.some(s => s.id === series.id)
  ).sort((a, b) => (a.year || 0) - (b.year || 0));

  const filmCount = seriesFilms.length;
  const typeLabel = series.type || 'Series';

  // Get studio info
  let studioInfo = '';
  if (series.studioRelation && series.studioRelation.length > 0) {
    const studio = studioMap.get(series.studioRelation[0]);
    if (studio) {
      studioInfo = `<a href="../${getStudioUrl(studio)}">${escapeHtml(studio.name)}</a>`;
    }
  }

  const description = `${series.name} — ${typeLabel}. ${series.description ? series.description.substring(0, 150) : `${filmCount} films in the archive.`}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(series.name)} — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/${getSeriesUrl(series)}">
${FAVICON}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(series.name)} — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
${FONT_HEAD}
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
  { label: 'Series', url: 'series/index.html' },
  { label: escapeHtml(series.name) }
], '../')}
<main class="entity-page series-page" id="main-content">
  <div class="entity-header">
    <div class="entity-title-section">
      <span class="entity-type-badge">${escapeHtml(typeLabel)}</span>
      <h1 class="entity-name">${escapeHtml(series.name)}</h1>
      ${series.country ? `<p class="entity-subtitle">${escapeHtml(series.country)}</p>` : ''}
      ${series.yearsActive ? `<p class="entity-dates">Years Active: ${escapeHtml(series.yearsActive)}</p>` : ''}
    </div>
    <nav class="entity-nav">
      <a href="index.html" class="entity-back-link">← All Series</a>
    </nav>
  </div>

  ${series.description ? `<div class="entity-description"><p>${escapeHtml(series.description)}</p></div>` : ''}

  <div class="entity-meta-grid">
    ${studioInfo ? `
    <div class="entity-meta-card">
      <div class="meta-card-title">Studio</div>
      <div class="meta-card-value">${studioInfo}</div>
    </div>` : ''}
    <div class="entity-meta-card">
      <div class="meta-card-title">Total Entries</div>
      <div class="meta-card-value">${series.totalEntries || filmCount}</div>
    </div>
    <div class="entity-meta-card">
      <div class="meta-card-title">In Archive</div>
      <div class="meta-card-value">${filmCount}</div>
    </div>
  </div>

  ${series.watchOrder ? `
  <div class="entity-watch-order">
    <h3>Watch Order</h3>
    <div class="watch-order-content">${formatWatchOrder(series.watchOrder)}</div>
  </div>` : ''}

  ${seriesFilms.length > 0 ? `
  <section class="entity-films-section">
    <h2 class="section-title">Films in this ${escapeHtml(typeLabel)} (${filmCount})</h2>
    <div class="table-wrapper">
      <table class="film-table">
        <thead><tr>
          <th scope="col" style="width:90px" class="sortable active" data-col="year" tabindex="0" aria-sort="ascending">Year <span class="sort-indicator" aria-hidden="true">▲</span></th>
          <th scope="col" class="sortable" data-col="title" tabindex="0" aria-sort="none">Title <span class="sort-indicator" aria-hidden="true">⇅</span></th>
          <th scope="col">Director</th>
          <th scope="col" style="width:100px" class="hide-mobile">Technique</th>
          <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
        </tr></thead>
        <tbody>${seriesFilms.map(film => `
          <tr>
            <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
            <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a></td>
            <td class="table-meta">${getDirectorLink(film, '../') || '—'}</td>
            <td class="table-technique hide-mobile">${film.technique?.[0]?.toUpperCase() || '—'}</td>
            <td class="watch-cell">${renderWatchCell(film, { compact: true })}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>` : ''}
</main>
${generateFooter('../')}
${seriesFilms.length > 0 ? generateEntityTableSort() : ''}
</body></html>`;
}

function generateSeriesIndexPage() {
  const sortedSeries = [...seriesData].sort((a, b) => a.name.localeCompare(b.name));
  const description = `Browse ${seriesData.length} animation series, franchises, and shared universes in the Global Animation Archive.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Series & Universes — Global Animation Archive</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/series/">
${FAVICON}
<meta property="og:type" content="website">
<meta property="og:title" content="Series & Universes — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
${FONT_HEAD}
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
  { label: 'Series' }
], '../')}
<main class="entity-index series-index" id="main-content">
  <div class="entity-index-header">
    <h1>Series & Universes</h1>
    <p class="entity-index-subtitle">Browse ${seriesData.length} animation series, franchises, and shared universes</p>
  </div>
  <div class="entity-grid">
    ${sortedSeries.map(series => {
      const filmCount = films.filter(f => f.seriesEntities?.some(s => s.id === series.id)).length;
      return `<a href="${slugify(series.name)}-${series.id.slice(0,8)}.html" class="entity-card">
      <div class="entity-card-info">
        <span class="entity-type-badge small">${escapeHtml(series.type || 'Series')}</span>
        <h2 class="entity-card-name">${escapeHtml(series.name)}</h2>
        <div class="entity-card-meta">
          ${series.country ? `<span class="entity-card-country">${escapeHtml(series.country)}</span>` : ''}
          <span class="entity-card-count">${filmCount} films</span>
        </div>
      </div>
    </a>`;
    }).join('\n    ')}
  </div>
</main>
${generateFooter('../')}
</body></html>`;
}

function generateSeriesPages() {
  if (seriesData.length === 0) {
    console.log('  ⚠ No series data, skipping series pages');
    return { count: 0 };
  }

  mkdirSync('./dist/series', { recursive: true });

  let count = 0;
  for (const series of seriesData) {
    const filename = `${slugify(series.name)}-${series.id.slice(0,8)}.html`;
    writeFileSync(`./dist/series/${filename}`, generateSeriesPage(series));
    count++;
  }

  writeFileSync('./dist/series/index.html', generateSeriesIndexPage());
  return { count };
}

// ===================== GENRE PAGES =====================
// Migrated to generic facet builder (scripts/lib/facet-builder.js) in Batch C.
function generateGenrePages() {
  const { count, valuesWithFilms } = generateTagFacetPages({
    name: 'Genre',
    slug: 'genres',
    label: 'Genres',
    extract: (film) => film.genres || [],
    films,
    // Preserve pre-refactor wording exactly
    detailTitle: (value) => `${value} Films — Global Animation Archive`,
    indexSubtitle: (sorted) => `Browse ${sorted.length} animation genres`,
    describeIndex: (sorted, total) =>
      `Browse ${sorted.length} animation genres from around the world. ${total} films categorized in the Global Animation Archive.`,
    deps: {
      slugify, escapeHtml, generateTableRows, generateBreadcrumb, generateFooter,
      SITE_URL, FAVICON, BUILD_DATE,
      writeFileSync, mkdirSync,
    },
  });
  return { count, genresWithFilms: valuesWithFilms };
}

// ===================== KEYWORD PAGES =====================
// Migrated to generic facet builder (scripts/lib/facet-builder.js) in Batch C.
// Keyword distributions are flatter than Genre, so uses tighter size thresholds.
function generateKeywordPages() {
  const { count, valuesWithFilms } = generateTagFacetPages({
    name: 'Keyword',
    slug: 'keywords',
    label: 'Keywords',
    extract: (film) => film.keywords || [],
    films,
    sizeThresholds: [
      { min: 51, size: 'xl' },
      { min: 26, size: 'lg' },
      { min: 11, size: 'md' },
      { min: 6,  size: 'sm' },
      { min: 0,  size: 'xs' },
    ],
    indexHeading: 'Keywords & Themes',
    indexSubtitle: (sorted) => `Browse ${sorted.length} keywords and themes`,
    describe: (value, sorted) =>
      `Explore ${sorted.length} animated films tagged with "${value}" in the Global Animation Archive.`,
    describeIndex: (sorted, total) =>
      `Browse ${sorted.length} animation keywords and themes. ${total} films tagged in the Global Animation Archive.`,
    deps: {
      slugify, escapeHtml, generateTableRows, generateBreadcrumb, generateFooter,
      SITE_URL, FAVICON, BUILD_DATE,
      writeFileSync, mkdirSync,
    },
  });
  return { count, keywordsWithFilms: valuesWithFilms };
}

// ===================== PLATFORM PAGES =====================
// Batch B: watch-link platform facet — enables "What can I watch on Netflix?"
// filtering. Extracts unique, reachable platforms from each film's embedded
// watchLinks (skipping Dead entries and entries with empty URLs).
function generatePlatformPages() {
  const { count, valuesWithFilms } = generateTagFacetPages({
    name: 'Platform',
    slug: 'platforms',
    label: 'Streaming Platforms',
    extract: (film) => {
      const links = Array.isArray(film.watchLinks) ? film.watchLinks : [];
      const set = new Set();
      for (const l of links) {
        if (!l || !l.platform) continue;
        // Use the partitioned status helpers so a platform appears in the
        // facet only when at least one of its links is actually surfaced
        // to users (Watchable or Gated). Hidden statuses — Broken, Dead
        // (legacy), Unavailable, Redirect (legacy) — would otherwise
        // populate platform pages with films that show no working link.
        if (!isVisible(l)) continue;
        set.add(l.platform);
      }
      return [...set];
    },
    films,
    // Platform distribution is skewed — YouTube dominates, long tail of niche sources.
    sizeThresholds: [
      { min: 300, size: 'xl' },
      { min: 100, size: 'lg' },
      { min: 40,  size: 'md' },
      { min: 15,  size: 'sm' },
      { min: 0,   size: 'xs' },
    ],
    detailTitle: (value) => `Animated films on ${value} — Global Animation Archive`,
    describe: (value, sorted) =>
      `${sorted.length} animated films available to watch on ${value}, curated by the Global Animation Archive.`,
    indexHeading: 'Streaming Platforms',
    indexSubtitle: (sorted) => `Browse ${sorted.length} platforms where you can watch world animation`,
    describeIndex: (sorted, total) =>
      `Browse ${sorted.length} streaming platforms. ${total} animated films with verified watch links in the Global Animation Archive.`,
    deps: {
      slugify, escapeHtml, generateTableRows, generateBreadcrumb, generateFooter,
      SITE_URL, FAVICON, BUILD_DATE,
      writeFileSync, mkdirSync,
    },
  });
  return { count, platformsWithFilms: valuesWithFilms };
}

function generateSitemap(countriesWithFilms, techniquesWithFilms, decadesWithFilms, genresWithFilms, keywordsWithFilms, platformsWithFilms) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_URL}/countries/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/techniques/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/studios/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/directors/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/series/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/decades/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/genres/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/keywords/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/platforms/`, priority: '0.9', changefreq: 'daily' }
  ];

  // Add country pages
  if (countriesWithFilms) {
    for (const country of Object.keys(countriesWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/countries/${slugify(country)}.html`,
        priority: '0.8',
        changefreq: 'weekly'
      });
    }
  }

  // Add technique pages
  if (techniquesWithFilms) {
    for (const technique of Object.keys(techniquesWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/techniques/${slugify(technique)}.html`,
        priority: '0.8',
        changefreq: 'weekly'
      });
    }
  }

  // Add decade pages
  if (decadesWithFilms) {
    for (const decade of Object.keys(decadesWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/decades/${decade}s.html`,
        priority: '0.8',
        changefreq: 'weekly'
      });
    }
  }

  // Add studio pages
  for (const studio of studios) {
    urls.push({
      loc: `${SITE_URL}/${getStudioUrl(studio)}`,
      priority: '0.8',
      changefreq: 'weekly'
    });
  }

  // Add director detail pages
  for (const director of directorsData) {
    urls.push({
      loc: `${SITE_URL}/${getDirectorUrl(director)}`,
      priority: '0.8',
      changefreq: 'weekly'
    });
  }

  // Add series pages
  for (const series of seriesData) {
    urls.push({
      loc: `${SITE_URL}/${getSeriesUrl(series)}`,
      priority: '0.8',
      changefreq: 'weekly'
    });
  }

  // Add genre pages
  if (genresWithFilms) {
    for (const genre of Object.keys(genresWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/genres/${slugify(genre)}.html`,
        priority: '0.7',
        changefreq: 'weekly'
      });
    }
  }

  // Add keyword pages
  if (keywordsWithFilms) {
    for (const keyword of Object.keys(keywordsWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/keywords/${slugify(keyword)}.html`,
        priority: '0.6',
        changefreq: 'weekly'
      });
    }
  }

  // Add platform pages (Batch B)
  if (platformsWithFilms) {
    for (const platform of Object.keys(platformsWithFilms)) {
      urls.push({
        loc: `${SITE_URL}/platforms/${slugify(platform)}.html`,
        priority: '0.8',
        changefreq: 'daily'
      });
    }
  }

  // Add film pages
  for (const film of films) {
    urls.push({
      loc: `${SITE_URL}/${getFilmUrl(film)}`,
      priority: '0.7',
      changefreq: 'weekly',
      lastmod: film.lastUpdated?.split('T')[0] || BUILD_DATE
    });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod || BUILD_DATE}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

function generate404Page() {
  // Pre-pick a pool of random film URLs so the click-handler can rotate
  // without loading the full 1.85MB films-index.js on a 404. Pool size 50
  // gives plenty of variety per page-load while keeping the inline script
  // payload tiny (~3KB). The fallback href on the Random link uses the
  // first candidate so users with JS disabled still get a working button.
  const POOL_SIZE = 50;
  const pool = [];
  const seen = new Set();
  while (pool.length < Math.min(POOL_SIZE, films.length) && seen.size < films.length) {
    const idx = Math.floor(Math.random() * films.length);
    if (seen.has(idx)) continue;
    seen.add(idx);
    pool.push('/' + getFilmUrl(films[idx]));
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page Not Found — Global Animation Archive</title>
<meta name="description" content="The page you're looking for doesn't exist in the Global Animation Archive. Browse the collection or search for what you were trying to find.">
${FAVICON}
<meta name="robots" content="noindex">

${FONT_HEAD}
<style>
/* Inline error-page styles — ~3KB. Replaces a full styles.css fetch (48KB)
   on what should be the lightest page on the site. Keeps in sync with the
   .error-* + .empty-state + .breadcrumb + .masthead + .footer rules in
   the main CSS — if those change, mirror here. */
*{margin:0;padding:0;box-sizing:border-box}
:root{--cream:#f8f6f1;--paper:#fffef9;--ink:#1c1917;--ink-light:#44403c;--ink-muted:#6b655e;--rule:#d6d3d1;--accent:#9f1239;--data-bg:#f3f1ec;--mono:'JetBrains Mono',monospace;--type-page-hero:42px}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--ink);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
.skip-link{position:absolute;top:-40px;left:0;background:var(--ink);color:var(--cream);padding:8px 16px;z-index:1000;font-family:var(--mono);font-size:12px;text-decoration:none}
.skip-link:focus{top:0}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.masthead{background:var(--paper);border-bottom:1px solid var(--rule)}
.masthead-top{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
.masthead-main{text-align:center;padding:28px 32px 24px}
.masthead-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;letter-spacing:.02em;margin-bottom:4px}
.breadcrumb{padding:12px 32px;background:var(--paper);border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted);letter-spacing:.05em}
.breadcrumb a{color:var(--ink-muted);text-decoration:none;transition:color .15s}
.breadcrumb a:hover,.breadcrumb a:focus{color:var(--accent)}
.breadcrumb-sep{margin:0 8px;color:var(--ink-faint,#6b6660)}
.error-page{display:flex;align-items:center;justify-content:center;min-height:60vh;padding:48px 32px}
.error-content{text-align:center;max-width:500px}
.error-code{font-family:var(--mono);font-size:120px;font-weight:600;color:var(--rule);line-height:1;margin-bottom:16px}
.error-title{font-family:'Playfair Display',serif;font-size:var(--type-page-hero);font-weight:400;margin-bottom:16px}
.error-message{font-family:'Source Serif 4',serif;font-size:18px;color:var(--ink-muted);margin-bottom:24px}
.error-path{font-family:var(--mono);font-size:12px;color:var(--ink-muted);margin-bottom:24px;word-break:break-all}
.error-path code{background:var(--data-bg);padding:2px 6px;color:var(--ink);border-radius:2px}
.error-search{display:flex;gap:0;justify-content:center;margin:0 auto 24px;max-width:380px}
.error-search-input{flex:1;padding:12px 16px;border:1px solid var(--rule);border-right:none;background:var(--paper);font-family:var(--mono);font-size:13px;min-height:44px;box-sizing:border-box}
.error-search-input:focus{outline:2px solid var(--accent);outline-offset:-2px;border-color:var(--ink)}
.error-search-btn{padding:12px 20px;border:1px solid var(--ink);background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;min-height:44px;box-sizing:border-box;transition:background .2s}
.error-search-btn:hover,.error-search-btn:focus{background:var(--accent);border-color:var(--accent);outline:none}
.error-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.error-btn{font-family:var(--mono);font-size:12px;font-weight:500;padding:14px 24px;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;text-decoration:none;transition:all .2s}
.error-btn-primary{background:var(--ink);color:var(--cream)}
.error-btn-primary:hover,.error-btn-primary:focus{background:var(--accent);outline:none}
.error-btn-secondary{background:var(--paper);color:var(--ink);border:1px solid var(--rule)}
.error-btn-secondary:hover,.error-btn-secondary:focus{border-color:var(--ink);outline:none}
.footer{background:var(--ink);color:var(--cream);padding:32px}
.footer-inner{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.footer-logo{font-family:'Playfair Display',serif;font-size:18px}
.footer-links{display:flex;gap:24px}
.footer-random,.footer-report{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.6);text-decoration:none;transition:color .2s}
.footer-random:hover,.footer-report:hover{color:var(--cream)}
.footer-timestamp{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.7)}
@media(max-width:600px){.error-code{font-size:72px}.error-title{font-size:28px}.error-message{font-size:16px}.error-actions{flex-direction:column}.error-btn{width:100%;justify-content:center}}
</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="/" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
${generateBreadcrumb([
  { label: 'Home', url: 'index.html' },
  { label: 'Page Not Found' }
], '/')}
<main class="error-page" id="main-content">
  <div class="error-content">
    <div class="error-code" aria-hidden="true">404</div>
    <h1 class="error-title">Page Not Found</h1>
    <p class="error-message">This page isn't in the archive. It may have been moved, mistyped, or never existed.</p>
    <p class="error-path" id="error-path" hidden>You tried: <code id="error-path-value"></code></p>
    <form class="error-search" action="/" method="get" role="search" aria-label="Search the archive">
      <label for="error-search-input" class="visually-hidden">Search films, directors, studios</label>
      <input type="search" name="q" id="error-search-input" class="error-search-input" placeholder="Search films, directors, studios…" autocomplete="off" />
      <button type="submit" class="error-search-btn">Search</button>
    </form>
    <nav class="error-actions" aria-label="Recovery options">
      <a href="/" class="error-btn error-btn-primary">Back to Collection</a>
      <a href="${escapeHtml(pool[0] || '/')}" class="error-btn error-btn-secondary" id="error-random-btn">Random Film</a>
    </nav>
  </div>
</main>
${generateFooter('/')}
<script>
// Random Film click rotation — picks fresh from a pre-rendered pool on
// every click instead of locking everyone to the build-time pick.
// Same architectural fix as the FotD client rotation (see generateJS()
// rotateFilmOfDay block). Pool is server-rendered into the constant
// below so we don't need to load films-index.js (1.85MB) on a 404.
(function(){
  var pool = ${JSON.stringify(pool)};
  var btn = document.getElementById('error-random-btn');
  if (btn && pool.length > 0) {
    btn.addEventListener('click', function(e){
      e.preventDefault();
      var pick = pool[Math.floor(Math.random() * pool.length)];
      window.location.href = pick;
    });
  }
  // Echo the URL the user actually tried to reach. Hidden by default so
  // it doesn't render at all when JS is off (where window.location is
  // unavailable to us at template time).
  var pathEl = document.getElementById('error-path');
  var pathVal = document.getElementById('error-path-value');
  if (pathEl && pathVal && window.location.pathname && window.location.pathname !== '/404.html') {
    pathVal.textContent = window.location.pathname + (window.location.search || '');
    pathEl.hidden = false;
  }
})();
</script>
</body></html>`;
}

function generateRobotsTxt() {
  return `# Global Animation Archive
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

// Batch D2: module-level holder populated at the top of build() before
// generateIndexPage() runs. index.html reads these as content-hashed
// script URLs so we can serve the JS with immutable cache headers.
const ASSET_URLS = { filmsIndex: 'films-index.js', app: 'app.js' };

function build() {
  console.log('🔨 Building static site...');
  mkdirSync('./dist', { recursive: true });
  mkdirSync('./dist/films', { recursive: true });

  // Copy self-hosted fonts (added 2026-04-26 perf round). Source dir
  // `./fonts/` is checked into the repo so the build is self-contained
  // — no Google Fonts CDN dependency at runtime. See FONT_HEAD constant
  // and netlify.toml /fonts/* immutable cache headers.
  const fontsSrc = './fonts';
  const fontsDst = './dist/fonts';
  if (fs.existsSync(fontsSrc)) {
    mkdirSync(fontsDst, { recursive: true });
    let fontCount = 0;
    for (const file of fs.readdirSync(fontsSrc)) {
      if (file.endsWith('.woff2')) {
        try {
          fs.copyFileSync(`${fontsSrc}/${file}`, `${fontsDst}/${file}`);
          fontCount++;
        } catch (e) { /* file may already exist with same content */ }
      }
    }
    console.log(`  ✓ ${fontCount} fonts copied to dist/fonts/ (self-hosted, immutable cache)`);
  }

  // ----- Batch D2: hash + emit JS assets BEFORE index.html -----
  // We need hashed filenames baked into the <script src> tags, so build
  // the catalog + app bundle strings first, hash them, write hashed
  // filenames, and stash the URLs in ASSET_URLS for generateIndexPage().
  cleanHashedAssets('./dist', 'films-index', 'js');
  cleanHashedAssets('./dist', 'app', 'js');

  const currentYear = new Date().getFullYear();
  const sortedFilmsForIndex = [...films].sort((a, b) => {
    const aFuture = (a.year || 0) > currentYear ? 1 : 0;
    const bFuture = (b.year || 0) > currentYear ? 1 : 0;
    if (aFuture !== bFuture) return aFuture - bFuture;
    return (b.year || 0) - (a.year || 0);
  });
  const filmsIndexSource = buildFilmsIndexJs(sortedFilmsForIndex, studios, directorsData);
  const appJsSource      = generateJS();

  const filmsIndexHash = contentHash(filmsIndexSource);
  const appJsHash      = contentHash(appJsSource);
  ASSET_URLS.filmsIndex = `films-index-${filmsIndexHash}.js`;
  ASSET_URLS.app        = `app-${appJsHash}.js`;

  writeFileSync(`./dist/${ASSET_URLS.filmsIndex}`, filmsIndexSource);
  writeFileSync(`./dist/${ASSET_URLS.app}`, appJsSource);
  console.log(`  ✓ ${ASSET_URLS.filmsIndex} (immutable, external catalog)`);
  console.log(`  ✓ ${ASSET_URLS.app} (immutable)`);

  // Lazy-loaded keywords map (perf trim 2026-04-26): keywords pulled out
  // of the slim catalog (~111 KB raw / ~30 KB gz off the critical path)
  // and emitted as a separate JSON the client fetches on first interaction
  // that needs them (search keystroke OR keyword filter open). Keyed by
  // the same 8-char id used elsewhere on the client.
  const keywordsIndex = {};
  for (const f of sortedFilmsForIndex) {
    if (Array.isArray(f.keywords) && f.keywords.length > 0) {
      keywordsIndex[f.id.slice(0, 8)] = f.keywords;
    }
  }
  writeFileSync('./dist/keywords-index.json', JSON.stringify(keywordsIndex));
  console.log(`  ✓ keywords-index.json (${Object.keys(keywordsIndex).length} films, lazy-loaded)`);

  writeFileSync('./dist/index.html', generateIndexPage());
  console.log('  ✓ index.html (paginated, first ' + FILMS_PER_PAGE + ' films)');

  let count = 0;
  for (const film of films) {
    const slug = slugify(film.titleEnglish);
    const filename = `${slug}-${film.id.slice(0,8)}.html`;
    writeFileSync(`./dist/films/${filename}`, generateFilmPage(film));
    count++;
  }
  console.log(`  ✓ ${count} film pages (with OG tags + JSON-LD)`);

  // Generate country pages
  const { count: countryCount, countriesWithFilms } = generateCountryPages();
  console.log(`  ✓ ${countryCount} country pages + index (with OG tags + JSON-LD)`);

  // Generate technique pages
  const { count: techniqueCount, techniquesWithFilms } = generateTechniquePages();
  console.log(`  ✓ ${techniqueCount} technique pages + index (with OG tags + JSON-LD)`);

  // Generate director index (legacy alphabetical index)
  const { count: directorCount } = generateDirectorPages();
  console.log(`  ✓ directors index (${directorCount} directors)`);

  // Generate director detail pages (from Notion Directors database)
  const { count: directorDetailCount } = generateDirectorDetailPages();
  if (directorDetailCount > 0) {
    console.log(`  ✓ ${directorDetailCount} director detail pages`);
  }

  // Generate decade pages
  const { count: decadeCount, decadesWithFilms } = generateDecadePages();
  console.log(`  ✓ ${decadeCount} decade pages + index (with OG tags + JSON-LD)`);

  // Generate studio pages
  const { count: studioCount } = generateStudioPages();
  if (studioCount > 0) {
    console.log(`  ✓ ${studioCount} studio pages + index`);
  }

  // Generate series pages
  const { count: seriesCount } = generateSeriesPages();
  if (seriesCount > 0) {
    console.log(`  ✓ ${seriesCount} series pages + index`);
  }

  // Generate genre pages
  const { count: genreCount, genresWithFilms } = generateGenrePages();
  if (genreCount > 0) {
    console.log(`  ✓ ${genreCount} genre pages`);
  }

  // Generate keyword pages
  const { count: keywordCount, keywordsWithFilms } = generateKeywordPages();
  if (keywordCount > 0) {
    console.log(`  ✓ ${keywordCount} keyword pages`);
  }

  // Generate platform pages (Batch B: streaming source facet)
  const { count: platformCount, platformsWithFilms } = generatePlatformPages();
  if (platformCount > 0) {
    console.log(`  ✓ ${platformCount} platform pages`);
  }

  writeFileSync('./dist/styles.css', generateCSS());
  console.log('  ✓ styles.css (with all page styles)');

  // Note: app.js is now emitted at the top of build() as a content-hashed
  // asset (see ASSET_URLS) so index.html can reference the immutable URL.

  writeFileSync('./dist/sitemap.xml', generateSitemap(countriesWithFilms, techniquesWithFilms, decadesWithFilms, genresWithFilms, keywordsWithFilms, platformsWithFilms));
  const totalUrls = films.length + countryCount + techniqueCount + decadeCount + studioCount + directorDetailCount + seriesCount + genreCount + keywordCount + platformCount + 8;
  console.log(`  ✓ sitemap.xml (${totalUrls} URLs)`);

  writeFileSync('./dist/robots.txt', generateRobotsTxt());
  console.log('  ✓ robots.txt');

  writeFileSync('./dist/404.html', generate404Page());
  console.log('  ✓ 404.html');

  console.log(`\n✅ Build complete! Output in ./dist/`);
  console.log(`\n📊 Features:`);
  console.log(`   • Pagination: Initial load ${FILMS_PER_PAGE} films`);
  console.log(`   • Country pages: ${countryCount} countries with dedicated pages`);
  console.log(`   • Technique pages: ${techniqueCount} techniques with dedicated pages`);
  console.log(`   • Studio pages: ${studioCount} studios with dedicated pages`);
  console.log(`   • Director pages: ${directorCount} directors (index) + ${directorDetailCount} detail pages`);
  console.log(`   • Series pages: ${seriesCount} series with dedicated pages`);
  console.log(`   • Decade pages: ${decadeCount} decades with dedicated pages`);
  console.log(`   • Genre pages: ${genreCount} genres with dedicated pages`);
  console.log(`   • Keyword pages: ${keywordCount} keywords with dedicated pages`);
  console.log(`   • Platform pages: ${platformCount} streaming platforms (Batch B)`);
  console.log(`   • SEO: sitemap.xml, robots.txt, OG tags, JSON-LD on all pages`);
  console.log(`   • Accessibility: Skip links, ARIA labels, keyboard navigation`);
}

build();
