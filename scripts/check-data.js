#!/usr/bin/env node
/**
 * check-data.js — sanity guard for the scheduled Notion refresh.
 *
 * Runs after fetching and before committing (see fetch-data.yml). Exits 1
 * if the new snapshot looks broken, so a bad fetch never reaches the live
 * site; the previous committed snapshot simply stays live.
 *
 * Checks:
 *   - each dataset exists, parses, and is non-empty
 *   - no dataset shrank by more than MAX_DROP versus the committed (HEAD)
 *     snapshot, which catches partial fetches and accidental mass deletes
 *   - every film.poster.file exists in data/posters/
 *
 * For an intentional large cleanup in Notion, raise the threshold for one
 * run:  CHECK_DATA_MAX_DROP=0.6 npm run check:data
 */

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const MAX_DROP = Number(process.env.CHECK_DATA_MAX_DROP ?? 0.2);
const DATASETS = ['films', 'studios', 'directors', 'series', 'watch-links'];

function countOf(json) {
  const value = JSON.parse(json);
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

function committed(name) {
  try {
    return execFileSync('git', ['show', `HEAD:data/${name}.json`], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // not committed yet (first run) or not a git checkout
  }
}

const problems = [];
console.log(`Checking data snapshot (max allowed drop: ${Math.round(MAX_DROP * 100)}%)\n`);

for (const name of DATASETS) {
  const path = `data/${name}.json`;
  if (!existsSync(path)) { problems.push(`${path} is missing`); continue; }

  let now;
  try { now = countOf(readFileSync(path, 'utf8')); }
  catch (e) { problems.push(`${path} does not parse: ${e.message}`); continue; }

  const before = committed(name);
  const prev = before === null ? null : countOf(before);
  const delta = prev === null ? '' : ` (was ${prev}, ${now - prev >= 0 ? '+' : ''}${now - prev})`;
  console.log(`  ${name.padEnd(12)} ${String(now).padStart(5)}${delta}`);

  if (now === 0) problems.push(`${name}: snapshot is empty`);
  else if (prev && now < prev * (1 - MAX_DROP)) {
    problems.push(`${name}: dropped from ${prev} to ${now} (more than ${Math.round(MAX_DROP * 100)}%)`);
  }
}

if (existsSync('data/films.json')) {
  const films = JSON.parse(readFileSync('data/films.json', 'utf8'));
  const withPoster = films.filter(f => f.poster && f.poster.file);
  const missing = withPoster.filter(f => !existsSync(`data/posters/${f.poster.file}`));
  console.log(`  ${'posters'.padEnd(12)} ${String(withPoster.length).padStart(5)} referenced, ${missing.length} missing`);
  for (const f of missing.slice(0, 5)) {
    problems.push(`poster file missing for "${f.titleEnglish || f.id}": data/posters/${f.poster.file}`);
  }
  if (missing.length > 5) problems.push(`…and ${missing.length - 5} more missing poster files`);
}

if (problems.length) {
  console.error(`\n❌ Snapshot rejected:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ Snapshot looks sane.');
