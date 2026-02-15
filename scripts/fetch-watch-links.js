#!/usr/bin/env node
/**
 * fetch-watch-links.js
 *
 * Fetches Watch Links from the new Notion Watch Links database
 * and merges them into films.json as structured arrays.
 *
 * Run AFTER fetch-notion.js (which produces data/films.json).
 *
 * Usage:
 *   NOTION_TOKEN=secret_xxx node scripts/fetch-watch-links.js
 *
 * Output:
 *   - data/watch-links.json  (standalone watch links data)
 *   - data/films.json        (updated with embedded watchLinks arrays)
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCH_LINKS_DB_ID = 'e19f5cd9525446ca8e352f6b9121b3af';
const DATA_DIR = path.join(__dirname, '..', 'data');
const DELAY_MS = 350;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllWatchLinks(notion) {
  const entries = [];
  let cursor = undefined;
  let page = 0;

  console.log('Fetching watch links from Notion...');

  do {
    const response = await notion.databases.query({
      database_id: WATCH_LINKS_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const result of response.results) {
      const props = result.properties;

      // Extract Film relation IDs
      const filmRelation = props['Film']?.relation || [];
      const filmIds = filmRelation.map(r => r.id);

      // Extract all properties
      const entry = {
        id: result.id,
        label: props['Label']?.title?.[0]?.plain_text || '',
        filmIds,
        url: props['URL']?.url || null,
        platform: props['Platform']?.select?.name || 'Other',
        accessType: props['Access Type']?.select?.name || 'FREE',
        videoQuality: props['Video Quality']?.select?.name || null,
        audio: props['Audio']?.select?.name || null,
        subtitles: (props['Subtitles']?.multi_select || []).map(s => s.name),
        completeness: props['Completeness']?.select?.name || null,
        linkStatus: props['Link Status']?.select?.name || 'Unverified',
        lastVerified: props['Last Verified']?.date?.start || null,
        qualityRank: props['Quality Rank']?.number || null,
        region: (props['Region']?.multi_select || []).map(r => r.name),
        notes: props['Notes']?.rich_text?.[0]?.plain_text || null,
      };

      entries.push(entry);
    }

    cursor = response.has_more ? response.next_cursor : undefined;
    page++;
    console.log(`  Page ${page}: ${response.results.length} results (${entries.length} total)`);

    if (cursor) await sleep(DELAY_MS);
  } while (cursor);

  return entries;
}

function groupByFilm(watchLinks) {
  const grouped = {};
  for (const link of watchLinks) {
    for (const filmId of link.filmIds) {
      const normalizedId = filmId.replace(/-/g, '');
      if (!grouped[normalizedId]) grouped[normalizedId] = [];
      grouped[normalizedId].push({
        url: link.url,
        platform: link.platform,
        accessType: link.accessType,
        videoQuality: link.videoQuality,
        audio: link.audio,
        subtitles: link.subtitles,
        completeness: link.completeness,
        status: link.linkStatus,
        lastVerified: link.lastVerified,
        rank: link.qualityRank,
        region: link.region,
        notes: link.notes,
      });
    }
  }

  // Sort each film's links by quality rank
  for (const filmId of Object.keys(grouped)) {
    grouped[filmId].sort((a, b) => {
      // Verified links first, then by rank
      const statusOrder = { 'Verified': 0, 'Unverified': 1, 'Redirect': 2, 'Dead': 3 };
      const sa = statusOrder[a.status] ?? 1;
      const sb = statusOrder[b.status] ?? 1;
      if (sa !== sb) return sa - sb;
      return (a.rank || 999) - (b.rank || 999);
    });
  }

  return grouped;
}

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error('ERROR: NOTION_TOKEN environment variable required');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // Fetch watch links
  const watchLinks = await fetchAllWatchLinks(notion);
  console.log(`\nFetched ${watchLinks.length} watch link entries`);

  // Save raw watch links
  const watchLinksPath = path.join(DATA_DIR, 'watch-links.json');
  fs.writeFileSync(watchLinksPath, JSON.stringify(watchLinks, null, 2));
  console.log(`Saved ${watchLinksPath}`);

  // Group by film for embedding
  const grouped = groupByFilm(watchLinks);
  const filmCount = Object.keys(grouped).length;
  console.log(`Watch links span ${filmCount} films`);

  // Merge into films.json
  const filmsPath = path.join(DATA_DIR, 'films.json');
  if (!fs.existsSync(filmsPath)) {
    console.error('ERROR: data/films.json not found. Run fetch-notion.js first.');
    process.exit(1);
  }

  const films = JSON.parse(fs.readFileSync(filmsPath, 'utf8'));
  let matched = 0;

  for (const film of films) {
    // Match by Notion page ID (normalize: strip dashes)
    const filmId = (film.id || '').replace(/-/g, '');
    if (grouped[filmId]) {
      film.watchLinks = grouped[filmId];
      matched++;
    } else {
      film.watchLinks = [];
    }
  }

  fs.writeFileSync(filmsPath, JSON.stringify(films, null, 2));
  console.log(`\nUpdated films.json: ${matched}/${films.length} films matched with watch links`);

  // Stats
  const withLinks = films.filter(f => f.watchLinks && f.watchLinks.length > 0).length;
  const totalLinks = watchLinks.filter(l => l.url).length;
  const deadLinks = watchLinks.filter(l => l.linkStatus === 'Dead').length;
  const needsReview = watchLinks.filter(l => !l.url).length;

  console.log('\n=== WATCH LINKS STATS ===');
  console.log(`Films with links: ${withLinks}/${films.length}`);
  console.log(`Total link entries: ${watchLinks.length}`);
  console.log(`With valid URLs: ${totalLinks}`);
  console.log(`Dead links: ${deadLinks}`);
  console.log(`Needs manual review: ${needsReview}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
