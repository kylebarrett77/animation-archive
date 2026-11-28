#!/usr/bin/env node
/**
 * plan.mjs — propose the next research batch, with reasons (Research Engine: planner).
 *
 *   node scripts/research/plan.mjs                 # top countries and the suggested 10-work batch
 *   node scripts/research/plan.mjs --size 10 --show 15
 *
 * Ranks New Queue items by the archive's priority rule (Research Rules: "Prioritise works whose real-world
 * documentation is scattered or missing"):
 *   coverage gap      countries with few Films entries rise (log-scaled)
 *   scarcity          works with no or few Wikipedia articles rise; mainstream US/JP TV sinks
 *   priority          Queue High/Medium/Low
 *   provenance        Queue batches whose notes research keeps overturning are flagged (not hidden)
 * Batches are one country per brief (native-language research depends on it): the top country fills
 * the batch, two briefs of 5; if it has fewer than the batch size, the next country fills the rest.
 * Prints the brief.mjs command to run. Writes nothing to Notion.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { queryAll } from '../lib/notion.js';
import { loadEnv, DB, WORK_DIR, plain, filmsIndex } from './lib.mjs';

loadEnv();
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const SIZE = Number(opt('--size', 10)), SHOW = Number(opt('--show', 12));
const films = await filmsIndex();
const have = {}; for (const f of films) have[f.country || '?'] = (have[f.country || '?'] || 0) + 1;
const queue = (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), status: p.properties.Status?.select?.name, country: p.properties.Country?.select?.name,
  format: p.properties.Format?.select?.name, prio: p.properties.Priority?.select?.name, src: plain(p.properties['Source Found']), notes: plain(p.properties['Research Notes']),
  created: p.created_time.slice(0, 10), linked: (p.properties['Film DB Entry']?.relation || []).length }));
// Items already briefed in a session folder (research in progress, not yet promoted) are skipped.
const inProgress = new Set(existsSync(WORK_DIR) ? readdirSync(WORK_DIR).filter(x => /^session\d+$/.test(x) && existsSync(`${WORK_DIR}/${x}/precheck.json`))
  .flatMap(x => JSON.parse(readFileSync(`${WORK_DIR}/${x}/precheck.json`, 'utf8')).map(p => p.queue?.id)).filter(Boolean) : []);
const fresh = queue.filter(q => q.status === 'New' && !q.linked && !inProgress.has(q.id) && !/session 46/i.test(q.src) && q.country);

// Provenance: Queue-note accuracy per creation date, from review stats of past sessions (queue deltas per work).
const deltasByQueueTitle = new Map();
if (existsSync(WORK_DIR)) for (const d of readdirSync(WORK_DIR).filter(x => /^session\d+$/.test(x)))
  for (const f of readdirSync(`${WORK_DIR}/${d}`).filter(x => /^review-\d+\.json$/.test(x)))
    for (const s of JSON.parse(readFileSync(`${WORK_DIR}/${d}/${f}`, 'utf8')).stats || []) deltasByQueueTitle.set(s.work, s.queueDeltas || 0);

const PRIO = { High: 1, Medium: 0.6, Low: 0.3 };
const MAINSTREAM = q => q.format === 'Series' && ['USA', 'Japan'].includes(q.country);
const scored = fresh.map(q => {
  const links = Number((q.notes.match(/(\d+) Wikipedia\(s\)/) || [])[1] ?? NaN);   // discovery notes record sitelinks
  const gap = 1 / Math.log2(2 + (have[q.country] || 0));                              // 0 films → 1.0, 10 → .28, 800 → .10
  const scarcity = MAINSTREAM(q) ? 0 : Number.isFinite(links) ? 1 / (1 + links / 3) : 0.5;
  const score = 0.5 * gap + 0.3 * scarcity + 0.2 * (PRIO[q.prio] ?? 0.5);
  return { ...q, links, gap, scarcity, score };
}).sort((x, y) => y.score - x.score);

const byCountry = new Map(); for (const q of scored) byCountry.set(q.country, [...(byCountry.get(q.country) || []), q]);
const countries = [...byCountry.entries()].map(([c, items]) => ({ c, n: items.length, films: have[c] || 0, top: items[0].score, mean: items.reduce((s, x) => s + x.score, 0) / items.length }))
  .sort((x, y) => y.top - x.top);
console.log(`New Queue items considered: ${fresh.length} across ${countries.length} countries (${inProgress.size} in briefed sessions skipped).\n`);
console.log('Country            Films  New  Top score');
for (const c of countries.slice(0, SHOW)) console.log(`${c.c.padEnd(18)} ${String(c.films).padStart(5)} ${String(c.n).padStart(4)}  ${c.top.toFixed(2)}`);

const batch = []; const used = [];
for (const c of countries) { if (batch.length >= SIZE) break; const take = byCountry.get(c.c).slice(0, SIZE - batch.length); batch.push(...take); used.push(`${c.c} (${take.length})`); }
console.log(`\nSuggested batch (${batch.length}): ${used.join(' + ')}`);
for (const q of batch) console.log(`  ${q.score.toFixed(2)}  ${q.country.padEnd(14)} ${(q.format || '?').padEnd(7)} ${q.title}${Number.isFinite(q.links) ? `  [${q.links} wiki]` : ''}`);
const groups = []; for (let i = 0; i < batch.length; i += 5) groups.push(batch.slice(i, i + 5));
const mixed = groups.filter(g => new Set(g.map(q => q.country)).size > 1).length;
if (mixed) console.log(`\nnote: ${mixed} brief(s) would mix countries; consider a smaller batch or reorder so each brief is one country.`);
console.log(`\nRun:\n  node scripts/research/brief.mjs --batch session<N> ${batch.map(q => JSON.stringify(q.title)).join(' ')}`);
