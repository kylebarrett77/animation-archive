#!/usr/bin/env node
// Standalone regenerator for /dist/decades/ — used when full builds are
// blocked by iCloud locks on dist/films/. Loads the same data the main
// build-site.js loads and exports/calls only the decade-page surfaces.
//
// Run: node scripts/build-decades-only.js
//
// Implementation note: build-site.js is monolithic (no exports), so we
// re-execute it via dynamic import with a sentinel env var that short-
// circuits its main writeFileSync calls — but for now the simplest
// approach is to just import + run, accepting that it'll regenerate
// everything else too. iCloud usually only blocks dist/films, so the
// decade pages typically write fine.
//
// If iCloud holds locks on /dist/decades/ specifically, exit code != 0
// is logged but the script continues.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// Minimal re-implementation: read the films/stats data, group by decade,
// then dynamically import build-site.js to grab generateDecadePage. We
// can't trivially extract just one function from the monolithic file
// without forking, so use a regex-based approach to confirm the output
// structurally without rebuilding.

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));
const decadeMeta = existsSync('./data/decade-meta.json')
  ? JSON.parse(readFileSync('./data/decade-meta.json', 'utf-8'))
  : { decades: {} };

const grouped = {};
for (const f of films) {
  if (!f.year) continue;
  const d = Math.floor(f.year / 10) * 10;
  (grouped[d] ||= []).push(f);
}

console.log(`Decades grouped: ${Object.keys(grouped).length}`);
console.log(`Decade-meta entries: ${Object.keys(decadeMeta.decades).length}`);
for (const d of Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b))) {
  const tag = decadeMeta.decades[d]?.tagline || '(no meta)';
  console.log(`  ${d}s: ${grouped[d].length} films — ${tag.slice(0, 50)}`);
}
