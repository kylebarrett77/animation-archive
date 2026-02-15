#!/usr/bin/env node
/**
 * validate-watch-links.js
 *
 * Validates all watch link URLs, updates status in Notion,
 * and generates a health report.
 *
 * Usage:
 *   NOTION_TOKEN=secret_xxx node scripts/validate-watch-links.js [--fix] [--report-only]
 *
 * Options:
 *   --fix          Update Notion entries with verification results
 *   --report-only  Only generate report, don't check URLs (uses cached data)
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCH_LINKS_DB_ID = 'e19f5cd9525446ca8e352f6b9121b3af';
const DATA_DIR = path.join(__dirname, '..', 'data');
const REPORT_PATH = path.join(DATA_DIR, 'watch-links-report.json');
const CONCURRENCY = 5;
const DELAY_MS = 500;
const TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a URL is reachable. Returns status info.
 */
function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ status: 'Dead', code: null, error: 'No URL' });
      return;
    }

    const protocol = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ status: 'Dead', code: null, error: 'Timeout' });
    }, TIMEOUT_MS);

    try {
      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AnimationArchive/LinkValidator',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: TIMEOUT_MS,
      }, (res) => {
        clearTimeout(timeout);
        const code = res.statusCode;

        // Follow redirects
        if (code >= 300 && code < 400 && res.headers.location) {
          resolve({
            status: 'Redirect',
            code,
            redirect: res.headers.location,
            error: null,
          });
          return;
        }

        if (code >= 200 && code < 300) {
          resolve({ status: 'Verified', code, error: null });
        } else if (code === 403 || code === 451) {
          // Geo-blocked or forbidden — might still be valid
          resolve({ status: 'Verified', code, error: `HTTP ${code} (may be geo-restricted)` });
        } else if (code === 404) {
          resolve({ status: 'Dead', code, error: 'Not Found' });
        } else {
          resolve({ status: 'Unverified', code, error: `HTTP ${code}` });
        }

        // Consume response to free socket
        res.resume();
      });

      req.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ status: 'Dead', code: null, error: err.message });
      });

      req.on('timeout', () => {
        clearTimeout(timeout);
        req.destroy();
        resolve({ status: 'Dead', code: null, error: 'Connection timeout' });
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ status: 'Dead', code: null, error: err.message });
    }
  });
}

/**
 * Platform-specific URL validation rules.
 * Some platforms need special handling.
 */
const PLATFORM_VALIDATORS = {
  'YouTube': async (url) => {
    // YouTube returns 200 even for removed videos — would need page content check
    // For now, just verify the URL is reachable
    return checkUrl(url);
  },
  'Netflix': async (url) => {
    // Netflix always returns 200 for valid URL patterns, even if title removed from catalog
    const result = await checkUrl(url);
    if (result.status === 'Verified') {
      result.status = 'Unverified';
      result.error = 'Netflix links need manual catalog verification';
    }
    return result;
  },
};

async function fetchWatchLinksFromNotion(notion) {
  const entries = [];
  let cursor = undefined;

  console.log('Fetching watch links from Notion...');

  do {
    const response = await notion.databases.query({
      database_id: WATCH_LINKS_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const result of response.results) {
      const props = result.properties;
      entries.push({
        id: result.id,
        label: props['Label']?.title?.[0]?.plain_text || '',
        url: props['URL']?.url || null,
        platform: props['Platform']?.select?.name || 'Other',
        currentStatus: props['Link Status']?.select?.name || 'Unverified',
        lastVerified: props['Last Verified']?.date?.start || null,
      });
    }

    cursor = response.has_more ? response.next_cursor : undefined;
    if (cursor) await sleep(350);
  } while (cursor);

  return entries;
}

async function updateNotionEntry(notion, entryId, status, lastVerified) {
  return notion.pages.update({
    page_id: entryId,
    properties: {
      'Link Status': { select: { name: status } },
      'Last Verified': { date: { start: lastVerified } },
    },
  });
}

async function validateBatch(entries) {
  const results = [];

  for (const entry of entries) {
    if (!entry.url) {
      results.push({ ...entry, newStatus: 'Dead', code: null, error: 'No URL' });
      continue;
    }

    const validator = PLATFORM_VALIDATORS[entry.platform];
    const result = validator
      ? await validator(entry.url)
      : await checkUrl(entry.url);

    results.push({
      ...entry,
      newStatus: result.status,
      code: result.code,
      error: result.error,
      redirect: result.redirect || null,
    });
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const reportOnly = args.includes('--report-only');

  if (!process.env.NOTION_TOKEN) {
    console.error('ERROR: NOTION_TOKEN environment variable required');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const today = new Date().toISOString().split('T')[0];

  // Fetch entries
  const entries = await fetchWatchLinksFromNotion(notion);
  console.log(`Found ${entries.length} watch link entries\n`);

  if (reportOnly) {
    // Just generate stats from current data
    const stats = {
      total: entries.length,
      verified: entries.filter(e => e.currentStatus === 'Verified').length,
      unverified: entries.filter(e => e.currentStatus === 'Unverified').length,
      dead: entries.filter(e => e.currentStatus === 'Dead').length,
      redirect: entries.filter(e => e.currentStatus === 'Redirect').length,
      noUrl: entries.filter(e => !e.url).length,
      byPlatform: {},
    };

    for (const e of entries) {
      if (!stats.byPlatform[e.platform]) {
        stats.byPlatform[e.platform] = { total: 0, verified: 0, dead: 0 };
      }
      stats.byPlatform[e.platform].total++;
      if (e.currentStatus === 'Verified') stats.byPlatform[e.platform].verified++;
      if (e.currentStatus === 'Dead') stats.byPlatform[e.platform].dead++;
    }

    console.log('=== CURRENT STATUS ===');
    console.log(`Total: ${stats.total}`);
    console.log(`Verified: ${stats.verified}`);
    console.log(`Unverified: ${stats.unverified}`);
    console.log(`Dead: ${stats.dead}`);
    console.log(`Redirect: ${stats.redirect}`);
    console.log(`No URL: ${stats.noUrl}`);
    console.log('\nBy Platform:');
    for (const [platform, data] of Object.entries(stats.byPlatform).sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  ${platform}: ${data.total} (${data.verified} verified, ${data.dead} dead)`);
    }

    fs.writeFileSync(REPORT_PATH, JSON.stringify(stats, null, 2));
    console.log(`\nReport saved to ${REPORT_PATH}`);
    return;
  }

  // Validate URLs
  console.log('Validating URLs...\n');
  const allResults = [];
  const entriesWithUrls = entries.filter(e => e.url);

  for (let i = 0; i < entriesWithUrls.length; i += CONCURRENCY) {
    const batch = entriesWithUrls.slice(i, i + CONCURRENCY);
    const results = await validateBatch(batch);
    allResults.push(...results);

    const progress = Math.min(i + CONCURRENCY, entriesWithUrls.length);
    const verified = allResults.filter(r => r.newStatus === 'Verified').length;
    const dead = allResults.filter(r => r.newStatus === 'Dead').length;
    process.stdout.write(`\r  Progress: ${progress}/${entriesWithUrls.length} | ✅ ${verified} | ❌ ${dead}`);

    await sleep(DELAY_MS);
  }
  console.log('\n');

  // Summary
  const summary = {
    date: today,
    total: allResults.length,
    verified: allResults.filter(r => r.newStatus === 'Verified').length,
    unverified: allResults.filter(r => r.newStatus === 'Unverified').length,
    dead: allResults.filter(r => r.newStatus === 'Dead').length,
    redirect: allResults.filter(r => r.newStatus === 'Redirect').length,
    statusChanges: allResults.filter(r => r.newStatus !== r.currentStatus).length,
    newlyDead: allResults.filter(r => r.newStatus === 'Dead' && r.currentStatus !== 'Dead'),
    newlyVerified: allResults.filter(r => r.newStatus === 'Verified' && r.currentStatus !== 'Verified'),
  };

  console.log('=== VALIDATION RESULTS ===');
  console.log(`Total checked: ${summary.total}`);
  console.log(`Verified: ${summary.verified}`);
  console.log(`Unverified: ${summary.unverified}`);
  console.log(`Dead: ${summary.dead}`);
  console.log(`Redirect: ${summary.redirect}`);
  console.log(`Status changes: ${summary.statusChanges}`);

  if (summary.newlyDead.length > 0) {
    console.log(`\n⚠️  NEWLY DEAD LINKS (${summary.newlyDead.length}):`);
    for (const d of summary.newlyDead) {
      console.log(`  ❌ ${d.label}: ${d.url} (${d.error})`);
    }
  }

  if (summary.newlyVerified.length > 0) {
    console.log(`\n✅ NEWLY VERIFIED (${summary.newlyVerified.length}):`);
    for (const v of summary.newlyVerified.slice(0, 10)) {
      console.log(`  ✅ ${v.label}`);
    }
    if (summary.newlyVerified.length > 10) {
      console.log(`  ... and ${summary.newlyVerified.length - 10} more`);
    }
  }

  // Save report
  const report = {
    ...summary,
    newlyDead: summary.newlyDead.map(d => ({ label: d.label, url: d.url, error: d.error })),
    results: allResults.map(r => ({
      id: r.id,
      label: r.label,
      url: r.url,
      platform: r.platform,
      previousStatus: r.currentStatus,
      newStatus: r.newStatus,
      code: r.code,
      error: r.error,
    })),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${REPORT_PATH}`);

  // Update Notion if --fix flag
  if (fix && summary.statusChanges > 0) {
    console.log(`\nUpdating ${summary.statusChanges} entries in Notion...`);
    const toUpdate = allResults.filter(r => r.newStatus !== r.currentStatus);

    for (let i = 0; i < toUpdate.length; i++) {
      try {
        await updateNotionEntry(notion, toUpdate[i].id, toUpdate[i].newStatus, today);
        process.stdout.write(`\r  Updated ${i + 1}/${toUpdate.length}`);
      } catch (err) {
        console.error(`\n  ERROR updating ${toUpdate[i].label}: ${err.message}`);
      }
      await sleep(350);
    }
    console.log('\n  Done.');
  } else if (!fix && summary.statusChanges > 0) {
    console.log(`\nRun with --fix to update ${summary.statusChanges} entries in Notion.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
