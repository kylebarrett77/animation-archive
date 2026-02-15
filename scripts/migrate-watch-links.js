#!/usr/bin/env node
/**
 * migrate-watch-links.js
 *
 * Migrates existing Watch Links data from Films DB (single URL field)
 * to the new Watch Links database (separate entries with full metadata).
 *
 * Usage:
 *   NOTION_TOKEN=secret_xxx node scripts/migrate-watch-links.js [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run   Parse and display results without creating Notion entries
 *   --limit N   Process only first N films (for testing)
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';

// === CONFIG ===
const FILMS_DB_ID = '9bdc62e48ffe43fda6b992248570c49f';             // Films database ID
const WATCH_LINKS_DB_ID = 'e19f5cd9525446ca8e352f6b9121b3af';      // Watch Links database ID
const BATCH_SIZE = 10; // Notion API rate limit friendly
const DELAY_MS = 350;  // Between batches

// === PLATFORM DETECTION ===
const PLATFORM_PATTERNS = [
  { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube' },
  { pattern: /vimeo\.com/i, name: 'Vimeo' },
  { pattern: /archive\.org/i, name: 'Internet Archive' },
  { pattern: /criterion\.com|criterionchannel/i, name: 'Criterion Channel' },
  { pattern: /mubi\.com/i, name: 'MUBI' },
  { pattern: /netflix\.com/i, name: 'Netflix' },
  { pattern: /tubi\.tv|tubitv/i, name: 'Tubi' },
  { pattern: /bilibili\.com/i, name: 'Bilibili' },
  { pattern: /nfb\.ca/i, name: 'NFB' },
  { pattern: /amazon\.com|primevideo/i, name: 'Amazon Prime' },
  { pattern: /tv\.apple\.com/i, name: 'Apple TV' },
  { pattern: /play\.google\.com/i, name: 'Google Play' },
  { pattern: /crunchyroll\.com/i, name: 'Crunchyroll' },
  { pattern: /hulu\.com/i, name: 'Hulu' },
  { pattern: /pluto\.tv/i, name: 'Pluto TV' },
  { pattern: /plex\.tv/i, name: 'Plex' },
  { pattern: /kanopy\.com/i, name: 'Kanopy' },
  { pattern: /animatsiya\.net/i, name: 'Animatsiya.net' },
  { pattern: /dailymotion\.com/i, name: 'Dailymotion' },
  { pattern: /vudu\.com/i, name: 'Vudu' },
  { pattern: /peacocktv\.com/i, name: 'Peacock' },
  { pattern: /disneyplus\.com|disney\+/i, name: 'Disney+' },
  { pattern: /max\.com|hbomax/i, name: 'HBO Max' },
  { pattern: /paramountplus\.com/i, name: 'Paramount+' },
];

const ACCESS_TYPE_MAP = {
  'FREE': 'FREE',
  'ADS': 'ADS',
  'SUB': 'SUB',
  'RENT': 'RENT',
  'BUY': 'BUY',
  'DISC': 'DISC',
  'REGION': 'REGION',
  'SUBSCRIPTION': 'SUB',
  'STREAMING': 'SUB',
};

// Default access types by platform
const PLATFORM_DEFAULT_ACCESS = {
  'YouTube': 'FREE',
  'Vimeo': 'FREE',
  'Internet Archive': 'FREE',
  'Animatsiya.net': 'FREE',
  'Dailymotion': 'FREE',
  'Bilibili': 'FREE',
  'NFB': 'FREE',
  'Criterion Channel': 'SUB',
  'MUBI': 'SUB',
  'Netflix': 'SUB',
  'Crunchyroll': 'SUB',
  'Hulu': 'SUB',
  'Disney+': 'SUB',
  'HBO Max': 'SUB',
  'Paramount+': 'SUB',
  'Tubi': 'ADS',
  'Pluto TV': 'ADS',
  'Plex': 'ADS',
  'Amazon Prime': 'SUB',
  'Apple TV': 'RENT',
  'Google Play': 'RENT',
  'Vudu': 'RENT',
  'Peacock': 'ADS',
};

// === PARSER ===

/**
 * Parse a Watch Links field value into structured entries.
 * Handles multiple formats:
 *   1. "[FREE] Platform: URL"  (well-formed)
 *   2. "URL (annotation)"      (URL with note)
 *   3. "https://..."           (bare URL)
 *   4. "Platform1, Platform2"  (free text - flagged for manual review)
 *   5. "1234"                  (numeric junk - flagged)
 */
function parseWatchLinks(rawValue, filmTitle) {
  if (!rawValue || typeof rawValue !== 'string') return [];

  const results = [];
  const raw = rawValue.trim();

  // Try structured format: [TYPE] Platform: URL
  const structuredRegex = /\[(\w+)\]\s*([^:]+):\s*(https?:\/\/\S+)/gi;
  let match;
  while ((match = structuredRegex.exec(raw)) !== null) {
    const accessType = ACCESS_TYPE_MAP[match[1].toUpperCase()] || 'FREE';
    const platformHint = match[2].trim();
    const url = match[3].trim();
    const platform = detectPlatform(url) || matchPlatformName(platformHint) || 'Other';

    results.push({
      url,
      platform,
      accessType,
      label: `${platform} - ${filmTitle}`,
      notes: null,
      parseMethod: 'structured',
    });
  }
  if (results.length > 0) return results;

  // Try bare URLs (possibly multiple, separated by newlines/semicolons/commas)
  const urlRegex = /https?:\/\/[^\s,;)]+/gi;
  const urls = raw.match(urlRegex);
  if (urls && urls.length > 0) {
    for (const url of urls) {
      const cleanUrl = url.replace(/[)\]}>]+$/, ''); // strip trailing brackets
      const platform = detectPlatform(cleanUrl) || 'Other';
      const accessType = PLATFORM_DEFAULT_ACCESS[platform] || 'FREE';

      // Extract any annotation after the URL
      const afterUrl = raw.substring(raw.indexOf(url) + url.length).trim();
      const annotation = afterUrl.match(/^\(([^)]+)\)/);

      results.push({
        url: cleanUrl,
        platform,
        accessType,
        label: `${platform} - ${filmTitle}`,
        notes: annotation ? annotation[1] : null,
        parseMethod: 'url_extract',
      });
    }
    return results;
  }

  // Check for platform name mentions without URLs (free text)
  const freeTextPlatforms = detectPlatformsFromText(raw);
  if (freeTextPlatforms.length > 0) {
    for (const p of freeTextPlatforms) {
      results.push({
        url: null,
        platform: p,
        accessType: PLATFORM_DEFAULT_ACCESS[p] || 'FREE',
        label: `${p} - ${filmTitle} (NEEDS URL)`,
        notes: `Original value: "${raw}" — needs manual URL lookup`,
        parseMethod: 'freetext',
      });
    }
    return results;
  }

  // Pure junk (numbers, random strings)
  if (/^\d+$/.test(raw) || raw.length < 10) {
    return [{
      url: null,
      platform: 'Other',
      accessType: 'FREE',
      label: `MANUAL REVIEW - ${filmTitle}`,
      notes: `Unparseable value: "${raw}"`,
      parseMethod: 'junk',
    }];
  }

  // Fallback: unknown free text
  return [{
    url: null,
    platform: 'Other',
    accessType: 'FREE',
    label: `MANUAL REVIEW - ${filmTitle}`,
    notes: `Could not parse: "${raw}"`,
    parseMethod: 'unknown',
  }];
}

function detectPlatform(url) {
  for (const { pattern, name } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return name;
  }
  return null;
}

function matchPlatformName(text) {
  const lower = text.toLowerCase().trim();
  const nameMap = {
    'youtube': 'YouTube',
    'vimeo': 'Vimeo',
    'internet archive': 'Internet Archive',
    'archive.org': 'Internet Archive',
    'criterion': 'Criterion Channel',
    'criterion channel': 'Criterion Channel',
    'mubi': 'MUBI',
    'netflix': 'Netflix',
    'tubi': 'Tubi',
    'bilibili': 'Bilibili',
    'nfb': 'NFB',
    'amazon': 'Amazon Prime',
    'amazon prime': 'Amazon Prime',
    'apple tv': 'Apple TV',
    'google play': 'Google Play',
    'crunchyroll': 'Crunchyroll',
    'hulu': 'Hulu',
    'animatsiya': 'Animatsiya.net',
    'animatsiya.net': 'Animatsiya.net',
    'dailymotion': 'Dailymotion',
    'kanopy': 'Kanopy',
    'pluto': 'Pluto TV',
    'plex': 'Plex',
    'disney+': 'Disney+',
    'disney plus': 'Disney+',
    'hbo': 'HBO Max',
    'hbo max': 'HBO Max',
    'paramount+': 'Paramount+',
    'paramount plus': 'Paramount+',
    'peacock': 'Peacock',
    'vudu': 'Vudu',
  };
  return nameMap[lower] || null;
}

function detectPlatformsFromText(text) {
  const platforms = [];
  const lower = text.toLowerCase();
  const checks = [
    ['youtube', 'YouTube'],
    ['internet archive', 'Internet Archive'],
    ['archive.org', 'Internet Archive'],
    ['criterion', 'Criterion Channel'],
    ['mubi', 'MUBI'],
    ['netflix', 'Netflix'],
    ['amazon prime', 'Amazon Prime'],
    ['amazon', 'Amazon Prime'],
    ['crunchyroll', 'Crunchyroll'],
    ['hulu', 'Hulu'],
    ['tubi', 'Tubi'],
    ['kanopy', 'Kanopy'],
    ['animatsiya', 'Animatsiya.net'],
    ['bilibili', 'Bilibili'],
    ['nfb', 'NFB'],
    ['disney', 'Disney+'],
    ['hbo', 'HBO Max'],
    ['paramount', 'Paramount+'],
    ['vudu', 'Vudu'],
    ['apple tv', 'Apple TV'],
    ['dailymotion', 'Dailymotion'],
  ];
  const seen = new Set();
  for (const [keyword, name] of checks) {
    if (lower.includes(keyword) && !seen.has(name)) {
      platforms.push(name);
      seen.add(name);
    }
  }
  return platforms;
}

// === NOTION API ===

async function fetchAllFilmsWithWatchLinks(notion) {
  const films = [];
  let cursor = undefined;
  let page = 0;

  console.log('Fetching films from Notion...');

  do {
    const response = await notion.databases.query({
      database_id: FILMS_DB_ID,
      start_cursor: cursor,
      page_size: 100,
      filter: {
        property: 'Watch Links',
        url: { is_not_empty: true },
      },
    });

    for (const result of response.results) {
      const props = result.properties;
      const title = props['Title (English)']?.title?.[0]?.plain_text || 'Unknown';
      const watchLinks = props['Watch Links']?.url || null;

      if (watchLinks) {
        films.push({
          id: result.id,
          title,
          watchLinks,
          url: result.url,
        });
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
    page++;
    console.log(`  Page ${page}: ${response.results.length} results (${films.length} total with links)`);

    if (cursor) await sleep(DELAY_MS);
  } while (cursor);

  return films;
}

async function createWatchLinkEntry(notion, entry, filmPageId) {
  const properties = {
    'Label': { title: [{ text: { content: entry.label.substring(0, 100) } }] },
    'Film': { relation: [{ id: filmPageId }] },
    'Platform': { select: { name: entry.platform } },
    'Access Type': { select: { name: entry.accessType } },
    'Link Status': { select: { name: entry.url ? 'Unverified' : 'Dead' } },
  };

  // Only set URL if we have one
  if (entry.url) {
    properties['URL'] = { url: entry.url };
  }

  // Set notes if present
  if (entry.notes) {
    properties['Notes'] = { rich_text: [{ text: { content: entry.notes.substring(0, 2000) } }] };
  }

  // Set quality rank to 1 for first/only link
  if (entry.rank) {
    properties['Quality Rank'] = { number: entry.rank };
  }

  return notion.pages.create({
    parent: { database_id: WATCH_LINKS_DB_ID },
    properties,
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === MAIN ===

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;

  if (!process.env.NOTION_TOKEN) {
    console.error('ERROR: NOTION_TOKEN environment variable required');
    console.error('Usage: NOTION_TOKEN=secret_xxx node scripts/migrate-watch-links.js [--dry-run] [--limit N]');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // Fetch all films with watch links
  const films = await fetchAllFilmsWithWatchLinks(notion);
  const processFilms = films.slice(0, limit);

  console.log(`\nFound ${films.length} films with Watch Links`);
  console.log(`Processing ${processFilms.length} films${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Parse and categorize
  const stats = {
    total: 0,
    structured: 0,
    url_extract: 0,
    freetext: 0,
    junk: 0,
    unknown: 0,
    created: 0,
    errors: 0,
    needsManualReview: [],
  };

  const allEntries = [];

  for (const film of processFilms) {
    const parsed = parseWatchLinks(film.watchLinks, film.title);

    // Assign ranks
    parsed.forEach((entry, idx) => {
      entry.rank = idx + 1;
      entry.filmId = film.id;
      entry.filmTitle = film.title;
      stats.total++;
      stats[entry.parseMethod] = (stats[entry.parseMethod] || 0) + 1;

      if (!entry.url || entry.parseMethod === 'freetext' || entry.parseMethod === 'junk' || entry.parseMethod === 'unknown') {
        stats.needsManualReview.push({
          film: film.title,
          original: film.watchLinks,
          method: entry.parseMethod,
        });
      }
    });

    allEntries.push(...parsed);
  }

  // Report
  console.log('=== PARSE RESULTS ===');
  console.log(`Total entries parsed: ${stats.total}`);
  console.log(`  Structured [TYPE] Platform: URL: ${stats.structured || 0}`);
  console.log(`  URL extracted: ${stats.url_extract || 0}`);
  console.log(`  Free text (needs URL): ${stats.freetext || 0}`);
  console.log(`  Junk (unparseable): ${stats.junk || 0}`);
  console.log(`  Unknown: ${stats.unknown || 0}`);
  console.log(`  Manual review needed: ${stats.needsManualReview.length}`);
  console.log('');

  if (stats.needsManualReview.length > 0) {
    console.log('=== MANUAL REVIEW REQUIRED ===');
    for (const item of stats.needsManualReview.slice(0, 20)) {
      console.log(`  [${item.method}] ${item.film}: "${item.original}"`);
    }
    if (stats.needsManualReview.length > 20) {
      console.log(`  ... and ${stats.needsManualReview.length - 20} more`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('=== DRY RUN - Sample entries ===');
    for (const entry of allEntries.slice(0, 10)) {
      console.log(`  ${entry.filmTitle}`);
      console.log(`    Label: ${entry.label}`);
      console.log(`    URL: ${entry.url || '(none)'}`);
      console.log(`    Platform: ${entry.platform}`);
      console.log(`    Access: ${entry.accessType}`);
      console.log(`    Method: ${entry.parseMethod}`);
      console.log('');
    }
    console.log('Run without --dry-run to create entries in Notion.');
    return;
  }

  // Create entries in batches
  console.log('=== CREATING WATCH LINK ENTRIES ===');
  const entriesWithUrls = allEntries.filter(e => e.url); // Only create entries that have actual URLs
  const manualEntries = allEntries.filter(e => !e.url);

  for (let i = 0; i < entriesWithUrls.length; i += BATCH_SIZE) {
    const batch = entriesWithUrls.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (entry) => {
      try {
        await createWatchLinkEntry(notion, entry, entry.filmId);
        stats.created++;
      } catch (err) {
        stats.errors++;
        console.error(`  ERROR creating entry for "${entry.filmTitle}": ${err.message}`);
      }
    });

    await Promise.all(promises);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(i + BATCH_SIZE, entriesWithUrls.length)}/${entriesWithUrls.length} processed`);
    await sleep(DELAY_MS);
  }

  // Create manual review entries (without URLs) so they're tracked
  if (manualEntries.length > 0) {
    console.log(`\nCreating ${manualEntries.length} manual review entries...`);
    for (let i = 0; i < manualEntries.length; i += BATCH_SIZE) {
      const batch = manualEntries.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (entry) => {
        try {
          await createWatchLinkEntry(notion, entry, entry.filmId);
          stats.created++;
        } catch (err) {
          stats.errors++;
          console.error(`  ERROR: "${entry.filmTitle}": ${err.message}`);
        }
      });
      await Promise.all(promises);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log(`Created: ${stats.created}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Manual review: ${stats.needsManualReview.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
