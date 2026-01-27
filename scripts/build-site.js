import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const stats = JSON.parse(readFileSync('./data/stats.json', 'utf-8'));
const BUILD_DATE = new Date().toISOString().split('T')[0];
const BUILD_TIMESTAMP = new Date().toISOString();

function confidenceToPips(confidence) {
  const levels = { '★': 1, '★★': 2, '★★★': 3, '★★★★': 4, '★★★★★': 5 };
  const level = levels[confidence] || 0;
  return `<span class="filled">${'■'.repeat(level)}</span><span class="empty">${'□'.repeat(5 - level)}</span>`;
}

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
  'Latvia': 'LVA', 'Lithuania': 'LTU', 'Georgia': 'GEO', 'Armenia': 'ARM', 'Chile': 'CHL', 'Other': 'OTH'
};

function getCountryCode(country) { return countryCodes[country] || country?.substring(0, 3).toUpperCase() || '???'; }
function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(str) { return (str || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function generateTableRows(filmList) {
  return filmList.map(film => `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${film.watchLinks ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
      <td><a href="films/${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${film.director ? `<strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? escapeHtml(film.studio) : ''}</td>
      <td class="table-technique">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td class="table-runtime">${escapeHtml(film.runtime) || '—'}</td>
      <td><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="watch-btn" target="_blank">▶ WATCH</a>${film.hasSubtitles ? '<span class="subs-badge">EN subs</span>' : ''}` : '<span class="no-link">—</span>'}</td>
    </tr>`).join('\n');
}

function generateFilterItems(items, type) {
  return items.slice(0, 25).map(item => `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${escapeHtml(item.name || item.decade?.toString())}">
      <span class="name">${escapeHtml(item.name || `${item.decade}s`)}</span><span class="count">${item.count}</span>
    </div>`).join('\n');
}

function generateIndexPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Global Animation Archive</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <div class="masthead-top"><span>EST. 2024</span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1><p class="masthead-subtitle">Documenting the art of animation from every corner of the world</p></div>
</header>
<div class="stats-bar">
  <div class="stat-block"><span class="stat-label">Films</span><span class="stat-value">${stats.total.toLocaleString()}</span></div>
  <div class="stat-block"><span class="stat-label">Countries</span><span class="stat-value">${Object.keys(stats.countries).length}</span></div>
  <div class="stat-block"><span class="stat-label">Techniques</span><span class="stat-value">${Object.keys(stats.techniques).length}</span></div>
  <div class="stat-block"><span class="stat-label">Watchable</span><span class="stat-value">${stats.watchable.toLocaleString()}</span></div>
</div>
<nav class="main-nav"><a href="index.html" class="active">Collection</a><a href="#about">About</a></nav>
<div class="main-layout">
  <aside class="sidebar">
    <div class="query-display" id="active-query" style="display:none;"><div class="query-label">Active Filters</div><div class="query-tags" id="query-tags"></div></div>
    <div class="sidebar-section"><div class="sidebar-header">Country <span class="count">${Object.keys(stats.countries).length}</span></div><div class="filter-list">${generateFilterItems(stats.countriesSorted, 'country')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Technique <span class="count">${Object.keys(stats.techniques).length}</span></div><div class="filter-list">${generateFilterItems(stats.techniquesSorted, 'technique')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Era</div><div class="filter-list">${generateFilterItems(stats.decadesSorted.map(d => ({ name: `${d.decade}–${d.decade + 9}`, count: d.count, decade: d.decade })), 'decade')}</div></div>
    <div class="sidebar-section"><div class="sidebar-header">Watch Status</div><div class="filter-list">
      <div class="filter-item" data-filter-type="watchable" data-filter-value="true"><span class="name">Has Watch Link</span><span class="count">${stats.watchable}</span></div>
      <div class="filter-item" data-filter-type="subtitles" data-filter-value="true"><span class="name">EN Subtitles</span><span class="count">${stats.withSubtitles}</span></div>
    </div></div>
  </aside>
  <main class="content">
    <div class="content-header"><div><h2 class="content-title">From the Collection</h2><span class="content-meta" id="results-count">${stats.total.toLocaleString()} films</span></div><div class="search-box"><input type="text" id="search-input" placeholder="Search titles, directors..." /></div></div>
    <div class="table-wrapper"><table class="film-table"><thead><tr><th style="width:90px">Year</th><th>Title</th><th>Director / Studio</th><th style="width:100px">Technique</th><th style="width:70px">Runtime</th><th style="width:90px">Confidence</th><th style="width:110px"></th></tr></thead><tbody id="film-tbody">${generateTableRows(films)}</tbody></table></div>
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
<script src="app.js"></script>
</body></html>`;
}

function generateFilmPage(film) {
  const techniques = film.technique?.join(', ') || 'Unknown';
  const specs = [film.format, film.color, film.sound].filter(Boolean).join(' · ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(film.titleEnglish || 'Untitled')} (${film.year || '?'}) — Global Animation Archive</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<header class="masthead">
  <div class="masthead-top"><span><a href="../index.html" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
<main class="detail-page">
  <div class="detail-header">
    <div class="detail-year-block"><div class="detail-year">${film.year || '?'}</div><div class="detail-country">${getCountryCode(film.country)}</div></div>
    <div class="detail-title-section">
      <div class="detail-technique">${escapeHtml(techniques.toUpperCase())}</div>
      <h1 class="detail-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</h1>
      ${film.originalTitle ? `<div class="detail-original">${escapeHtml(film.originalTitle)}</div>` : ''}
      <div class="detail-credits">${film.director ? `Directed by <strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? `Produced by <strong>${escapeHtml(film.studio)}</strong>` : ''}${film.runtime ? ` · ${escapeHtml(film.runtime)}` : ''}</div>
    </div>
    <div class="detail-actions">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="detail-watch-btn" target="_blank">▶ WATCH NOW</a>${film.hasSubtitles ? '<span class="detail-subs">EN SUBTITLES AVAILABLE</span>' : ''}` : '<span class="detail-subs">NO WATCH LINK AVAILABLE</span>'}</div>
  </div>
  <div class="detail-body">
    <div class="detail-content">
      ${film.synopsis ? `<h2>Synopsis</h2><p>${escapeHtml(film.synopsis)}</p>` : ''}
      ${film.historicalContext ? `<h2>Historical Context</h2><p>${escapeHtml(film.historicalContext)}</p>` : ''}
      ${film.keyCredits ? `<h2>Key Credits</h2><p>${escapeHtml(film.keyCredits)}</p>` : ''}
      ${film.notes ? `<h2>Notes</h2><p>${escapeHtml(film.notes)}</p>` : ''}
      ${!film.synopsis && !film.historicalContext && !film.keyCredits && !film.notes ? '<p class="no-content">No detailed information available yet.</p>' : ''}
    </div>
    <aside class="detail-data-panel">
      <div class="data-panel-title">Film Data</div>
      <div class="data-row"><span class="data-label">Technique</span><span class="data-value">${escapeHtml(techniques)}</span></div>
      <div class="data-row"><span class="data-label">Format</span><span class="data-value">${escapeHtml(specs) || '—'}</span></div>
      ${film.studio ? `<div class="data-row"><span class="data-label">Studio</span><span class="data-value">${escapeHtml(film.studio)}</span></div>` : ''}
      ${film.runtime ? `<div class="data-row"><span class="data-label">Runtime</span><span class="data-value">${escapeHtml(film.runtime)}</span></div>` : ''}
      <div class="data-row"><span class="data-label">Confidence</span><span class="data-value confidence-pips">${confidenceToPips(film.confidence)}</span></div>
      <div class="data-row"><span class="data-label">Updated</span><span class="data-value">${film.lastUpdated?.split('T')[0] || '—'}</span></div>
      ${(film.imdb || film.letterboxd || film.wikipedia) ? `<div class="data-links">${film.imdb ? `<a href="${escapeHtml(film.imdb)}" class="data-link" target="_blank">IMDb</a>` : ''}${film.letterboxd ? `<a href="${escapeHtml(film.letterboxd)}" class="data-link" target="_blank">Letterboxd</a>` : ''}${film.wikipedia ? `<a href="${escapeHtml(film.wikipedia)}" class="data-link" target="_blank">Wikipedia</a>` : ''}</div>` : ''}
    </aside>
  </div>
</main>
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
</body></html>`;
}

function generateCSS() {
  return `*{margin:0;padding:0;box-sizing:border-box}:root{--cream:#f8f6f1;--cream-dark:#eae6dd;--paper:#fffef9;--ink:#1c1917;--ink-light:#44403c;--ink-muted:#78716c;--ink-faint:#a8a29e;--rule:#d6d3d1;--rule-dark:#a8a29e;--accent:#9f1239;--data-bg:#f3f1ec;--mono:'JetBrains Mono',monospace}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--ink);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}a{color:inherit}.masthead{background:var(--paper);border-bottom:1px solid var(--rule)}.masthead-top{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.masthead-main{text-align:center;padding:28px 32px 24px}.masthead-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;letter-spacing:.02em;margin-bottom:4px}.masthead-subtitle{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.stats-bar{background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:12px;display:flex}.stat-block{flex:1;padding:16px 24px;border-right:1px solid rgba(255,255,255,.15);display:flex;justify-content:space-between;align-items:baseline}.stat-block:last-child{border-right:none}.stat-label{opacity:.6;text-transform:uppercase;letter-spacing:.1em;font-size:10px}.stat-value{font-size:18px;font-weight:600}.main-nav{display:flex;justify-content:center;gap:40px;padding:14px 32px;background:var(--cream);border-bottom:2px solid var(--ink)}.main-nav a{font-size:11px;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;color:var(--ink-light);font-weight:500;transition:color .2s}.main-nav a:hover,.main-nav a.active{color:var(--accent)}.main-layout{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 200px)}.sidebar{background:var(--paper);border-right:1px solid var(--rule);font-family:var(--mono);font-size:12px}.sidebar-section{border-bottom:1px solid var(--rule)}.sidebar-header{padding:12px 16px;background:var(--data-bg);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);display:flex;justify-content:space-between;border-bottom:1px solid var(--rule)}.query-display{padding:16px;background:var(--cream-dark);border-bottom:1px solid var(--rule)}.query-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;font-weight:600}.query-tags{display:flex;flex-wrap:wrap;gap:6px}.query-tag{background:var(--paper);border:1px solid var(--rule);padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:8px}.query-tag .remove{color:var(--ink-faint);cursor:pointer;font-size:14px}.query-tag .remove:hover{color:var(--accent)}.filter-list{max-height:200px;overflow-y:auto}.filter-item{display:flex;justify-content:space-between;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent}.filter-item:hover{background:var(--cream);border-left-color:var(--rule-dark)}.filter-item.active{background:var(--cream);border-left-color:var(--accent)}.filter-item .name{color:var(--ink-light)}.filter-item.active .name{color:var(--ink);font-weight:500}.filter-item .count{color:var(--ink-faint)}.content{background:var(--cream)}.content-header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;border-bottom:1px solid var(--rule);background:var(--paper)}.content-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:400}.content-meta{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.search-box input{padding:10px 16px;border:1px solid var(--rule);background:var(--cream);font-family:var(--mono);font-size:12px;width:280px}.search-box input:focus{outline:none;border-color:var(--ink)}.table-wrapper{overflow-x:auto}.film-table{width:100%;border-collapse:collapse;font-size:13px}.film-table th{background:var(--data-bg);padding:12px 16px;text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);border-bottom:2px solid var(--rule-dark);font-weight:600;position:sticky;top:0;z-index:10}.film-table td{padding:16px;border-bottom:1px solid var(--rule);vertical-align:top;background:var(--paper)}.film-table tr:hover td{background:var(--cream)}.film-table tr.hidden{display:none}.table-year{font-family:'Playfair Display',serif;font-size:24px;font-weight:500;color:var(--ink);line-height:1}.table-country{font-family:var(--mono);font-size:10px;color:var(--ink-muted);margin-top:4px;letter-spacing:.05em}.table-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.3;text-decoration:none;display:block}.table-title:hover{color:var(--accent)}.table-original{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.table-meta{font-size:12px;color:var(--ink-light);line-height:1.7}.table-meta strong{font-weight:500;color:var(--ink)}.table-technique{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500}.table-runtime{font-family:var(--mono);font-size:12px;color:var(--ink-light)}.confidence-pips{font-family:var(--mono);font-size:14px;letter-spacing:2px}.confidence-pips .filled{color:var(--accent)}.confidence-pips .empty{color:var(--rule)}.watch-cell{text-align:right}.watch-btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--cream);padding:10px 18px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.05em;text-decoration:none;transition:background .2s}.watch-btn:hover{background:var(--accent)}.subs-badge{display:block;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--ink-muted)}.no-link{font-family:var(--mono);font-size:12px;color:var(--ink-faint)}.detail-page{padding:48px 32px;max-width:1200px;margin:0 auto}.detail-header{display:grid;grid-template-columns:180px 1fr auto;gap:40px;padding-bottom:40px;border-bottom:2px solid var(--ink);margin-bottom:40px}.detail-year-block{background:var(--data-bg);padding:32px;text-align:center;border:1px solid var(--rule)}.detail-year{font-family:'Playfair Display',serif;font-size:56px;font-weight:400;line-height:1;color:var(--ink)}.detail-country{font-family:var(--mono);font-size:12px;letter-spacing:.15em;color:var(--ink-muted);margin-top:12px}.detail-title-section{display:flex;flex-direction:column;justify-content:center}.detail-technique{font-family:var(--mono);font-size:11px;letter-spacing:.15em;color:var(--accent);font-weight:600;margin-bottom:12px}.detail-title{font-family:'Playfair Display',serif;font-size:38px;font-weight:400;line-height:1.15;margin-bottom:8px}.detail-original{font-family:'Source Serif 4',serif;font-size:20px;font-style:italic;color:var(--ink-muted);margin-bottom:20px}.detail-credits{font-size:15px;color:var(--ink-light);line-height:1.8}.detail-credits strong{font-weight:500;color:var(--ink)}.detail-actions{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:12px}.detail-watch-btn{display:flex;align-items:center;gap:12px;background:var(--ink);color:var(--cream);padding:18px 32px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-decoration:none;transition:background .2s}.detail-watch-btn:hover{background:var(--accent)}.detail-subs{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.detail-body{display:grid;grid-template-columns:1fr 280px;gap:60px}.detail-content h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:400;margin-bottom:16px;margin-top:36px}.detail-content h2:first-child{margin-top:0}.detail-content p{font-family:'Source Serif 4',serif;font-size:16px;line-height:1.9;color:var(--ink-light);margin-bottom:20px}.detail-content .no-content{font-style:italic;color:var(--ink-muted)}.detail-data-panel{background:var(--data-bg);border:1px solid var(--rule);padding:24px;font-family:var(--mono);font-size:12px;height:fit-content}.data-panel-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}.data-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}.data-row:last-of-type{border-bottom:none}.data-label{color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;font-size:10px}.data-value{color:var(--ink);text-align:right;font-weight:500}.data-links{margin-top:24px;padding-top:24px;border-top:1px solid var(--rule)}.data-link{display:block;padding:8px 0;color:var(--ink-light);text-decoration:none;transition:color .15s;border-bottom:1px solid var(--rule)}.data-link:last-child{border-bottom:none}.data-link:hover{color:var(--accent)}.data-link::before{content:'→';margin-right:8px;color:var(--ink-faint)}.about-section{background:var(--paper);border-top:2px solid var(--ink);padding:80px 32px}.about-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px}.about-text h2{font-family:'Playfair Display',serif;font-size:32px;font-weight:400;line-height:1.3;margin-bottom:24px}.about-text h2 em{font-style:italic}.about-text p{font-family:'Source Serif 4',serif;font-size:15px;line-height:1.9;color:var(--ink-light);margin-bottom:16px}.about-data{background:var(--data-bg);border:1px solid var(--rule);padding:32px;font-family:var(--mono)}.about-data-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:24px}.about-stat-row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--rule);align-items:baseline}.about-stat-row:last-child{border-bottom:none}.about-stat-label{font-size:12px;color:var(--ink-light)}.about-stat-value{font-size:24px;font-weight:600;color:var(--ink)}.footer{background:var(--ink);color:var(--cream);padding:32px}.footer-inner{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}.footer-logo{font-family:'Playfair Display',serif;font-size:18px}.footer-timestamp{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.4)}@media(max-width:900px){.main-layout{grid-template-columns:1fr}.sidebar{display:none}.stats-bar{flex-wrap:wrap}.stat-block{flex:1 1 50%}.detail-header{grid-template-columns:1fr}.detail-body{grid-template-columns:1fr}.about-inner{grid-template-columns:1fr}}`;
}

function generateJS() {
  return `document.addEventListener('DOMContentLoaded',function(){const rows=document.querySelectorAll('#film-tbody tr');const searchInput=document.getElementById('search-input');const resultsCount=document.getElementById('results-count');const activeQueryBox=document.getElementById('active-query');const queryTags=document.getElementById('query-tags');const filterItems=document.querySelectorAll('.filter-item');let activeFilters={};function updateDisplay(){let visibleCount=0;rows.forEach(row=>{const country=row.dataset.country||'';const decade=row.dataset.decade||'';const technique=row.dataset.technique||'';const watchable=row.dataset.watchable;const title=row.querySelector('.table-title')?.textContent?.toLowerCase()||'';const director=row.querySelector('.table-meta strong')?.textContent?.toLowerCase()||'';const original=row.querySelector('.table-original')?.textContent?.toLowerCase()||'';let visible=true;const searchTerm=searchInput.value.toLowerCase();if(searchTerm&&!title.includes(searchTerm)&&!director.includes(searchTerm)&&!original.includes(searchTerm)){visible=false}if(activeFilters.country&&country!==activeFilters.country)visible=false;if(activeFilters.decade&&decade!==activeFilters.decade)visible=false;if(activeFilters.technique&&!technique.includes(activeFilters.technique))visible=false;if(activeFilters.watchable&&watchable!=='true')visible=false;row.classList.toggle('hidden',!visible);if(visible)visibleCount++});resultsCount.textContent=visibleCount.toLocaleString()+' films';updateQueryDisplay()}function updateQueryDisplay(){const hasFilters=Object.keys(activeFilters).length>0;activeQueryBox.style.display=hasFilters?'block':'none';if(hasFilters){queryTags.innerHTML=Object.entries(activeFilters).map(([type,value])=>'<span class="query-tag">'+value+' <span class="remove" data-type="'+type+'">×</span></span>').join('');queryTags.querySelectorAll('.remove').forEach(btn=>{btn.addEventListener('click',function(){delete activeFilters[this.dataset.type];document.querySelectorAll('.filter-item.active').forEach(item=>{if(item.dataset.filterType===this.dataset.type)item.classList.remove('active')});updateDisplay()})})}}searchInput.addEventListener('input',updateDisplay);filterItems.forEach(item=>{item.addEventListener('click',function(){const type=this.dataset.filterType;const value=this.dataset.filterValue;if(activeFilters[type]===value){delete activeFilters[type];this.classList.remove('active')}else{filterItems.forEach(fi=>{if(fi.dataset.filterType===type)fi.classList.remove('active')});activeFilters[type]=value;this.classList.add('active')}updateDisplay()})})});`;
}

function build() {
  console.log('🔨 Building static site...');
  mkdirSync('./dist', { recursive: true });
  mkdirSync('./dist/films', { recursive: true });
  writeFileSync('./dist/index.html', generateIndexPage());
  console.log('  ✓ index.html');
  let count = 0;
  for (const film of films) {
    const slug = slugify(film.titleEnglish);
    const filename = `${slug}-${film.id.slice(0,8)}.html`;
    writeFileSync(`./dist/films/${filename}`, generateFilmPage(film));
    count++;
  }
  console.log(`  ✓ ${count} film pages`);
  writeFileSync('./dist/styles.css', generateCSS());
  console.log('  ✓ styles.css');
  writeFileSync('./dist/app.js', generateJS());
  console.log('  ✓ app.js');
  console.log(`\n✅ Build complete! Output in ./dist/`);
}

build();
