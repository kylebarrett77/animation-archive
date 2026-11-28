#!/usr/bin/env node
/**
 * log-session.mjs — write the Sessions entry and checkpoint report from promote logs.
 *   node scripts/research/log-session.mjs --session 189 --title "Validation — …" \
 *        --logs reports/research/promote-session189-*.json [--calls calls.txt] [--blockers blockers.txt] [--sources "…"] [--time "~2 hours"] [--dry]
 * Refuses to reuse a session number that already exists (the protocol's
 * numbering-collision lesson). Prints the protocol's checkpoint report.
 */
import { readFileSync } from 'fs';
import { getNotion, queryAll } from '../lib/notion.js';
import { loadEnv, DB, DS, plain, today } from './lib.mjs';

loadEnv();
const a = process.argv.slice(2);
const opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const list = k => { const i = a.indexOf(k); if (i < 0) return []; const out = []; for (let j = i + 1; j < a.length && !a[j].startsWith('--'); j++) out.push(a[j]); return out; };
const session = Number(opt('--session')); const title = opt('--title'); const DRY = a.includes('--dry');
if (!session || !title) { console.error('usage: log-session.mjs --session N --title "…" --logs <files…>'); process.exit(2); }
const logs = list('--logs').map(f => JSON.parse(readFileSync(f, 'utf8')));
const read = f => (f ? readFileSync(f, 'utf8').trim() : '');

const films = logs.flatMap(l => l.films || []).filter(f => f.page);
const failed = logs.flatMap(l => l.films || []).filter(f => f.error && !films.some(g => g.film === f.film));   // a failure fixed by a resumed run is not a failure
const entities = logs.flatMap(l => l.entities || []); const series = logs.flatMap(l => l.series || []).filter(s => s.id);
const watch = films.reduce((n, f) => n + (f.watchLinks?.length || 0), 0);

// numbering
const rows = await queryAll(DB.sessions);
const nums = rows.map(r => Number((plain(r.properties.Session).match(/^Session\s+(\d+)/i) || [])[1])).filter(Number.isFinite);
if (nums.includes(session)) { console.error(`Session ${session} already exists. Next free number is ${Math.max(...nums) + 1}.`); process.exit(1); }
if (session !== Math.max(...nums) + 1) console.warn(`note: Session ${session} is not the next sequential number (${Math.max(...nums) + 1}).`);

const methodology = [
  `Promoted ${films.length} Queue item(s) to Films via the research pipeline (scripts/research: brief → lint → promote).`,
  `Films: ${films.map(f => `${f.film} (${f.year})`).join(', ')}.`,
  `Protocol steps: duplicate pre-check (titles, alternates, original titles, director+year) at brief time and again at entry; 3+ sources per film, native-language first; IMDb confirmed via Wikidata P345 (TMDB fallback); Wikipedia confirmed as the work's own article; select values validated against the live schema; Director/Studio/Series linked; Queue set to Validated + Film DB Entry + note in the same pass.`,
  entities.length ? `Entities created: ${entities.map(e => e.director ? `Director ${e.director}` : `Studio ${e.studio}`).join(', ')}.` : 'No new entity pages needed.',
  series.length ? `Series created: ${series.map(s => `${s.series} (${s.films} films)`).join(', ')}.` : '',
  watch ? `Watch links added: ${watch} (Unverified).` : '',
  read(opt('--calls')),
].filter(Boolean).join('\n\n');
const blockers = [failed.length ? `Failed (re-run promote to resume): ${failed.map(f => `${f.film}: ${f.error}`).join('; ')}` : '', read(opt('--blockers'))].filter(Boolean).join('\n') || 'None.';
const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s).slice(0, 1990) } }] });

if (!DRY) await getNotion().pages.create({ parent: { type: 'data_source_id', data_source_id: DS.sessions }, properties: {
  Session: { title: [{ type: 'text', text: { content: `Session ${session}: ${title}` } }] }, Date: { date: { start: today() } }, 'Focus Region': { select: { name: 'Mixed/Other' } },
  'Films Validated': { number: films.length }, 'Films Added': { number: films.length }, 'Queue Items Added': { number: 0 },
  'Time Spent': t(opt('--time') || 'n/a'), 'Methodology Notes': t(methodology), Blockers: t(blockers), 'New Sources Found': t(opt('--sources') || 'None new.') } });

// checkpoint report (protocol format)
const queue = await queryAll(DB.queue);
const backlog = queue.filter(p => p.properties.Status?.select?.name === 'Validated' && !(p.properties['Film DB Entry']?.relation || []).length).length;
const filmsTotal = (await queryAll(DB.films)).length;
console.log(`${DRY ? '[dry] ' : ''}Session ${session} ${DRY ? 'not written' : 'logged'}.\n`);
console.log(`**Films validated:** ${films.length}\n**Running total:** ${filmsTotal} films\n`);
console.log('| Film | Year | Director | Key Note |\n|---|---|---|---|');
for (const f of films) console.log(`| ${f.film} | ${f.year} | ${(f.directors || []).join(', ')} | ${f.confidence || ''}${f.watchLinks?.length ? ' · watch link' : ''}${f.resumed ? ' · resumed' : ''} |`);
console.log(`\n**Queue status:** ${backlog} in the promotion backlog\n**Relations created:** ${entities.filter(e => e.director).length} directors, ${entities.filter(e => e.studio).length} studios, ${series.length} series, ${watch} watch links\n**Issues:** ${blockers}`);
