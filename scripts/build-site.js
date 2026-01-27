import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const stats = JSON.parse(readFileSync('./data/stats.json', 'utf-8'));
const BUILD_DATE = new Date().toISOString().split('T')[0];
const BUILD_TIMESTAMP = new Date().toISOString();
const SITE_URL = 'https://animationarchive.netlify.app';
const FILMS_PER_PAGE = 50;

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
function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(str) { return (str || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function getFilmUrl(film) { return `films/${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html`; }

function generateTableRows(filmList) {
  return filmList.map(film => `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${film.watchLinks ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
      <td><a href="${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${film.director ? `<strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? escapeHtml(film.studio) : ''}</td>
      <td class="table-technique">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td class="table-runtime">${escapeHtml(film.runtime) || '—'}</td>
      <td><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="watch-btn" target="_blank" rel="noopener">▶ WATCH</a>${film.hasSubtitles ? '<span class="subs-badge">EN subs</span>' : ''}` : '<span class="no-link">—</span>'}</td>
    </tr>`).join('\n');
}

function generateFilterItems(items, type) {
  return items.slice(0, 25).map(item => {
    const value = escapeHtml(item.name || item.decade?.toString());
    const displayName = escapeHtml(item.name || `${item.decade}s`);
    // Add link for country filters
    if (type === 'country' && item.name) {
      return `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${value}">
      <a href="countries/${slugify(item.name)}.html" class="filter-link"><span class="name">${displayName}</span></a><span class="count">${item.count}</span>
    </div>`;
    }
    return `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${value}">
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
  const initialFilms = films.slice(0, FILMS_PER_PAGE);
  const hasMore = films.length > FILMS_PER_PAGE;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Global Animation Archive — World Animation Database</title>
<meta name="description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries. A comprehensive database documenting the art of animation from every corner of the world.">
<meta name="keywords" content="animation, animated films, world cinema, film database, international animation, stop motion, hand-drawn animation">
<link rel="canonical" href="${SITE_URL}/">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Global Animation Archive">
<meta property="og:description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries. Documenting the art of animation from every corner of the world.">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Global Animation Archive">
<meta name="twitter:description" content="Discover ${stats.total.toLocaleString()} animated films from ${Object.keys(stats.countries).length} countries.">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateCollectionJsonLd()}</script>

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
<nav class="main-nav" aria-label="Main navigation"><a href="index.html" class="active" aria-current="page">Collection</a><a href="#about">About</a></nav>
<div class="main-layout">
  <aside class="sidebar" role="complementary" aria-label="Filters">
    <div class="query-display" id="active-query" style="display:none;"><div class="query-label">Active Filters</div><div class="query-tags" id="query-tags"></div></div>
    <div class="sidebar-section"><div class="sidebar-header">Country <span class="count">${Object.keys(stats.countries).length}</span></div><div class="filter-list" role="listbox" aria-label="Filter by country">${generateFilterItems(stats.countriesSorted, 'country')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Technique <span class="count">${Object.keys(stats.techniques).length}</span></div><div class="filter-list" role="listbox" aria-label="Filter by technique">${generateFilterItems(stats.techniquesSorted, 'technique')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Era</div><div class="filter-list" role="listbox" aria-label="Filter by decade">${generateFilterItems(stats.decadesSorted.map(d => ({ name: `${d.decade}–${d.decade + 9}`, count: d.count, decade: d.decade })), 'decade')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Watch Status</div><div class="filter-list" role="listbox" aria-label="Filter by watch status">
      <div class="filter-item" data-filter-type="watchable" data-filter-value="true" role="option"><span class="name">Has Watch Link</span><span class="count">${stats.watchable}</span></div>
      <div class="filter-item" data-filter-type="subtitles" data-filter-value="true" role="option"><span class="name">EN Subtitles</span><span class="count">${stats.withSubtitles}</span></div>
    </div></div>
  </aside>
  <main class="content" id="main-content">
    <div class="content-header"><div><h2 class="content-title">From the Collection</h2><span class="content-meta" id="results-count">${stats.total.toLocaleString()} films</span></div><div class="search-box"><label for="search-input" class="visually-hidden">Search films</label><input type="text" id="search-input" placeholder="Search titles, directors..." aria-describedby="results-count" /></div></div>
    <div class="table-wrapper"><table class="film-table" role="grid"><thead><tr><th scope="col" style="width:90px">Year</th><th scope="col">Title</th><th scope="col">Director / Studio</th><th scope="col" style="width:100px">Technique</th><th scope="col" style="width:70px">Runtime</th><th scope="col" style="width:90px">Confidence</th><th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th></tr></thead><tbody id="film-tbody">${generateTableRows(initialFilms)}</tbody></table></div>
    ${hasMore ? `<div class="load-more-container"><button id="load-more-btn" class="load-more-btn" data-loaded="${FILMS_PER_PAGE}" data-total="${films.length}">Load More <span class="load-more-count">(${films.length - FILMS_PER_PAGE} remaining)</span></button></div>` : ''}
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
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
<script>window.ALL_FILMS_DATA=${JSON.stringify(films.map(f => ({
  id: f.id,
  title: f.titleEnglish,
  original: f.originalTitle,
  year: f.year,
  country: f.country,
  director: f.director,
  studio: f.studio,
  technique: f.technique,
  runtime: f.runtime,
  confidence: f.confidence,
  watchLinks: f.watchLinks,
  hasSubtitles: f.hasSubtitles
})))};</script>
<script src="app.js"></script>
</body></html>`;
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

<!-- Open Graph -->
<meta property="og:type" content="video.movie">
<meta property="og:title" content="${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'})">
<meta property="og:description" content="${escapeHtml(description.substring(0, 200))}">
<meta property="og:url" content="${SITE_URL}/${getFilmUrl(film)}">
<meta property="og:site_name" content="Global Animation Archive">
${film.year ? `<meta property="video:release_date" content="${film.year}">` : ''}

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'})">
<meta name="twitter:description" content="${escapeHtml(description.substring(0, 200))}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateFilmJsonLd(film)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
<main class="detail-page" id="main-content">
  <article>
  <div class="detail-header">
    <div class="detail-year-block"><div class="detail-year">${film.year || '?'}</div><div class="detail-country">${getCountryCode(film.country)}</div></div>
    <div class="detail-title-section">
      <div class="detail-technique">${escapeHtml(techniques.toUpperCase())}</div>
      <h1 class="detail-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</h1>
      ${film.originalTitle ? `<div class="detail-original" lang="und">${escapeHtml(film.originalTitle)}</div>` : ''}
      <div class="detail-credits">${film.director ? `Directed by <strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? `Produced by <strong>${escapeHtml(film.studio)}</strong>` : ''}${film.runtime ? ` · ${escapeHtml(film.runtime)}` : ''}</div>
    </div>
    <div class="detail-actions">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="detail-watch-btn" target="_blank" rel="noopener">▶ WATCH NOW</a>${film.hasSubtitles ? '<span class="detail-subs">EN SUBTITLES AVAILABLE</span>' : ''}` : '<span class="detail-subs">NO WATCH LINK AVAILABLE</span>'}</div>
  </div>
  <div class="detail-body">
    <div class="detail-content">
      ${film.synopsis ? `<h2>Synopsis</h2><p>${escapeHtml(film.synopsis)}</p>` : ''}
      ${film.historicalContext ? `<h2>Historical Context</h2><p>${escapeHtml(film.historicalContext)}</p>` : ''}
      ${film.keyCredits ? `<h2>Key Credits</h2><p>${escapeHtml(film.keyCredits)}</p>` : ''}
      ${film.notes ? `<h2>Notes</h2><p>${escapeHtml(film.notes)}</p>` : ''}
      ${!film.synopsis && !film.historicalContext && !film.keyCredits && !film.notes ? '<p class="no-content">No detailed information available yet.</p>' : ''}
    </div>
    <aside class="detail-data-panel" aria-label="Film metadata">
      <div class="data-panel-title">Film Data</div>
      <dl class="data-list">
      <div class="data-row"><dt class="data-label">Technique</dt><dd class="data-value">${escapeHtml(techniques)}</dd></div>
      <div class="data-row"><dt class="data-label">Format</dt><dd class="data-value">${escapeHtml(specs) || '—'}</dd></div>
      ${film.studio ? `<div class="data-row"><dt class="data-label">Studio</dt><dd class="data-value">${escapeHtml(film.studio)}</dd></div>` : ''}
      ${film.runtime ? `<div class="data-row"><dt class="data-label">Runtime</dt><dd class="data-value">${escapeHtml(film.runtime)}</dd></div>` : ''}
      <div class="data-row"><dt class="data-label">Confidence</dt><dd class="data-value confidence-pips">${confidenceToPips(film.confidence)}</dd></div>
      <div class="data-row"><dt class="data-label">Updated</dt><dd class="data-value">${film.lastUpdated?.split('T')[0] || '—'}</dd></div>
      </dl>
      ${(film.imdb || film.letterboxd || film.wikipedia) ? `<nav class="data-links" aria-label="External links">${film.imdb ? `<a href="${escapeHtml(film.imdb)}" class="data-link" target="_blank" rel="noopener">IMDb</a>` : ''}${film.letterboxd ? `<a href="${escapeHtml(film.letterboxd)}" class="data-link" target="_blank" rel="noopener">Letterboxd</a>` : ''}${film.wikipedia ? `<a href="${escapeHtml(film.wikipedia)}" class="data-link" target="_blank" rel="noopener">Wikipedia</a>` : ''}</nav>` : ''}
    </aside>
  </div>
  </article>
</main>
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
</body></html>`;
}

function generateCSS() {
  return `*{margin:0;padding:0;box-sizing:border-box}:root{--cream:#f8f6f1;--cream-dark:#eae6dd;--paper:#fffef9;--ink:#1c1917;--ink-light:#44403c;--ink-muted:#78716c;--ink-faint:#a8a29e;--rule:#d6d3d1;--rule-dark:#a8a29e;--accent:#9f1239;--data-bg:#f3f1ec;--mono:'JetBrains Mono',monospace}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--ink);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}a{color:inherit}.skip-link{position:absolute;top:-40px;left:0;background:var(--ink);color:var(--cream);padding:8px 16px;z-index:1000;font-family:var(--mono);font-size:12px;text-decoration:none}.skip-link:focus{top:0}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.masthead{background:var(--paper);border-bottom:1px solid var(--rule)}.masthead-top{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.masthead-main{text-align:center;padding:28px 32px 24px}.masthead-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;letter-spacing:.02em;margin-bottom:4px}.masthead-subtitle{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.stats-bar{background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:12px;display:flex}.stat-block{flex:1;padding:16px 24px;border-right:1px solid rgba(255,255,255,.15);display:flex;justify-content:space-between;align-items:baseline}.stat-block:last-child{border-right:none}.stat-label{opacity:.6;text-transform:uppercase;letter-spacing:.1em;font-size:10px}.stat-value{font-size:18px;font-weight:600}.main-nav{display:flex;justify-content:center;gap:40px;padding:14px 32px;background:var(--cream);border-bottom:2px solid var(--ink)}.main-nav a{font-size:11px;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;color:var(--ink-light);font-weight:500;transition:color .2s}.main-nav a:hover,.main-nav a.active{color:var(--accent)}.main-layout{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 200px)}.sidebar{background:var(--paper);border-right:1px solid var(--rule);font-family:var(--mono);font-size:12px}.sidebar-section{border-bottom:1px solid var(--rule)}.sidebar-header{padding:12px 16px;background:var(--data-bg);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);display:flex;justify-content:space-between;border-bottom:1px solid var(--rule)}.query-display{padding:16px;background:var(--cream-dark);border-bottom:1px solid var(--rule)}.query-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;font-weight:600}.query-tags{display:flex;flex-wrap:wrap;gap:6px}.query-tag{background:var(--paper);border:1px solid var(--rule);padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:8px}.query-tag .remove{color:var(--ink-faint);cursor:pointer;font-size:14px}.query-tag .remove:hover{color:var(--accent)}.filter-list{max-height:200px;overflow-y:auto}.filter-item{display:flex;justify-content:space-between;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent}.filter-item:hover{background:var(--cream);border-left-color:var(--rule-dark)}.filter-item:focus{outline:2px solid var(--accent);outline-offset:-2px}.filter-item.active{background:var(--cream);border-left-color:var(--accent)}.filter-item .name{color:var(--ink-light)}.filter-item.active .name{color:var(--ink);font-weight:500}.filter-item .count{color:var(--ink-faint)}.content{background:var(--cream)}.content-header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;border-bottom:1px solid var(--rule);background:var(--paper)}.content-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:400}.content-meta{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.search-box input{padding:10px 16px;border:1px solid var(--rule);background:var(--cream);font-family:var(--mono);font-size:12px;width:280px}.search-box input:focus{outline:2px solid var(--accent);outline-offset:-2px;border-color:var(--ink)}.table-wrapper{overflow-x:auto}.film-table{width:100%;border-collapse:collapse;font-size:13px}.film-table th{background:var(--data-bg);padding:12px 16px;text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);border-bottom:2px solid var(--rule-dark);font-weight:600;position:sticky;top:0;z-index:10}.film-table td{padding:16px;border-bottom:1px solid var(--rule);vertical-align:top;background:var(--paper)}.film-table tr:hover td{background:var(--cream)}.film-table tr.hidden{display:none}.table-year{font-family:'Playfair Display',serif;font-size:24px;font-weight:500;color:var(--ink);line-height:1}.table-country{font-family:var(--mono);font-size:10px;color:var(--ink-muted);margin-top:4px;letter-spacing:.05em}.table-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.3;text-decoration:none;display:block}.table-title:hover{color:var(--accent)}.table-title:focus{outline:2px solid var(--accent);outline-offset:2px}.table-original{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.table-meta{font-size:12px;color:var(--ink-light);line-height:1.7}.table-meta strong{font-weight:500;color:var(--ink)}.table-technique{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500}.table-runtime{font-family:var(--mono);font-size:12px;color:var(--ink-light)}.confidence-pips{font-family:var(--mono);font-size:14px;letter-spacing:2px}.confidence-pips .filled{color:var(--accent)}.confidence-pips .empty{color:var(--rule)}.watch-cell{text-align:right}.watch-btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--cream);padding:10px 18px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.05em;text-decoration:none;transition:background .2s}.watch-btn:hover,.watch-btn:focus{background:var(--accent)}.subs-badge{display:block;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--ink-muted)}.no-link{font-family:var(--mono);font-size:12px;color:var(--ink-faint)}.load-more-container{padding:32px;text-align:center;background:var(--paper);border-top:1px solid var(--rule)}.load-more-btn{background:var(--ink);color:var(--cream);border:none;padding:16px 40px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;cursor:pointer;transition:background .2s}.load-more-btn:hover,.load-more-btn:focus{background:var(--accent);outline:none}.load-more-btn:disabled{background:var(--ink-muted);cursor:not-allowed}.load-more-count{opacity:.6;font-weight:400}.detail-page{padding:48px 32px;max-width:1200px;margin:0 auto}.detail-header{display:grid;grid-template-columns:180px 1fr auto;gap:40px;padding-bottom:40px;border-bottom:2px solid var(--ink);margin-bottom:40px}.detail-year-block{background:var(--data-bg);padding:32px;text-align:center;border:1px solid var(--rule)}.detail-year{font-family:'Playfair Display',serif;font-size:56px;font-weight:400;line-height:1;color:var(--ink)}.detail-country{font-family:var(--mono);font-size:12px;letter-spacing:.15em;color:var(--ink-muted);margin-top:12px}.detail-title-section{display:flex;flex-direction:column;justify-content:center}.detail-technique{font-family:var(--mono);font-size:11px;letter-spacing:.15em;color:var(--accent);font-weight:600;margin-bottom:12px}.detail-title{font-family:'Playfair Display',serif;font-size:38px;font-weight:400;line-height:1.15;margin-bottom:8px}.detail-original{font-family:'Source Serif 4',serif;font-size:20px;font-style:italic;color:var(--ink-muted);margin-bottom:20px}.detail-credits{font-size:15px;color:var(--ink-light);line-height:1.8}.detail-credits strong{font-weight:500;color:var(--ink)}.detail-actions{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:12px}.detail-watch-btn{display:flex;align-items:center;gap:12px;background:var(--ink);color:var(--cream);padding:18px 32px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-decoration:none;transition:background .2s}.detail-watch-btn:hover,.detail-watch-btn:focus{background:var(--accent)}.detail-subs{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.detail-body{display:grid;grid-template-columns:1fr 280px;gap:60px}.detail-content h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:400;margin-bottom:16px;margin-top:36px}.detail-content h2:first-child{margin-top:0}.detail-content p{font-family:'Source Serif 4',serif;font-size:16px;line-height:1.9;color:var(--ink-light);margin-bottom:20px}.detail-content .no-content{font-style:italic;color:var(--ink-muted)}.detail-data-panel{background:var(--data-bg);border:1px solid var(--rule);padding:24px;font-family:var(--mono);font-size:12px;height:fit-content}.data-panel-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}.data-list{display:block}.data-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}.data-row:last-of-type{border-bottom:none}.data-label{color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;font-size:10px}.data-value{color:var(--ink);text-align:right;font-weight:500}.data-links{margin-top:24px;padding-top:24px;border-top:1px solid var(--rule)}.data-link{display:block;padding:8px 0;color:var(--ink-light);text-decoration:none;transition:color .15s;border-bottom:1px solid var(--rule)}.data-link:last-child{border-bottom:none}.data-link:hover,.data-link:focus{color:var(--accent)}.data-link::before{content:'→';margin-right:8px;color:var(--ink-faint)}.about-section{background:var(--paper);border-top:2px solid var(--ink);padding:80px 32px}.about-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px}.about-text h2{font-family:'Playfair Display',serif;font-size:32px;font-weight:400;line-height:1.3;margin-bottom:24px}.about-text h2 em{font-style:italic}.about-text p{font-family:'Source Serif 4',serif;font-size:15px;line-height:1.9;color:var(--ink-light);margin-bottom:16px}.about-data{background:var(--data-bg);border:1px solid var(--rule);padding:32px;font-family:var(--mono)}.about-data-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:24px}.about-stat-row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--rule);align-items:baseline}.about-stat-row:last-child{border-bottom:none}.about-stat-label{font-size:12px;color:var(--ink-light)}.about-stat-value{font-size:24px;font-weight:600;color:var(--ink)}.footer{background:var(--ink);color:var(--cream);padding:32px}.footer-inner{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}.footer-logo{font-family:'Playfair Display',serif;font-size:18px}.footer-timestamp{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.4)}@media(max-width:900px){.main-layout{grid-template-columns:1fr}.sidebar{display:none}.stats-bar{flex-wrap:wrap}.stat-block{flex:1 1 50%}.detail-header{grid-template-columns:1fr}.detail-body{grid-template-columns:1fr}.about-inner{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
/* Country Pages */
.country-page{padding:48px 32px;max-width:1400px;margin:0 auto}
.country-header{display:grid;grid-template-columns:auto 1fr auto;gap:32px;align-items:center;padding-bottom:32px;border-bottom:2px solid var(--ink);margin-bottom:40px}
.country-code-block{background:var(--ink);color:var(--cream);padding:24px 32px;text-align:center}
.country-code-large{font-family:var(--mono);font-size:32px;font-weight:600;letter-spacing:.1em}
.country-title-section h1.country-name{font-family:'Playfair Display',serif;font-size:42px;font-weight:400;margin-bottom:8px}
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
@media(max-width:900px){.country-header{grid-template-columns:1fr;text-align:center}.country-code-block{width:fit-content;margin:0 auto}.country-nav{text-align:center;margin-top:16px}.countries-grid{grid-template-columns:1fr}}`;
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
const allFilms=window.ALL_FILMS_DATA||[];
let activeFilters={};
let loadedCount=parseInt(loadMoreBtn?.dataset.loaded||allFilms.length);
const BATCH_SIZE=50;

const countryCodes={USSR:'USSR',Russia:'RUS',Czechoslovakia:'CSSR','Czech Republic':'CZE',Poland:'POL',Hungary:'HUN',Yugoslavia:'YUG',Croatia:'HRV',Serbia:'SRB',Romania:'ROU','East Germany':'DDR',Germany:'DEU',China:'CHN',Japan:'JPN',USA:'USA',France:'FRA',UK:'GBR',Canada:'CAN',Italy:'ITA',Australia:'AUS',India:'IND',Thailand:'THA',Vietnam:'VNM',UAE:'UAE',Cuba:'CUB',Brazil:'BRA',Belgium:'BEL',Philippines:'PHL',Malaysia:'MYS',Indonesia:'IDN','South Africa':'ZAF',Egypt:'EGY',Iran:'IRN',Argentina:'ARG',Mexico:'MEX','South Korea':'KOR',Taiwan:'TWN',Turkey:'TUR',Nigeria:'NGA',Kenya:'KEN',Zambia:'ZMB','Saudi Arabia':'SAU','North Korea':'PRK',Spain:'ESP',Netherlands:'NLD',Sweden:'SWE',Denmark:'DNK',Norway:'NOR',Switzerland:'CHE',Ireland:'IRL','New Zealand':'NZL',Singapore:'SGP',Israel:'ISR',Slovakia:'SVK',Bulgaria:'BGR',Ukraine:'UKR',Estonia:'EST',Latvia:'LVA',Lithuania:'LTU',Georgia:'GEO',Armenia:'ARM',Chile:'CHL',Other:'OTH'};
function getCC(c){return countryCodes[c]||c?.substring(0,3).toUpperCase()||'???';}
function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function slugify(s){return(s||'untitled').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
function confPips(c){const l={'★':1,'★★':2,'★★★':3,'★★★★':4,'★★★★★':5};const n=l[c]||0;return '<span class="filled">'+'■'.repeat(n)+'</span><span class="empty">'+'□'.repeat(5-n)+'</span>';}

function renderRow(f){
  const dec=f.year?Math.floor(f.year/10)*10:'';
  return '<tr data-country="'+escHtml(f.country||'')+'" data-decade="'+dec+'" data-technique="'+escHtml((f.technique||[]).join(','))+'" data-watchable="'+(f.watchLinks?'true':'false')+'" data-subs="'+(f.hasSubtitles?'true':'false')+'">'+
    '<td><div class="table-year">'+(f.year||'—')+'</div><div class="table-country">'+getCC(f.country)+'</div></td>'+
    '<td><a href="films/'+slugify(f.title)+'-'+f.id.slice(0,8)+'.html" class="table-title">'+(escHtml(f.title)||'Untitled')+'</a>'+(f.original?'<div class="table-original">'+escHtml(f.original)+'</div>':'')+'</td>'+
    '<td class="table-meta">'+(f.director?'<strong>'+escHtml(f.director)+'</strong><br>':'')+(f.studio?escHtml(f.studio):'')+'</td>'+
    '<td class="table-technique">'+((f.technique&&f.technique[0])?f.technique[0].toUpperCase():'—')+'</td>'+
    '<td class="table-runtime">'+(escHtml(f.runtime)||'—')+'</td>'+
    '<td><span class="confidence-pips">'+confPips(f.confidence)+'</span></td>'+
    '<td class="watch-cell">'+(f.watchLinks?'<a href="'+escHtml(f.watchLinks)+'" class="watch-btn" target="_blank" rel="noopener">▶ WATCH</a>'+(f.hasSubtitles?'<span class="subs-badge">EN subs</span>':''):'<span class="no-link">—</span>')+'</td></tr>';
}

function getFilteredFilms(){
  const term=searchInput.value.toLowerCase();
  return allFilms.filter(f=>{
    if(term){
      const t=(f.title||'').toLowerCase();
      const o=(f.original||'').toLowerCase();
      const d=(f.director||'').toLowerCase();
      if(!t.includes(term)&&!o.includes(term)&&!d.includes(term))return false;
    }
    if(activeFilters.country&&f.country!==activeFilters.country)return false;
    if(activeFilters.decade){const dec=f.year?Math.floor(f.year/10)*10:0;if(dec!=activeFilters.decade)return false;}
    if(activeFilters.technique&&!(f.technique||[]).includes(activeFilters.technique))return false;
    if(activeFilters.watchable&&!f.watchLinks)return false;
    if(activeFilters.subtitles&&!f.hasSubtitles)return false;
    return true;
  });
}

function updateDisplay(){
  const filtered=getFilteredFilms();
  const isFiltered=searchInput.value||Object.keys(activeFilters).length>0;
  if(isFiltered){
    tbody.innerHTML=filtered.map(renderRow).join('');
    if(loadMoreBtn)loadMoreBtn.style.display='none';
  }else{
    const rows=tbody.querySelectorAll('tr');
    rows.forEach((row,i)=>{row.classList.toggle('hidden',i>=loadedCount);});
    if(loadMoreBtn){
      loadMoreBtn.style.display=loadedCount>=allFilms.length?'none':'inline-block';
      const rem=allFilms.length-loadedCount;
      loadMoreBtn.querySelector('.load-more-count').textContent='('+rem+' remaining)';
    }
  }
  resultsCount.textContent=filtered.length.toLocaleString()+' films';
  updateQueryDisplay();
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

searchInput.addEventListener('input',updateDisplay);

filterItems.forEach(item=>{
  item.setAttribute('tabindex','0');
  item.setAttribute('role','option');
  const handler=function(){
    const type=this.dataset.filterType;
    let value=this.dataset.filterValue;
    if(type==='decade')value=parseInt(value.split('–')[0]);
    if(activeFilters[type]===value){delete activeFilters[type];this.classList.remove('active');this.setAttribute('aria-selected','false');}
    else{filterItems.forEach(fi=>{if(fi.dataset.filterType===type){fi.classList.remove('active');fi.setAttribute('aria-selected','false');}});activeFilters[type]=value;this.classList.add('active');this.setAttribute('aria-selected','true');}
    updateDisplay();
  };
  item.addEventListener('click',handler);
  item.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();handler.call(this);}});
});

if(loadMoreBtn){
  loadMoreBtn.addEventListener('click',function(){
    const newCount=Math.min(loadedCount+BATCH_SIZE,allFilms.length);
    const fragment=document.createDocumentFragment();
    for(let i=loadedCount;i<newCount;i++){
      const temp=document.createElement('template');
      temp.innerHTML=renderRow(allFilms[i]);
      fragment.appendChild(temp.content.firstChild);
    }
    tbody.appendChild(fragment);
    loadedCount=newCount;
    this.dataset.loaded=loadedCount;
    updateDisplay();
  });
}
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
    if (film.watchLinks) watchable++;
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

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(country)} Animation — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/countries/${slugify(country)}.html">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(country)} Animation">
<meta name="twitter:description" content="${escapeHtml(description)}">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${generateCountryJsonLd(country, countryFilms)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
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
      <table class="film-table" role="grid">
        <thead>
          <tr>
            <th scope="col" style="width:90px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px">Technique</th>
            <th scope="col" style="width:70px">Runtime</th>
            <th scope="col" style="width:90px">Confidence</th>
            <th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th>
          </tr>
        </thead>
        <tbody>${generateTableRows(countryFilms)}</tbody>
      </table>
    </div>
  </section>
</main>
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
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

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="Countries — Global Animation Archive">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_URL}/countries/">
<meta property="og:site_name" content="Global Animation Archive">
<meta property="og:locale" content="en_US">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Countries — Global Animation Archive">
<meta name="twitter:description" content="${escapeHtml(description)}">

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

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
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
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
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

function generateSitemap(countriesWithFilms) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_URL}/countries/`, priority: '0.9', changefreq: 'weekly' }
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

function generateRobotsTxt() {
  return `# Global Animation Archive
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function build() {
  console.log('🔨 Building static site...');
  mkdirSync('./dist', { recursive: true });
  mkdirSync('./dist/films', { recursive: true });

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

  writeFileSync('./dist/styles.css', generateCSS());
  console.log('  ✓ styles.css (with country page styles)');

  writeFileSync('./dist/app.js', generateJS());
  console.log('  ✓ app.js (with pagination + keyboard nav)');

  writeFileSync('./dist/sitemap.xml', generateSitemap(countriesWithFilms));
  console.log('  ✓ sitemap.xml (' + (films.length + countryCount + 2) + ' URLs)');

  writeFileSync('./dist/robots.txt', generateRobotsTxt());
  console.log('  ✓ robots.txt');

  console.log(`\n✅ Build complete! Output in ./dist/`);
  console.log(`\n📊 Features:`);
  console.log(`   • Pagination: Initial load ${FILMS_PER_PAGE} films`);
  console.log(`   • Country pages: ${countryCount} countries with dedicated pages`);
  console.log(`   • SEO: sitemap.xml, robots.txt, OG tags, JSON-LD on all pages`);
  console.log(`   • Accessibility: Skip links, ARIA labels, keyboard navigation`);
}

build();
