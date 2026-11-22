#!/usr/bin/env node
/**
 * Targeted cleanup for iCloud Drive sync-conflict duplicates ("foo 2.ext" files).
 *
 * Cross-platform Node implementation — replaces clean-icloud-dupes.sh which
 * silently failed on macOS's stock bash 3.2 (no `mapfile -d ''`).
 *
 * Usage:
 *   node scripts/clean-icloud-dupes.js              # dry-run + summary
 *   node scripts/clean-icloud-dupes.js --delete     # actually remove files
 *
 * Or via npm:
 *   npm run clean:dupes              # dry-run
 *   npm run clean:dupes -- --delete  # delete
 */
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';

const ROOT = './dist';
const DELETE = process.argv.includes('--delete');

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// macOS iCloud conflict pattern: "<basename> 2.<ext>" where the " 2" can also
// be " 3", " 4", etc. for repeated conflicts. Match all of them.
const RE = /\s\d+\.[^.]+$/;

const dupes = [];
for (const f of walk(ROOT)) {
  if (RE.test(f)) dupes.push(f);
}

console.log(`Scanning ${ROOT}/ for iCloud-conflict duplicates ("foo 2.ext", "foo 3.ext", etc.)`);
console.log(`Found: ${dupes.length} files`);

if (dupes.length === 0) {
  console.log('✓ Nothing to clean.');
  process.exit(0);
}

console.log('\nFirst 10 examples:');
for (const f of dupes.slice(0, 10)) console.log('  ' + f);

if (!DELETE) {
  console.log(`\nThis was a dry run. Re-run with --delete to remove all ${dupes.length}.`);
  console.log(`  npm run clean:dupes -- --delete`);
  process.exit(0);
}

console.log(`\nDeleting ${dupes.length} files...`);
let removed = 0, failed = 0;
const failures = [];
for (const f of dupes) {
  try { unlinkSync(f); removed++; }
  catch (err) { failed++; if (failures.length < 5) failures.push(`${basename(f)}: ${err.code || err.message}`); }
}

console.log(`✓ Removed: ${removed}`);
if (failed > 0) {
  console.log(`⚠ Failed:  ${failed}`);
  console.log('  Sample failures:');
  for (const m of failures) console.log('    ' + m);
  console.log('  These files are likely currently locked by iCloud sync. Try again in a moment,');
  console.log('  or pause iCloud Drive temporarily before re-running.');
}
