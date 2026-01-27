/**
 * Fetch all films from Notion database and save as JSON
 * Run: NOTION_TOKEN=xxx NOTION_DATABASE_ID=xxx node scripts/fetch-notion.js
 */

import { Client } from '@notionhq/client';
import { writeFileSync, mkdirSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '9bdc62e48ffe43fda6b992248570c49f';

// Property extractors for different Notion property types
const extractors = {
  title: (prop) => prop.title?.[0]?.plain_text || '',
  rich_text: (prop) => prop.rich_text?.[0]?.plain_text || '',
  number: (prop) => prop.number,
  select: (prop) => prop.select?.name || null,
  multi_select: (prop) => prop.multi_select?.map(s => s.name) || [],
  checkbox: (prop) => prop.checkbox || false,
  url: (prop) => prop.url || null,
  date: (prop) => prop.date?.start || null,
  created_time: (prop) => prop.created_time,
  last_edited_time: (prop) => prop.last_edited_time,
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
    // Watch info
    watchLinks: extractors.url(props['Watch Links']),
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
  };
}

async function fetchAllFilms() {
  console.log('🎬 Fetching films from Notion...');
  
  const films = [];
  let cursor = undefined;
  let pageCount = 0;
  
  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
      sorts: [
        { property: 'Year', direction: 'descending' },
        { property: 'Title (English)', direction: 'ascending' }
      ]
    });
    
    for (const page of response.results) {
      films.push(extractFilm(page));
    }
    
    cursor = response.next_cursor;
    pageCount++;
    console.log(`  Page ${pageCount}: fetched ${response.results.length} films (total: ${films.length})`);
    
  } while (cursor);
  
  return films;
}

function computeStats(films) {
  const stats = {
    total: films.length,
    countries: {},
    techniques: {},
    formats: {},
    decades: {},
    watchable: 0,
    withSubtitles: 0,
    byConfidence: {},
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
    
    // Watchable (has watch link)
    if (film.watchLinks) {
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
  
  return stats;
}

async function main() {
  try {
    const films = await fetchAllFilms();
    const stats = computeStats(films);
    
    // Ensure data directory exists
    mkdirSync('./data', { recursive: true });
    
    // Write films data
    writeFileSync('./data/films.json', JSON.stringify(films, null, 2));
    console.log(`\n✅ Saved ${films.length} films to data/films.json`);
    
    // Write stats
    writeFileSync('./data/stats.json', JSON.stringify(stats, null, 2));
    console.log(`✅ Saved stats to data/stats.json`);
    
    // Summary
    console.log('\n📊 Stats:');
    console.log(`   Films: ${stats.total}`);
    console.log(`   Countries: ${Object.keys(stats.countries).length}`);
    console.log(`   Techniques: ${Object.keys(stats.techniques).length}`);
    console.log(`   Watchable: ${stats.watchable}`);
    console.log(`   With Subtitles: ${stats.withSubtitles}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
