import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const stats = JSON.parse(readFileSync('./data/stats.json', 'utf-8'));
const BUILD_DATE = new Date().toISOString().split('T')[0];
const BUILD_TIMESTAMP = new Date().toISOString();
const SITE_URL = 'https://animationarchive.netlify.app';
const FILMS_PER_PAGE = 50;
const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎞️</text></svg>">`;
const OG_IMAGE = `${SITE_URL}/og-image.png`;

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

function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(str) { return (str || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function getFilmUrl(film, basePath = '') { return `${basePath}films/${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html`; }
function getFilmFilename(film) { return `${slugify(film.titleEnglish)}-${film.id.slice(0,8)}.html`; }

/// Generate footer with random film link
// pathPrefix: '' for root, '../' for sub-pages
function generateFooter(pathPrefix = '') {
  // For static pages, pick a random film at build time (changes daily with rebuilds)
  const randomFilm = films[Math.floor(Math.random() * films.length)];
  const randomUrl = pathPrefix + getFilmUrl(randomFilm);
  return `<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><a href="${randomUrl}" class="footer-random">🎲 Random Film</a><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer><button class="back-to-top" aria-label="Back to top">↑</button>`;
}

// Film of the Day: deterministic selection based on date
function getFilmOfTheDay(filmList) {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % filmList.length;
  return filmList[index];
}

function generateFilmOfTheDayCard(film) {
  const synopsis = film.synopsis ? (film.synopsis.length > 120 ? film.synopsis.substring(0, 117) + '...' : film.synopsis) : '';
  const techniques = film.technique?.join(', ') || 'Unknown';

  return `
    <div class="film-of-day">
      <div class="film-of-day-header">
        <span class="film-of-day-label">Film of the Day</span>
        <span class="film-of-day-date">${BUILD_DATE}</span>
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
          <a href="${getFilmUrl(film)}" class="film-of-day-details-btn">View Details</a>
          ${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="film-of-day-watch-btn" target="_blank" rel="noopener">▶ Watch</a>` : ''}
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

  if (sections.length === 0) return '';

  return `
  <section class="related-films">
    ${sections.map(section => `
    <div class="related-section">
      <h3 class="related-header">
        <a href="${section.link}">${escapeHtml(section.title)}</a>
        <span class="related-count">${section.count} films →</span>
      </h3>
      <div class="related-grid">
        ${section.films.map(f => `
        <a href="${getFilmFilename(f)}" class="related-card">
          <span class="related-title">${escapeHtml(f.titleEnglish) || 'Untitled'}</span>
          <span class="related-meta">${f.year || '?'}${f.director ? ` · ${escapeHtml(f.director.split(',')[0].trim())}` : ''}</span>
          ${f.watchLinks ? '<span class="related-watch">▶</span>' : ''}
        </a>`).join('')}
      </div>
    </div>`).join('')}
  </section>`;
}

function generateTableRows(filmList, basePath = '') {
  return filmList.map(film => `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${film.watchLinks ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}" data-director="${escapeHtml(film.director || '')}">
      <td><div class="table-year">${film.year || '—'}</div><div class="table-country">${getCountryCode(film.country)}</div></td>
      <td><a href="${getFilmUrl(film, basePath)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
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
    // Add link for technique filters
    if (type === 'technique' && item.name) {
      return `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${value}">
      <a href="techniques/${slugify(item.name)}.html" class="filter-link"><span class="name">${displayName}</span></a><span class="count">${item.count}</span>
    </div>`;
    }
    // Add link for decade filters
    if (type === 'decade' && item.decade) {
      return `
    <div class="filter-item" data-filter-type="${type}" data-filter-value="${value}">
      <a href="decades/${item.decade}s.html" class="filter-link"><span class="name">${displayName}</span></a><span class="count">${item.count}</span>
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
<nav class="main-nav" aria-label="Main navigation"><a href="index.html" class="active" aria-current="page">Collection</a><a href="countries/">Countries</a><a href="techniques/">Techniques</a><a href="directors/">Directors</a><a href="decades/">Decades</a><a href="#about">About</a></nav>
<div class="main-layout">
  <aside class="sidebar" role="complementary" aria-label="Browse and filter">
    <div class="sidebar-group">
      <div class="sidebar-group-header">Browse</div>
      <nav class="browse-nav" aria-label="Browse sections">
        <a href="countries/" class="browse-link"><span class="browse-arrow">→</span> Countries <span class="count">${Object.keys(stats.countries).length}</span></a>
        <a href="techniques/" class="browse-link"><span class="browse-arrow">→</span> Techniques <span class="count">${Object.keys(stats.techniques).length}</span></a>
        <a href="directors/" class="browse-link"><span class="browse-arrow">→</span> Directors <span class="count">547</span></a>
        <a href="decades/" class="browse-link"><span class="browse-arrow">→</span> Decades <span class="count">${stats.decadesSorted.length}</span></a>
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
    </div>
  </aside>
  <main class="content" id="main-content">
    <div class="content-header"><div><h2 class="content-title">From the Collection</h2><span class="content-meta" id="results-count">${stats.total.toLocaleString()} films</span></div><div class="search-actions"><div class="search-box"><label for="search-input" class="visually-hidden">Search films</label><input type="text" id="search-input" placeholder="Search titles, directors..." aria-describedby="results-count" /></div><button id="random-film-btn" class="random-btn" aria-label="Go to random film">🎲 Random</button></div><div class="keyboard-hints"><kbd>/</kbd> search <kbd>r</kbd> random <kbd>esc</kbd> clear</div></div>
    ${generateFilmOfTheDayCard(getFilmOfTheDay(films))}
    <div class="table-wrapper"><table class="film-table" role="grid"><thead><tr><th scope="col" style="width:90px" class="sortable active" data-sort="year">Year <span class="sort-indicator">▼</span></th><th scope="col" class="sortable" data-sort="title">Title <span class="sort-indicator"></span></th><th scope="col">Director / Studio</th><th scope="col" style="width:100px" class="sortable" data-sort="technique">Technique <span class="sort-indicator"></span></th><th scope="col" style="width:70px">Runtime</th><th scope="col" style="width:90px">Confidence</th><th scope="col" style="width:110px"><span class="visually-hidden">Watch</span></th></tr></thead><tbody id="film-tbody">${generateTableRows(initialFilms)}</tbody></table></div>
    <div id="no-results" class="no-results" style="display:none"><h3 class="no-results-title">No films match your filters</h3><p class="no-results-message">Try adjusting your search or removing some filters.</p></div>
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
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><a href="#" class="footer-random" id="footer-random-link">🎲 Random</a><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
<button class="back-to-top" aria-label="Back to top">↑</button>
<script>window.ALL_FILMS_DATA=${JSON.stringify(films.map(f => ({
  id: f.id,
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
  ${generateRelatedFilmsSection(film)}
</main>
${generateFooter('../')}
</body></html>`;
}

function generateCSS() {
  return `*{margin:0;padding:0;box-sizing:border-box}:root{--cream:#f8f6f1;--cream-dark:#eae6dd;--paper:#fffef9;--ink:#1c1917;--ink-light:#44403c;--ink-muted:#78716c;--ink-faint:#a8a29e;--rule:#d6d3d1;--rule-dark:#a8a29e;--accent:#9f1239;--data-bg:#f3f1ec;--mono:'JetBrains Mono',monospace}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;background:var(--cream);color:var(--ink);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}a{color:inherit}.skip-link{position:absolute;top:-40px;left:0;background:var(--ink);color:var(--cream);padding:8px 16px;z-index:1000;font-family:var(--mono);font-size:12px;text-decoration:none}.skip-link:focus{top:0}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.masthead{background:var(--paper);border-bottom:1px solid var(--rule)}.masthead-top{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.masthead-main{text-align:center;padding:28px 32px 24px}.masthead-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;letter-spacing:.02em;margin-bottom:4px}.masthead-subtitle{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.stats-bar{background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:12px;display:flex}.stat-block{flex:1;padding:16px 24px;border-right:1px solid rgba(255,255,255,.15);display:flex;justify-content:space-between;align-items:baseline}.stat-block:last-child{border-right:none}.stat-label{opacity:.6;text-transform:uppercase;letter-spacing:.1em;font-size:10px}.stat-value{font-size:18px;font-weight:600}.main-nav{display:flex;justify-content:center;gap:40px;padding:14px 32px;background:var(--cream);border-bottom:2px solid var(--ink)}.main-nav a{font-size:11px;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;color:var(--ink-light);font-weight:500;transition:color .2s}.main-nav a:hover,.main-nav a.active{color:var(--accent)}.main-layout{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 200px)}.sidebar{background:var(--paper);border-right:1px solid var(--rule);font-family:var(--mono);font-size:12px}.sidebar-group{border-bottom:1px solid var(--rule)}.sidebar-group-header{padding:12px 16px;background:var(--ink);color:var(--cream);font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:600}.browse-nav{display:flex;flex-direction:column}.browse-link{display:flex;align-items:center;padding:10px 16px;font-family:var(--mono);font-size:12px;color:var(--ink-light);text-decoration:none;border-bottom:1px solid var(--rule);transition:background .15s,color .15s}.browse-link:last-child{border-bottom:none}.browse-link:hover{background:var(--cream);color:var(--accent)}.browse-arrow{margin-right:8px;color:var(--ink-faint)}.browse-link:hover .browse-arrow{color:var(--accent)}.browse-link .count{margin-left:auto;color:var(--ink-faint);font-size:11px}.sidebar-section{border-bottom:1px solid var(--rule)}.sidebar-header{padding:12px 16px;background:var(--data-bg);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);display:flex;justify-content:space-between;border-bottom:1px solid var(--rule)}.query-display{padding:16px;background:var(--cream-dark);border-bottom:1px solid var(--rule)}.query-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;font-weight:600}.query-tags{display:flex;flex-wrap:wrap;gap:6px}.query-tag{background:var(--paper);border:1px solid var(--rule);padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:8px}.query-tag .remove{color:var(--ink-faint);cursor:pointer;font-size:14px}.query-tag .remove:hover{color:var(--accent)}.filter-list{max-height:200px;overflow-y:auto}.filter-item{display:flex;justify-content:space-between;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent}.filter-item:hover{background:var(--cream);border-left-color:var(--rule-dark)}.filter-item:focus{outline:2px solid var(--accent);outline-offset:-2px}.filter-item.active{background:var(--cream);border-left-color:var(--accent)}.filter-item .name{color:var(--ink-light)}.filter-item.active .name{color:var(--ink);font-weight:500}.filter-item .count{color:var(--ink-faint)}.content{background:var(--cream)}.content-header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;border-bottom:1px solid var(--rule);background:var(--paper)}.content-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:400}.content-meta{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.search-box input{padding:10px 16px;border:1px solid var(--rule);background:var(--cream);font-family:var(--mono);font-size:12px;width:280px}.search-box input:focus{outline:2px solid var(--accent);outline-offset:-2px;border-color:var(--ink)}.table-wrapper{overflow-x:auto}.film-table{width:100%;border-collapse:collapse;font-size:13px}.film-table thead{position:sticky;top:0;z-index:10;transition:box-shadow .2s}.film-table thead.is-sticky{box-shadow:0 2px 8px rgba(0,0,0,.1)}.film-table th{background:var(--data-bg);padding:12px 16px;text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted);border-bottom:2px solid var(--rule-dark);font-weight:600}.film-table td{padding:16px;border-bottom:1px solid var(--rule);vertical-align:top;background:var(--paper)}.film-table tr:hover td{background:var(--cream)}.film-table tr.hidden{display:none}.table-year{font-family:'Playfair Display',serif;font-size:24px;font-weight:500;color:var(--ink);line-height:1}.table-country{font-family:var(--mono);font-size:10px;color:var(--ink-muted);margin-top:4px;letter-spacing:.05em}.table-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.3;text-decoration:none;display:block}.table-title:hover{color:var(--accent)}.table-title:focus{outline:2px solid var(--accent);outline-offset:2px}.table-original{font-family:'Source Serif 4',serif;font-size:13px;font-style:italic;color:var(--ink-muted)}.table-meta{font-size:12px;color:var(--ink-light);line-height:1.7}.table-meta strong{font-weight:500;color:var(--ink)}.table-technique{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500}.table-runtime{font-family:var(--mono);font-size:12px;color:var(--ink-light)}.confidence-pips{font-family:var(--mono);font-size:14px;letter-spacing:2px}.confidence-pips .filled{color:var(--accent)}.confidence-pips .empty{color:var(--rule)}.watch-cell{text-align:right}.watch-btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--cream);padding:10px 18px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.05em;text-decoration:none;transition:background .2s}.watch-btn:hover,.watch-btn:focus{background:var(--accent)}.subs-badge{display:block;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--ink-muted)}.no-link{font-family:var(--mono);font-size:12px;color:var(--ink-faint)}.load-more-container{padding:32px;text-align:center;background:var(--paper);border-top:1px solid var(--rule)}.load-more-btn{background:var(--ink);color:var(--cream);border:none;padding:16px 40px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;cursor:pointer;transition:background .2s}.load-more-btn:hover,.load-more-btn:focus{background:var(--accent);outline:none}.load-more-btn:disabled{background:var(--ink-muted);cursor:not-allowed}.load-more-count{opacity:.6;font-weight:400}.detail-page{padding:48px 32px;max-width:1200px;margin:0 auto}.detail-header{display:grid;grid-template-columns:180px 1fr auto;gap:40px;padding-bottom:40px;border-bottom:2px solid var(--ink);margin-bottom:40px}.detail-year-block{background:var(--data-bg);padding:32px;text-align:center;border:1px solid var(--rule)}.detail-year{font-family:'Playfair Display',serif;font-size:56px;font-weight:400;line-height:1;color:var(--ink)}.detail-country{font-family:var(--mono);font-size:12px;letter-spacing:.15em;color:var(--ink-muted);margin-top:12px}.detail-title-section{display:flex;flex-direction:column;justify-content:center}.detail-technique{font-family:var(--mono);font-size:11px;letter-spacing:.15em;color:var(--accent);font-weight:600;margin-bottom:12px}.detail-title{font-family:'Playfair Display',serif;font-size:38px;font-weight:400;line-height:1.15;margin-bottom:8px}.detail-original{font-family:'Source Serif 4',serif;font-size:20px;font-style:italic;color:var(--ink-muted);margin-bottom:20px}.detail-credits{font-size:15px;color:var(--ink-light);line-height:1.8}.detail-credits strong{font-weight:500;color:var(--ink)}.detail-actions{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:12px}.detail-watch-btn{display:flex;align-items:center;gap:12px;background:var(--ink);color:var(--cream);padding:18px 32px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;text-decoration:none;transition:background .2s}.detail-watch-btn:hover,.detail-watch-btn:focus{background:var(--accent)}.detail-subs{font-family:var(--mono);font-size:11px;color:var(--ink-muted)}.detail-body{display:grid;grid-template-columns:1fr 280px;gap:60px}.detail-content h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:400;margin-bottom:16px;margin-top:36px}.detail-content h2:first-child{margin-top:0}.detail-content p{font-family:'Source Serif 4',serif;font-size:16px;line-height:1.9;color:var(--ink-light);margin-bottom:20px}.detail-content .no-content{font-style:italic;color:var(--ink-muted)}.detail-data-panel{background:var(--data-bg);border:1px solid var(--rule);padding:24px;font-family:var(--mono);font-size:12px;height:fit-content}.data-panel-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}.data-list{display:block}.data-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}.data-row:last-of-type{border-bottom:none}.data-label{color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;font-size:10px}.data-value{color:var(--ink);text-align:right;font-weight:500}.data-links{margin-top:24px;padding-top:24px;border-top:1px solid var(--rule)}.data-link{display:block;padding:8px 0;color:var(--ink-light);text-decoration:none;transition:color .15s;border-bottom:1px solid var(--rule)}.data-link:last-child{border-bottom:none}.data-link:hover,.data-link:focus{color:var(--accent)}.data-link::before{content:'→';margin-right:8px;color:var(--ink-faint)}.about-section{background:var(--paper);border-top:2px solid var(--ink);padding:80px 32px}.about-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px}.about-text h2{font-family:'Playfair Display',serif;font-size:32px;font-weight:400;line-height:1.3;margin-bottom:24px}.about-text h2 em{font-style:italic}.about-text p{font-family:'Source Serif 4',serif;font-size:15px;line-height:1.9;color:var(--ink-light);margin-bottom:16px}.about-data{background:var(--data-bg);border:1px solid var(--rule);padding:32px;font-family:var(--mono)}.about-data-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:24px}.about-stat-row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--rule);align-items:baseline}.about-stat-row:last-child{border-bottom:none}.about-stat-label{font-size:12px;color:var(--ink-light)}.about-stat-value{font-size:24px;font-weight:600;color:var(--ink)}.footer{background:var(--ink);color:var(--cream);padding:32px}.footer-inner{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}.footer-logo{font-family:'Playfair Display',serif;font-size:18px}.footer-timestamp{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.4)}@media(max-width:900px){.main-layout{grid-template-columns:1fr}.sidebar{display:none}.stats-bar{flex-wrap:wrap}.stat-block{flex:1 1 50%}.detail-header{grid-template-columns:1fr}.detail-body{grid-template-columns:1fr}.about-inner{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}.back-to-top{position:fixed;bottom:2rem;right:2rem;width:44px;height:44px;background:var(--ink);color:var(--cream);border:none;border-radius:50%;font-size:1.25rem;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;z-index:100}.back-to-top.visible{opacity:.8;visibility:visible}.back-to-top:hover{opacity:1}.keyboard-hints{font-family:var(--mono);font-size:10px;color:var(--ink-faint);margin-top:8px;text-align:right}.keyboard-hints kbd{display:inline-block;background:var(--data-bg);border:1px solid var(--rule);border-radius:3px;padding:2px 6px;font-size:10px;margin:0 2px}
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
.film-of-day-details-btn{font-family:var(--mono);font-size:11px;padding:10px 16px;background:var(--cream);border:1px solid var(--rule);color:var(--ink);text-decoration:none;transition:border-color .2s}
.film-of-day-details-btn:hover{border-color:var(--ink)}
.film-of-day-watch-btn{font-family:var(--mono);font-size:11px;padding:10px 16px;background:var(--ink);color:var(--cream);text-decoration:none;transition:background .2s}
.film-of-day-watch-btn:hover{background:var(--accent)}
.footer-random{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.6);text-decoration:none;transition:color .2s}
.footer-random:hover{color:var(--cream)}
@media(max-width:900px){.search-actions{flex-direction:column;align-items:stretch;gap:8px}.search-box input{width:100%}.film-of-day{flex-direction:column;margin:20px 16px}.film-of-day-content{flex-direction:column;align-items:flex-start}.film-of-day-actions{width:100%;justify-content:flex-start}}
/* Related Films */
.related-films{padding:48px 32px;max-width:1200px;margin:0 auto;border-top:2px solid var(--rule)}
.related-section{margin-bottom:40px}
.related-section:last-child{margin-bottom:0}
.related-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule)}
.related-header a{font-family:'Playfair Display',serif;font-size:22px;font-weight:400;text-decoration:none;color:var(--ink)}
.related-header a:hover{color:var(--accent)}
.related-count{font-family:var(--mono);font-size:11px;color:var(--ink-muted);letter-spacing:.05em}
.related-count:hover{color:var(--accent)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.related-card{display:block;background:var(--paper);border:1px solid var(--rule);padding:16px;text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s;position:relative}
.related-card:hover{border-color:var(--ink);box-shadow:3px 3px 0 var(--rule)}
.related-title{display:block;font-family:'Playfair Display',serif;font-size:15px;font-weight:500;line-height:1.3;margin-bottom:8px;color:var(--ink)}
.related-meta{display:block;font-family:var(--mono);font-size:11px;color:var(--ink-muted)}
.related-watch{position:absolute;top:12px;right:12px;font-size:12px;color:var(--accent)}
@media(max-width:900px){.related-films{padding:32px 16px}.related-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.related-header{flex-direction:column;gap:8px}.related-header a{font-size:18px}}
/* 404 Error Page */
.error-page{display:flex;align-items:center;justify-content:center;min-height:60vh;padding:48px 32px}
.error-content{text-align:center;max-width:500px}
.error-code{font-family:var(--mono);font-size:120px;font-weight:600;color:var(--rule);line-height:1;margin-bottom:16px}
.error-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;margin-bottom:16px}
.error-message{font-family:'Source Serif 4',serif;font-size:18px;color:var(--ink-muted);margin-bottom:32px}
.error-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.error-btn{font-family:var(--mono);font-size:12px;font-weight:500;padding:14px 24px;text-decoration:none;transition:all .2s}
.error-btn-primary{background:var(--ink);color:var(--cream)}
.error-btn-primary:hover{background:var(--accent)}
.error-btn-secondary{background:var(--paper);color:var(--ink);border:1px solid var(--rule)}
.error-btn-secondary:hover{border-color:var(--ink)}
/* Empty search state */
.no-results{padding:48px 32px;text-align:center;background:var(--paper)}
.no-results-title{font-family:'Playfair Display',serif;font-size:24px;margin-bottom:12px}
.no-results-message{font-family:'Source Serif 4',serif;color:var(--ink-muted);font-size:16px}
/* Sortable table headers */
.sortable{cursor:pointer;user-select:none;transition:color .15s}
.sortable:hover{color:var(--accent)}
.sort-indicator{margin-left:4px;opacity:0.4;font-size:10px}
.sortable.active .sort-indicator{opacity:1;color:var(--accent)}`;
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
let currentSort={column:'year',direction:'desc'};

const countryCodes={USSR:'USSR',Russia:'RUS',Czechoslovakia:'CSSR','Czech Republic':'CZE',Poland:'POL',Hungary:'HUN',Yugoslavia:'YUG',Croatia:'HRV',Serbia:'SRB',Romania:'ROU','East Germany':'DDR',Germany:'DEU',China:'CHN',Japan:'JPN',USA:'USA',France:'FRA',UK:'GBR',Canada:'CAN',Italy:'ITA',Australia:'AUS',India:'IND',Thailand:'THA',Vietnam:'VNM',UAE:'UAE',Cuba:'CUB',Brazil:'BRA',Belgium:'BEL',Philippines:'PHL',Malaysia:'MYS',Indonesia:'IDN','South Africa':'ZAF',Egypt:'EGY',Iran:'IRN',Argentina:'ARG',Mexico:'MEX','South Korea':'KOR',Taiwan:'TWN',Turkey:'TUR',Nigeria:'NGA',Kenya:'KEN',Zambia:'ZMB','Saudi Arabia':'SAU','North Korea':'PRK',Spain:'ESP',Netherlands:'NLD',Sweden:'SWE',Denmark:'DNK',Norway:'NOR',Switzerland:'CHE',Ireland:'IRL','New Zealand':'NZL',Singapore:'SGP',Israel:'ISR',Slovakia:'SVK',Bulgaria:'BGR',Ukraine:'UKR',Estonia:'EST',Latvia:'LVA',Lithuania:'LTU',Georgia:'GEO',Armenia:'ARM',Chile:'CHL',Other:'OTH'};
function getCC(c){return countryCodes[c]||c?.substring(0,3).toUpperCase()||'???';}
function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function slugify(s){return(s||'untitled').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
function confPips(c){const l={'★':1,'★★':2,'★★★':3,'★★★★':4,'★★★★★':5};const n=l[c]||0;return '<span class="filled">'+'■'.repeat(n)+'</span><span class="empty">'+'□'.repeat(5-n)+'</span>';}

function sortFilms(films,column,direction){
  return [...films].sort((a,b)=>{
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
  return '<tr data-country="'+escHtml(f.country||'')+'" data-decade="'+dec+'" data-technique="'+escHtml((f.technique||[]).join(','))+'" data-watchable="'+(f.watchLinks?'true':'false')+'" data-subs="'+(f.hasSubtitles?'true':'false')+'" data-director="'+escHtml(f.director||'')+'">'+
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
  const filtered=allFilms.filter(f=>{
    if(term){
      const t=(f.title||'').toLowerCase();
      const o=(f.original||'').toLowerCase();
      const d=(f.director||'').toLowerCase();
      if(!t.includes(term)&&!o.includes(term)&&!d.includes(term))return false;
    }
    if(activeFilters.format&&f.format!==activeFilters.format)return false;
    if(activeFilters.country&&f.country!==activeFilters.country)return false;
    if(activeFilters.decade){const dec=f.year?Math.floor(f.year/10)*10:0;if(dec!=activeFilters.decade)return false;}
    if(activeFilters.technique&&!(f.technique||[]).includes(activeFilters.technique))return false;
    if(activeFilters.watchable&&!f.watchLinks)return false;
    if(activeFilters.subtitles&&!f.hasSubtitles)return false;
    if(activeFilters.director){const dirs=(f.director||'').split(',').map(d=>d.trim());if(!dirs.includes(activeFilters.director))return false;}
    return true;
  });
  return sortFilms(filtered,currentSort.column,currentSort.direction);
}

function updateDisplay(resetPagination){
  const sorted=getFilteredFilms();
  const isFiltered=searchInput.value||Object.keys(activeFilters).length>0;
  const noResultsEl=document.getElementById('no-results');
  if(resetPagination)loadedCount=BATCH_SIZE;
  if(isFiltered){
    if(sorted.length===0){
      tbody.innerHTML='';
      if(noResultsEl)noResultsEl.style.display='block';
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
    }else{
      th.classList.remove('active');
      indicator.textContent='';
    }
  });
}
sortableHeaders.forEach(th=>{
  th.style.cursor='pointer';
  th.addEventListener('click',function(){
    const col=this.dataset.sort;
    if(currentSort.column===col){
      currentSort.direction=currentSort.direction==='asc'?'desc':'asc';
    }else{
      currentSort.column=col;
      currentSort.direction=col==='year'?'desc':'asc';
    }
    updateSortIndicators();
    updateDisplay(true);
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
    if (film.watchLinks) watchable++;
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
      <table class="film-table" role="grid">
        <thead>
          <tr>
            <th scope="col" style="width:90px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px">Country</th>
            <th scope="col" style="width:70px">Runtime</th>
            <th scope="col" style="width:90px">Confidence</th>
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
  return filmList.map(film => `
    <tr data-country="${escapeHtml(film.country || '')}" data-decade="${film.year ? Math.floor(film.year / 10) * 10 : ''}" data-watchable="${film.watchLinks ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div></td>
      <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${film.director ? `<strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? escapeHtml(film.studio) : ''}</td>
      <td class="table-country-cell"><span class="table-country-code">${getCountryCode(film.country)}</span><span class="table-country-name">${escapeHtml(film.country) || '—'}</span></td>
      <td class="table-runtime">${escapeHtml(film.runtime) || '—'}</td>
      <td><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="watch-btn" target="_blank" rel="noopener">▶ WATCH</a>${film.hasSubtitles ? '<span class="subs-badge">EN subs</span>' : ''}` : '<span class="no-link">—</span>'}</td>
    </tr>`).join('\n');
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
          return `<a href="../index.html?director=${encodeURIComponent(director.name)}" class="director-card">
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
  return filmList.map(film => `
    <tr data-country="${escapeHtml(film.country || '')}" data-technique="${escapeHtml(film.technique?.join(',') || '')}" data-watchable="${film.watchLinks ? 'true' : 'false'}" data-subs="${film.hasSubtitles ? 'true' : 'false'}">
      <td><div class="table-year">${film.year || '—'}</div></td>
      <td><a href="../${getFilmUrl(film)}" class="table-title">${escapeHtml(film.titleEnglish) || 'Untitled'}</a>${film.originalTitle ? `<div class="table-original">${escapeHtml(film.originalTitle)}</div>` : ''}</td>
      <td class="table-meta">${film.director ? `<strong>${escapeHtml(film.director)}</strong><br>` : ''}${film.studio ? escapeHtml(film.studio) : ''}</td>
      <td class="table-country-cell"><span class="table-country-code">${getCountryCode(film.country)}</span><span class="table-country-name">${escapeHtml(film.country) || '—'}</span></td>
      <td class="table-technique">${film.technique?.[0]?.toUpperCase() || '—'}</td>
      <td><span class="confidence-pips">${confidenceToPips(film.confidence)}</span></td>
      <td class="watch-cell">${film.watchLinks ? `<a href="${escapeHtml(film.watchLinks)}" class="watch-btn" target="_blank" rel="noopener">▶ WATCH</a>${film.hasSubtitles ? '<span class="subs-badge">EN subs</span>' : ''}` : '<span class="no-link">—</span>'}</td>
    </tr>`).join('\n');
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
    if (film.watchLinks) watchable++;
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
      <table class="film-table" role="grid">
        <thead>
          <tr>
            <th scope="col" style="width:70px">Year</th>
            <th scope="col">Title</th>
            <th scope="col">Director / Studio</th>
            <th scope="col" style="width:100px">Country</th>
            <th scope="col" style="width:100px">Technique</th>
            <th scope="col" style="width:90px">Confidence</th>
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

function generateSitemap(countriesWithFilms, techniquesWithFilms, decadesWithFilms) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_URL}/countries/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/techniques/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/directors/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/decades/`, priority: '0.9', changefreq: 'weekly' }
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
  // Pick a random film for the footer
  const randomFilm = films[Math.floor(Math.random() * films.length)];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Film Not Found — Global Animation Archive</title>
<meta name="description" content="The page you're looking for doesn't exist. Return to the Global Animation Archive collection.">
${FAVICON}
<meta name="robots" content="noindex">

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a href="#main-content" class="skip-link">Skip to main content</a>
<header class="masthead">
  <div class="masthead-top"><span><a href="/" style="color:inherit;text-decoration:none">← BACK TO COLLECTION</a></span><span>A Living Research Collection</span><span>UPDATED: ${BUILD_DATE}</span></div>
  <div class="masthead-main"><h1 class="masthead-title">Global Animation Archive</h1></div>
</header>
<main class="error-page" id="main-content">
  <div class="error-content">
    <div class="error-code">404</div>
    <h1 class="error-title">Film Not Found</h1>
    <p class="error-message">This reel seems to be missing from the archive.</p>
    <div class="error-actions">
      <a href="/" class="error-btn error-btn-primary">Back to Collection</a>
      <a href="/${getFilmUrl(randomFilm)}" class="error-btn error-btn-secondary">🎲 Random Film</a>
    </div>
  </div>
</main>
<footer class="footer"><div class="footer-inner"><div class="footer-logo">Global Animation Archive</div><div class="footer-timestamp">BUILD: ${BUILD_TIMESTAMP}</div></div></footer>
</body></html>`;
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

  // Generate technique pages
  const { count: techniqueCount, techniquesWithFilms } = generateTechniquePages();
  console.log(`  ✓ ${techniqueCount} technique pages + index (with OG tags + JSON-LD)`);

  // Generate director index
  const { count: directorCount } = generateDirectorPages();
  console.log(`  ✓ directors index (${directorCount} directors)`);

  // Generate decade pages
  const { count: decadeCount, decadesWithFilms } = generateDecadePages();
  console.log(`  ✓ ${decadeCount} decade pages + index (with OG tags + JSON-LD)`);

  writeFileSync('./dist/styles.css', generateCSS());
  console.log('  ✓ styles.css (with country + technique + directors + decade page styles)');

  writeFileSync('./dist/app.js', generateJS());
  console.log('  ✓ app.js (with pagination + keyboard nav)');

  writeFileSync('./dist/sitemap.xml', generateSitemap(countriesWithFilms, techniquesWithFilms, decadesWithFilms));
  console.log('  ✓ sitemap.xml (' + (films.length + countryCount + techniqueCount + decadeCount + 5) + ' URLs)');

  writeFileSync('./dist/robots.txt', generateRobotsTxt());
  console.log('  ✓ robots.txt');

  writeFileSync('./dist/404.html', generate404Page());
  console.log('  ✓ 404.html');

  console.log(`\n✅ Build complete! Output in ./dist/`);
  console.log(`\n📊 Features:`);
  console.log(`   • Pagination: Initial load ${FILMS_PER_PAGE} films`);
  console.log(`   • Country pages: ${countryCount} countries with dedicated pages`);
  console.log(`   • Technique pages: ${techniqueCount} techniques with dedicated pages`);
  console.log(`   • Directors index: ${directorCount} directors with filter links`);
  console.log(`   • Decade pages: ${decadeCount} decades with dedicated pages`);
  console.log(`   • SEO: sitemap.xml, robots.txt, OG tags, JSON-LD on all pages`);
  console.log(`   • Accessibility: Skip links, ARIA labels, keyboard navigation`);
}

build();
