#!/usr/bin/env node
/**
 * sources-sync.mjs — keep the archive's Sources DB growing from what research sessions actually used.
 *
 *   node scripts/research/sources-sync.mjs                      # propose: hosts cited in drafts but not in the Sources DB
 *   node scripts/research/sources-sync.mjs --sessions 190-195   # limit to those session folders
 *   node scripts/research/sources-sync.mjs --add reviewed.json  # create the reviewed entries
 *
 * The proposal lists each new host with how often and in which sessions it was cited, so a
 * human (or the session lead) can judge reliability before anything is written. --add takes a
 * JSON array of { Name, URL, Type, Reliability, "Region Focus": [], Language: [], Specialty, Notes }
 * and validates every select value against the live schema; existing hosts are skipped.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { getNotion } from '../lib/notion.js';
import { loadEnv, DS, WORK_DIR, schemaOptions, sourcesIndex, hostOf, today, stamp } from './lib.mjs';

loadEnv();
const a = process.argv.slice(2); const opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const index = await sourcesIndex();
const known = new Set(index.map(s => hostOf(s.url)).filter(Boolean));
// Hosts every brief already covers, or that are never a "source" in their own right.
const SKIP = /(^|\.)(wikipedia\.org|wikidata\.org|imdb\.com|themoviedb\.org|letterboxd\.com|youtube\.com|youtu\.be|vimeo\.com|google\.[a-z.]+|archive\.org|web\.archive\.org|wikiwand\.com|fandom\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|apple\.com|netflix\.com|primevideo\.com|amazon\.[a-z.]+|aparat\.com|t\.me)$/i;

if (opt('--add')) {
  const rows = JSON.parse(readFileSync(opt('--add'), 'utf8'));
  const schema = (await schemaOptions()).sources;
  const n = getNotion(); const log = [];
  for (const r of rows) {
    const host = hostOf(r.URL);
    if (known.has(host)) { log.push({ name: r.Name, skipped: `host ${host} already in Sources DB` }); continue; }
    const bad = [['Type', [r.Type]], ['Reliability', [r.Reliability]], ['Region Focus', r['Region Focus'] || []], ['Language', r.Language || []]]
      .flatMap(([k, vals]) => vals.filter(v => v && !schema[k].includes(v)).map(v => `${k} "${v}"`));
    if (bad.length) { log.push({ name: r.Name, skipped: `not allowed: ${bad.join(', ')}` }); continue; }
    const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s || '').slice(0, 1900) } }] });
    const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.sources }, properties: {
      Name: { title: [{ type: 'text', text: { content: r.Name } }] }, URL: { url: r.URL }, Type: { select: { name: r.Type } }, Reliability: { select: { name: r.Reliability } },
      'Region Focus': { multi_select: (r['Region Focus'] || []).map(name => ({ name })) }, Language: { multi_select: (r.Language || []).map(name => ({ name })) },
      Specialty: t(r.Specialty), Notes: t(r.Notes), 'Date Added': { date: { start: today() } } } });
    known.add(host); log.push({ name: r.Name, created: p.id });
  }
  const out = `${WORK_DIR}/sources-sync-${stamp()}.json`; writeFileSync(out, JSON.stringify(log, null, 1));
  for (const l of log) console.log(l.created ? `added   ${l.name} → ${l.created}` : `skip    ${l.name}: ${l.skipped}`);
  console.log(`Log: ${out}`);
  process.exit(0);
}

// ---- propose
const range = opt('--sessions'); const [lo, hi] = range ? range.split('-').map(Number) : [0, Infinity];
const dirs = existsSync(WORK_DIR) ? readdirSync(WORK_DIR).filter(d => /^session\d+$/.test(d) && +d.slice(7) >= lo && +d.slice(7) <= (hi || lo)) : [];
const hits = new Map();
for (const d of dirs) for (const f of readdirSync(`${WORK_DIR}/${d}`).filter(f => /^draft-\d+\.json$/.test(f))) {
  let draft; try { draft = JSON.parse(readFileSync(`${WORK_DIR}/${d}/${f}`, 'utf8')); } catch { continue; }
  const cited = [...(draft.films || []).flatMap(x => (x.sources || []).map(s => ({ ...s, work: x.properties?.['Title (English)'] || x.queueTitle }))),
    ...['directors', 'studios'].flatMap(k => (draft.entities?.[k] || []).flatMap(e => (e.sources || []).map(s => ({ ...s, work: e.Name }))))];
  for (const s of cited) {
    const host = hostOf(s.url); if (!host || SKIP.test(host) || known.has(host)) continue;
    const h = hits.get(host) || { host, count: 0, sessions: new Set(), names: new Set(), works: new Set(), example: s.url };
    h.count++; h.sessions.add(d.slice(7)); h.names.add(s.name); h.works.add(s.work); hits.set(host, h);
  }
}
const list = [...hits.values()].sort((x, y) => y.sessions.size - x.sessions.size || y.count - x.count);
const out = `${WORK_DIR}/sources-proposal-${stamp()}.md`;
const md = [`# Sources DB proposal (${dirs.join(', ') || 'no sessions'})`, '', `${list.length} hosts cited in drafts that are not in the Sources DB (${known.size} hosts known). Review reliability before adding with --add.`, '',
  '| Host | Cited | Sessions | Names used | Example | For |', '|---|---|---|---|---|---|',
  ...list.map(h => `| ${h.host} | ${h.count} | ${[...h.sessions].join(', ')} | ${[...h.names].slice(0, 2).join('; ').replace(/\|/g, '/')} | ${h.example} | ${[...h.works].slice(0, 3).join('; ').replace(/\|/g, '/')} |`)].join('\n');
writeFileSync(out, md);
console.log(list.slice(0, 40).map(h => `${String(h.count).padStart(3)}× s${[...h.sessions].join(',')}  ${h.host}  — ${[...h.names][0]}`).join('\n'));
console.log(`\n${list.length} candidate hosts. Full table: ${out}`);
