/**
 * Fetch all films from Notion database and save as JSON
 * Run: NOTION_TOKEN=xxx NOTION_DATABASE_ID=xxx node scripts/fetch-notion.js
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { imageSize } from './lib/image-size.js';
import { queryAll } from './lib/notion.js';

const DATABASE_ID = process.env.NOTION_DATABASE_ID || '9bdc62e48ffe43fda6b992248570c49f';

// Property extractors for different Notion property types
const extractors = {
  title: (prop) => prop?.title?.[0]?.plain_text || '',
  rich_text: (prop) => prop?.rich_text?.map(r => r.plain_text).join('') || '',
  number: (prop) => prop?.number ?? null,
  select: (prop) => prop?.select?.name || null,
  multi_select: (prop) => prop?.multi_select?.map(s => s.name) || [],
  checkbox: (prop) => prop?.checkbox || false,
  url: (prop) => prop?.url || null,
  date: (prop) => prop?.date?.start || null,
  created_time: (prop) => prop?.created_time || null,
  last_edited_time: (prop) => prop?.last_edited_time || null,
  relation: (prop) => prop?.relation?.map(r => r.id) || [],
  // Notion "files" props return signed S3 URLs that expire ~1h, so we only
  // keep them long enough to download the file (see downloadPosters).
  files: (prop) => prop?.files?.map(f => (f.type === 'file' ? f.file?.url : f.external?.url)).filter(Boolean) || [],
};

function extractFilm(page) {
  const props = page.properties;

  return {
    id: page.id,
    url: page.url,
    // Core identifiers
    titleEnglish: extractors.title(props['Title (English)']),
    originalTitle: extractors.rich_text(props['Original Title']),
    romanizedTitle: extractors.rich_text(props['Romanized Title']),
    alternateTitles: extractors.rich_text(props['Alternate Titles']),
    // Production info
    year: extractors.number(props['Year']),
    country: extractors.select(props['Country']),
    director: extractors.rich_text(props['Director']),
    studio: extractors.rich_text(props['Studio']),
    keyCredits: extractors.rich_text(props['Key Credits']),
    // Technical specs
    format: extractors.select(props['Format']),
    runtime: extractors.rich_text(props['Runtime']),
    technique: extractors.multi_select(props['Technique']),
    color: extractors.select(props['Color']),
    sound: extractors.select(props['Sound']),
    // Content
    synopsis: extractors.rich_text(props['Synopsis']),
    historicalContext: extractors.rich_text(props['Historical Context']),
    sourceMaterial: extractors.rich_text(props['Source Material']),
    notes: extractors.rich_text(props['Notes']),
    // Watch info - linked Watch Links DB (two-way relation)
    watchLinksRelation: extractors.relation(props['Watch Links (Linked)']),
    hasSubtitles: extractors.checkbox(props['Has Subtitles']),
    subtitleSource: extractors.rich_text(props['Subtitle Source']),
    watchStatus: extractors.select(props['Watch Status']),
    // External links
    imdb: extractors.url(props['IMDB']),
    letterboxd: extractors.url(props['Letterboxd']),
    wikipedia: extractors.url(props['Wikipedia']),
    // Research
    researchSources: extractors.rich_text(props['Research Sources']),
    confidence: extractors.select(props['Confidence']),
    // Personal
    myRating: extractors.select(props['My Rating']),
    dateWatched: extractors.date(props['Date Watched']),
    // Metadata
    dateAdded: extractors.created_time(props['Date Added']),
    lastUpdated: extractors.last_edited_time(props['Last Updated']),
    // New fields - Phase 3
    genres: extractors.multi_select(props['Genre']),
    keywords: extractors.multi_select(props['Keywords']),
    // Relations (IDs to be resolved later)
    studioRelation: extractors.relation(props['Studio (Link)']),
    directorRelation: extractors.relation(props['Director (Link)']),
    seriesRelation: extractors.relation(props['Series/Universe']),

    // Temporary: signed poster URLs, downloaded + replaced with a local
    // `poster` object by downloadPosters(). Stripped before films.json is written.
    posterUrls: extractors.files(props['Poster images']),
  };
}

// Download poster images referenced by Notion "Poster images" and self-host
// them. Notion serves expiring signed S3 URLs, so a static site cannot link
// them directly — we download at fetch time (when the URLs are fresh), save
// under data/posters/, measure pixel dimensions (Node-only, no Pillow), and
// bake a { file, w, h, ar } object into each film. build-site.js copies
// data/posters/ into dist/ and renders from these local files.
function extFromBuffer(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
  return 'img';
}

async function downloadPosters(films) {
  const withPosters = films.filter(f => f.posterUrls && f.posterUrls.length);
  console.log(`\n🖼  Downloading ${withPosters.length} poster image(s)...`);
  mkdirSync('./data/posters', { recursive: true });

  const existing = readdirSync('./data/posters');
  const posterFor = (buf, file) => {
    const dims = imageSize(buf);
    if (!dims || !dims.width || !dims.height) throw new Error('could not read dimensions');
    return { file, w: dims.width, h: dims.height, ar: Math.round((dims.width / dims.height) * 1000) / 1000 };
  };

  let ok = 0, kept = 0, failed = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < withPosters.length; i += CONCURRENCY) {
    const batch = withPosters.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (film) => {
      const url = film.posterUrls[0]; // one image per film today; take the first
      const id8 = film.id.slice(0, 8);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const file = `${id8}.${extFromBuffer(buf)}`;
        film.poster = posterFor(buf, file);
        writeFileSync(`./data/posters/${file}`, buf);
        ok++;
      } catch (e) {
        // Transient failure: keep the previously downloaded poster, if any,
        // rather than dropping the film's artwork from the site.
        const previous = existing.find(f => f.startsWith(`${id8}.`));
        if (previous) {
          try {
            film.poster = posterFor(readFileSync(`./data/posters/${previous}`), previous);
            kept++;
            console.warn(`  ⚠ poster download failed for "${film.titleEnglish || film.id}" (${e.message}); kept previous file`);
            return;
          } catch { /* fall through */ }
        }
        failed++;
        console.warn(`  ⚠ poster failed for "${film.titleEnglish || film.id}": ${e.message}`);
      }
    }));
  }
  // Never persist the expiring signed URLs.
  for (const f of films) delete f.posterUrls;

  // Prune files no film references any more (poster removed in Notion, or
  // replaced with a different format), so data/posters/ mirrors films.json.
  const referenced = new Set(films.filter(f => f.poster).map(f => f.poster.file));
  let pruned = 0;
  for (const file of readdirSync('./data/posters')) {
    if (!referenced.has(file)) { unlinkSync(`./data/posters/${file}`); pruned++; }
  }

  console.log(`  ✓ ${ok} posters saved to data/posters/` +
    `${kept ? `, ${kept} kept from previous run` : ''}` +
    `${failed ? `, ${failed} failed` : ''}` +
    `${pruned ? `, ${pruned} orphaned file(s) pruned` : ''}`);
}

// Extract studio data from a page in "Animation Archive: Studios" (ae6d444a...)
function extractStudio(page) {
  const props = page.properties;

  return {
    id: page.id,
    url: page.url,
    name: extractors.title(props['Name']),
    country: extractors.select(props['Country']),
    founded: extractors.number(props['Founded']),
    closed: extractors.number(props['Closed']),
    active: extractors.checkbox(props['Active']),
    significance: extractors.rich_text(props['Significance']),
    notableTechniques: extractors.multi_select(props['Notable Techniques']),
    wikipedia: extractors.url(props['Wikipedia']),
    website: extractors.url(props['Website']),
    filmRelations: extractors.relation(props['Films']),
  };
}

// Extract director data from a page in "Animation Archive: Directors" (59f9c337...)
function extractDirector(page) {
  const props = page.properties;

  return {
    id: page.id,
    url: page.url,
    name: extractors.title(props['Name']),
    nativeName: extractors.rich_text(props['Native Name']),
    birthYear: extractors.number(props['Birth Year']),
    deathYear: extractors.number(props['Death Year']),
    nationality: extractors.select(props['Nationality']), // select not multi_select based on schema
    bio: extractors.rich_text(props['Bio']),
    significance: extractors.rich_text(props['Significance']),
    signatureStyle: extractors.rich_text(props['Signature Style']),
    primaryTechnique: extractors.multi_select(props['Primary Technique']), // multi_select not select based on schema
    awards: extractors.rich_text(props['Awards']),
    wikipedia: extractors.url(props['Wikipedia']),
    imdb: extractors.url(props['IMDB']),
    filmRelations: extractors.relation(props['Films']),
    studioRelations: extractors.relation(props['Studios']),
  };
}

// Extract series/universe data from Notion page
function extractSeries(page) {
  const props = page.properties;

  return {
    id: page.id,
    url: page.url,
    name: extractors.title(props['Name']),
    type: extractors.select(props['Type']),
    description: extractors.rich_text(props['Description']),
    watchOrder: extractors.rich_text(props['Watch Order']),
    totalEntries: extractors.number(props['Total Entries']),
    yearsActive: extractors.rich_text(props['Years Active']),
    country: extractors.select(props['Country']),
    studioRelation: extractors.relation(props['Studio']),
    filmRelations: extractors.relation(props['Films']),
  };
}

async function fetchAllFilms() {
  console.log('🎬 Fetching films from Notion...');

  const pages = await queryAll(DATABASE_ID, {
    sorts: [
      { property: 'Year', direction: 'descending' },
      { property: 'Title (English)', direction: 'ascending' }
    ]
  }, (batch, n, total) => console.log(`  Page ${n}: fetched ${batch.length} films (total: ${total})`));

  return pages.map(extractFilm);
}

// Fetch related database by getting the database ID from relation properties
async function fetchRelatedDatabase(databaseId, extractFn, label) {
  if (!databaseId) {
    console.log(`  ⚠ No database ID provided for ${label}, skipping...`);
    return [];
  }

  console.log(`📚 Fetching ${label} from Notion...`);

  // Errors propagate and fail the whole fetch. This used to return [] on
  // error, which let one transient Notion failure publish a catalog with
  // zero studios/directors/series; the scheduled refresh commits whatever
  // this script writes, so failing loudly is the safe behavior.
  const pages = await queryAll(databaseId, {}, (batch, n, total) =>
    console.log(`  Page ${n}: fetched ${batch.length} ${label} (total: ${total})`));

  const items = [];
  for (const page of pages) {
    try {
      items.push(extractFn(page));
    } catch (e) {
      console.log(`    ⚠ Error extracting item: ${e.message}`);
    }
  }
  return items;
}

// Database IDs for related entities. (These were once mislabeled in Notion,
// Studios vs Directors; the titles were corrected and now match.)
const STUDIOS_DATABASE_ID = 'ae6d444ad0d847d49f7ff716642c5955';  // "Animation Archive: Studios"
const DIRECTORS_DATABASE_ID = '59f9c337c2ae490b9b59561129c911a0'; // "Animation Archive: Directors"
const SERIES_DATABASE_ID = '6a5c2864-8159-45bd-8662-a47c03bd649d';

// Get database IDs - using hardcoded values since we know them
async function findRelatedDatabaseIds(films) {
  const dbIds = {
    studios: STUDIOS_DATABASE_ID,
    directors: DIRECTORS_DATABASE_ID,
    series: SERIES_DATABASE_ID
  };

  console.log(`  Using Studios database: ${dbIds.studios}`);
  console.log(`  Using Directors database: ${dbIds.directors}`);
  console.log(`  Using Series database: ${dbIds.series}`);

  return dbIds;
}

function computeStats(films, studios, directors, series) {
  const stats = {
    total: films.length,
    countries: {},
    techniques: {},
    formats: {},
    decades: {},
    genres: {},
    keywords: {},
    watchable: 0,
    withSubtitles: 0,
    byConfidence: {},
    studioCount: studios.length,
    directorCount: directors.length,
    seriesCount: series.length,
  };

  for (const film of films) {
    // Country counts
    if (film.country) {
      stats.countries[film.country] = (stats.countries[film.country] || 0) + 1;
    }

    // Technique counts (multi-select)
    for (const tech of film.technique) {
      stats.techniques[tech] = (stats.techniques[tech] || 0) + 1;
    }

    // Format counts
    if (film.format) {
      stats.formats[film.format] = (stats.formats[film.format] || 0) + 1;
    }

    // Decade counts
    if (film.year) {
      const decade = Math.floor(film.year / 10) * 10;
      stats.decades[decade] = (stats.decades[decade] || 0) + 1;
    }

    // Genre counts
    for (const genre of film.genres || []) {
      stats.genres[genre] = (stats.genres[genre] || 0) + 1;
    }

    // Keyword counts
    for (const keyword of film.keywords || []) {
      stats.keywords[keyword] = (stats.keywords[keyword] || 0) + 1;
    }

    // Watchable (has linked watch links)
    if (film.watchLinksRelation && film.watchLinksRelation.length > 0) {
      stats.watchable++;
    }

    // With subtitles
    if (film.hasSubtitles) {
      stats.withSubtitles++;
    }

    // Confidence levels
    if (film.confidence) {
      stats.byConfidence[film.confidence] = (stats.byConfidence[film.confidence] || 0) + 1;
    }
  }

  // Sort countries and techniques by count
  stats.countriesSorted = Object.entries(stats.countries)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  stats.techniquesSorted = Object.entries(stats.techniques)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  stats.decadesSorted = Object.entries(stats.decades)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([decade, count]) => ({ decade: parseInt(decade), count }));

  stats.genresSorted = Object.entries(stats.genres)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  stats.keywordsSorted = Object.entries(stats.keywords)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return stats;
}

// Create lookup maps for resolving relations
function createLookupMaps(studios, directors, series) {
  const studioMap = new Map();
  const directorMap = new Map();
  const seriesMap = new Map();

  for (const studio of studios) {
    studioMap.set(studio.id, studio);
  }

  for (const director of directors) {
    directorMap.set(director.id, director);
  }

  for (const s of series) {
    seriesMap.set(s.id, s);
  }

  return { studioMap, directorMap, seriesMap };
}

// Resolve film relations to include entity data
function resolveFilmRelations(films, { studioMap, directorMap, seriesMap }) {
  for (const film of films) {
    // Resolve studio relations
    if (film.studioRelation && film.studioRelation.length > 0) {
      film.studioEntities = film.studioRelation
        .map(id => studioMap.get(id))
        .filter(Boolean)
        .map(s => ({ id: s.id, name: s.name }));
    }

    // Resolve director relations
    if (film.directorRelation && film.directorRelation.length > 0) {
      film.directorEntities = film.directorRelation
        .map(id => directorMap.get(id))
        .filter(Boolean)
        .map(d => ({ id: d.id, name: d.name }));
    }

    // Resolve series relations
    if (film.seriesRelation && film.seriesRelation.length > 0) {
      film.seriesEntities = film.seriesRelation
        .map(id => seriesMap.get(id))
        .filter(Boolean)
        .map(s => ({ id: s.id, name: s.name, type: s.type }));
    }
  }
}

async function main() {
  try {
    const films = await fetchAllFilms();

    // Try to find related database IDs from film relations
    console.log('\n🔍 Looking for related databases...');
    const dbIds = await findRelatedDatabaseIds(films);

    // Fetch related databases
    const studios = await fetchRelatedDatabase(dbIds.studios, extractStudio, 'studios');
    const directors = await fetchRelatedDatabase(dbIds.directors, extractDirector, 'directors');
    const series = await fetchRelatedDatabase(dbIds.series, extractSeries, 'series');

    // Create lookup maps and resolve relations
    if (studios.length > 0 || directors.length > 0 || series.length > 0) {
      console.log('\n🔗 Resolving relations...');
      const lookupMaps = createLookupMaps(studios, directors, series);
      resolveFilmRelations(films, lookupMaps);
    }

    const stats = computeStats(films, studios, directors, series);

    // Ensure data directory exists
    mkdirSync('./data', { recursive: true });

    // Download + self-host poster images (replaces expiring Notion URLs).
    await downloadPosters(films);

    // Write films data
    writeFileSync('./data/films.json', JSON.stringify(films, null, 2));
    console.log(`\n✅ Saved ${films.length} films to data/films.json`);

    // Write studios data
    writeFileSync('./data/studios.json', JSON.stringify(studios, null, 2));
    console.log(`✅ Saved ${studios.length} studios to data/studios.json`);

    // Write directors data
    writeFileSync('./data/directors.json', JSON.stringify(directors, null, 2));
    console.log(`✅ Saved ${directors.length} directors to data/directors.json`);

    // Write series data
    writeFileSync('./data/series.json', JSON.stringify(series, null, 2));
    console.log(`✅ Saved ${series.length} series to data/series.json`);

    // Write stats
    writeFileSync('./data/stats.json', JSON.stringify(stats, null, 2));
    console.log(`✅ Saved stats to data/stats.json`);

    // Summary
    console.log('\n📊 Stats:');
    console.log(`   Films: ${stats.total}`);
    console.log(`   Countries: ${Object.keys(stats.countries).length}`);
    console.log(`   Techniques: ${Object.keys(stats.techniques).length}`);
    console.log(`   Genres: ${Object.keys(stats.genres).length}`);
    console.log(`   Keywords: ${Object.keys(stats.keywords).length}`);
    console.log(`   Studios: ${stats.studioCount}`);
    console.log(`   Directors: ${stats.directorCount}`);
    console.log(`   Series: ${stats.seriesCount}`);
    console.log(`   Watchable: ${stats.watchable}`);
    console.log(`   With Subtitles: ${stats.withSubtitles}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
