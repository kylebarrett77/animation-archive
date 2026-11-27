#!/usr/bin/env node
/**
 * check-imdb-links.js — find films whose IMDb link points at the wrong
 * title, and propose the correct ID.
 *
 * Usage:
 *   node scripts/check-imdb-links.js               dry run on reports/imdb-suspects.json
 *   node scripts/check-imdb-links.js --all         check every film with an IMDb link
 *   node scripts/check-imdb-links.js --apply       write high-confidence fixes to Notion
 *   node scripts/check-imdb-links.js --approve <id,id,...>   write chosen fixes
 *
 * Env: TMDB_TOKEN (or TMDB_API_KEY) required; NOTION_TOKEN for writes.
 * Reads data/films.json (run `npm run fetch` first). The suspect list is
 * produced by `npm run posters:source`.
 *
 * Each wrong link gets up to two independent proposals:
 *   wikidata  IMDb ID (P345) on the Wikidata item of the film's own
 *             Wikipedia article (only if the article is about this film)
 *   tmdb      TMDB title + year search, then that title's IMDb ID
 * Every proposed ID is verified with TMDB (/find): it must resolve to a
 * title matching the film's title and year.
 *
 * Confidence:
 *   high    both sources agree, or a single proposal verified on TMDB
 *   medium  proposal exists but TMDB doesn't know the ID (can't verify)
 * --apply writes only "high". Writes are logged to reports/ with the old
 * value, so they can be reverted.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { getNotion } from './lib/notion.js';
import { hasTmdb, tmdb, tmdbFindImdb, tmdbImdbIdFor, yearOf } from './lib/tmdb.js';
import { bestTitleMatch, sequelMismatch, imdbIdOf, titleSimilarity } from './lib/title-match.js';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const APPLY = args.includes('--apply');
const APPROVE = args.includes('--approve') ? (args[args.indexOf('--approve') + 1] || '').split(',').filter(Boolean) : null;
const REPORTS = './reports';
const UA = 'GlobalAnimationArchive/1.0 (https://animationarchive.netlify.app; link checking)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const imdbUrl = id => `https://www.imdb.com/title/${id}/`;

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

/** Does a TMDB record describe this film? Same title (>= 0.6), year within 1, no sequel mismatch. */
function describesFilm(film, rec) {
  if (!rec) return false;
  const sim = bestTitleMatch(film, rec.title, rec.original);
  const yearOk = !film.year || !rec.year || Math.abs(film.year - rec.year) <= 1;
  return sim >= 0.6 && yearOk && sequelMismatch(film.titleEnglish, `${rec.title} ${rec.original}`).length === 0;
}

// ---------- proposal 1: Wikidata P345 via the film's own Wikipedia article ----------
async function wikidataProposals(films) {
  const byLang = new Map();
  for (const f of films) {
    const m = String(f.wikipedia || '').match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^#?]+)/);
    if (!m) continue;
    let title; try { title = decodeURIComponent(m[2]).replace(/_/g, ' '); } catch { continue; }
    if (!byLang.has(m[1])) byLang.set(m[1], []);
    byLang.get(m[1]).push({ film: f, title });
  }
  const article = new Map(); // film.id -> { title, qid }
  for (const [lang, list] of byLang) {
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const api = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      Object.entries({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageprops',
        ppprop: 'wikibase_item', titles: chunk.map(c => c.title).join('|') }).forEach(([k, v]) => api.searchParams.set(k, v));
      const res = await fetch(api, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const q = (await res.json()).query || {};
      const alias = new Map([...(q.normalized || []), ...(q.redirects || [])].map(x => [x.from, x.to]));
      const resolve = t => { let x = t; for (let k = 0; k < 4 && alias.has(x); k++) x = alias.get(x); return x; };
      const pages = new Map((q.pages || []).map(p => [p.title, p]));
      for (const c of chunk) {
        const p = pages.get(resolve(c.title));
        if (p?.pageprops?.wikibase_item) article.set(c.film.id, { title: p.title, qid: p.pageprops.wikibase_item });
      }
      await sleep(150);
    }
  }
  const ids = [...new Set([...article.values()].map(a => a.qid))];
  const claims = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    Object.entries({ action: 'wbgetentities', format: 'json', props: 'claims', ids: ids.slice(i, i + 50).join('|') })
      .forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) continue;
    for (const [id, e] of Object.entries((await res.json()).entities || {})) claims.set(id, e.claims || {});
    await sleep(150);
  }
  const out = new Map();
  for (const f of films) {
    const a = article.get(f.id);
    if (!a) continue;
    // The article must be about this film, not its franchise or source.
    if (titleSimilarity(f.titleEnglish, a.title) < 0.6 && bestTitleMatch(f, a.title) < 0.6) continue;
    if (sequelMismatch(f.titleEnglish, a.title).length) continue;
    const imdb = (claims.get(a.qid)?.P345 || []).map(c => c.mainsnak?.datavalue?.value).find(v => /^tt\d+$/.test(v || ''));
    if (imdb) out.set(f.id, { id: imdb, via: 'wikidata', note: `Wikidata ${a.qid} (“${a.title}”)` });
  }
  return out;
}

// ---------- proposal 2: TMDB title + year search ----------
async function tmdbProposal(film) {
  if (!film.titleEnglish) return null;
  const r = await tmdb('/search/multi', { query: film.titleEnglish, include_adult: 'false' });
  const hits = ((r && r.results) || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv')
    .map(x => ({ id: x.id, type: x.media_type, title: x.title || x.name || '', original: x.original_title || x.original_name || '', year: yearOf(x.release_date || x.first_air_date) }))
    .filter(rec => describesFilm(film, rec));
  if (!hits.length) return null;
  const imdb = await tmdbImdbIdFor(hits[0].type, hits[0].id);
  return imdb ? { id: imdb, via: 'tmdb', note: `TMDB ${hits[0].type} #${hits[0].id} “${hits[0].title}” (${hits[0].year})` } : null;
}

async function main() {
  if (!hasTmdb()) throw new Error('TMDB_TOKEN (or TMDB_API_KEY) is required.');
  if ((APPLY || APPROVE) && !process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is required to write to Notion.');
  mkdirSync(REPORTS, { recursive: true });
  const films = JSON.parse(readFileSync('./data/films.json', 'utf8'));
  const byId = new Map(films.map(f => [f.id, f]));

  if (APPROVE) {
    const plan = JSON.parse(readFileSync(`${REPORTS}/imdb-fixes.json`, 'utf8'));
    return applyFixes(plan.filter(p => p.proposed && APPROVE.includes(p.id)));
  }

  let targets;
  if (ALL) {
    targets = films.filter(f => imdbIdOf(f.imdb));
  } else {
    if (!existsSync(`${REPORTS}/imdb-suspects.json`)) throw new Error('reports/imdb-suspects.json not found; run `npm run posters:source` first, or use --all.');
    targets = JSON.parse(readFileSync(`${REPORTS}/imdb-suspects.json`, 'utf8')).map(s => byId.get(s.id)).filter(Boolean);
  }
  console.log(`Checking ${targets.length} IMDb link(s)${ALL ? ' (all films)' : ' (suspects from posters:source)'}...`);

  // In --all mode, first find which current links are actually wrong.
  const current = new Map();
  await pool(targets, 6, async f => { current.set(f.id, await tmdbFindImdb(imdbIdOf(f.imdb)).catch(() => null)); });
  const wrong = targets.filter(f => current.get(f.id) && !describesFilm(f, current.get(f.id)));
  const unknown = targets.filter(f => !current.get(f.id));
  console.log(`  current link describes a different title: ${wrong.length} | TMDB doesn't know the ID: ${unknown.length}`);

  const wd = await wikidataProposals(wrong);
  const tm = new Map();
  await pool(wrong, 6, async f => { const p = await tmdbProposal(f).catch(() => null); if (p) tm.set(f.id, p); });

  const fixes = [];
  await pool(wrong, 6, async f => {
    const cur = current.get(f.id);
    const a = wd.get(f.id), b = tm.get(f.id);
    const options = [a, b].filter(Boolean).filter(p => p.id !== imdbIdOf(f.imdb));
    let proposed = null, confidence = null, verified = null;
    if (a && b && a.id === b.id) {
      proposed = a; confidence = 'high';
      verified = await tmdbFindImdb(a.id).catch(() => null);
    } else {
      for (const p of options) {
        const rec = await tmdbFindImdb(p.id).catch(() => null);
        if (describesFilm(f, rec)) { proposed = p; confidence = 'high'; verified = rec; break; }
        if (!proposed) { proposed = p; confidence = rec ? 'conflict' : 'medium'; verified = rec; }
      }
    }
    // A proposal TMDB says is a different title is not a fix.
    if (confidence === 'conflict') { proposed = null; confidence = null; }
    fixes.push({
      id: f.id, title: f.titleEnglish, year: f.year, notion: f.url,
      currentId: imdbIdOf(f.imdb), currentIs: cur ? `“${cur.title}” (${cur.year ?? '?'})` : 'unknown to TMDB',
      proposed: proposed ? proposed.id : null, confidence,
      proposedIs: verified ? `“${verified.title}” (${verified.year ?? '?'})` : null,
      sources: [a && `${a.via}: ${a.id}`, b && `${b.via}: ${b.id}`].filter(Boolean).join(' · '),
      notes: [a?.note, b?.note].filter(Boolean).join(' · '),
    });
  });
  fixes.sort((x, y) => (x.confidence === 'high' ? 0 : x.confidence ? 1 : 2) - (y.confidence === 'high' ? 0 : y.confidence ? 1 : 2) || x.title.localeCompare(y.title));
  writeFileSync(`${REPORTS}/imdb-fixes.json`, JSON.stringify(fixes, null, 2));
  writeReport(fixes);

  const high = fixes.filter(f => f.confidence === 'high'), med = fixes.filter(f => f.confidence === 'medium'), none = fixes.filter(f => !f.proposed);
  console.log(`\nProposed fixes: ${high.length} high confidence, ${med.length} medium, ${none.length} no proposal`);
  console.log(`Report: ${REPORTS}/imdb-fixes.html`);
  if (!APPLY) { console.log('Dry run: nothing written. --apply writes the high-confidence fixes.'); return; }
  await applyFixes(high);
}

async function applyFixes(list) {
  const notion = getNotion();
  const log = [];
  let ok = 0, failed = 0;
  await pool(list, 2, async fix => {
    try {
      await notion.pages.update({ page_id: fix.id, properties: { IMDB: { url: imdbUrl(fix.proposed) } } });
      ok++; log.push({ id: fix.id, title: fix.title, old: fix.currentId, new: fix.proposed });
    } catch (e) { failed++; log.push({ id: fix.id, title: fix.title, error: e.message }); }
  });
  const file = `${REPORTS}/imdb-writes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`\nUpdated ${ok} IMDb link(s) in Notion, ${failed} failed. Log (with old values): ${file}`);
}

function writeReport(fixes) {
  const row = f => `<tr class="${f.confidence || 'none'}">
    <td><a href="${esc(f.notion)}" target="_blank" rel="noopener">${esc(f.title)}</a> <span>${f.year || ''}</span></td>
    <td><a href="${imdbUrl(f.currentId)}" target="_blank" rel="noopener">${f.currentId}</a><br><span>${esc(f.currentIs)}</span></td>
    <td>${f.proposed ? `<a href="${imdbUrl(f.proposed)}" target="_blank" rel="noopener">${f.proposed}</a><br><span>${esc(f.proposedIs || 'not on TMDB')}</span>` : '—'}</td>
    <td>${esc(f.confidence || 'no proposal')}<br><span>${esc(f.sources)}</span></td>
    <td><code>${f.id}</code></td></tr>`;
  writeFileSync(`${REPORTS}/imdb-fixes.html`, `<!doctype html><meta charset=utf-8><title>IMDb link fixes</title>
<style>body{font:13px system-ui;margin:24px;background:#f6f4ef}table{border-collapse:collapse;width:100%}td,th{padding:6px 10px;border-bottom:1px solid #0002;text-align:left;vertical-align:top}
span{opacity:.6;font-size:12px}tr.high td:nth-child(4){color:#166534;font-weight:600}tr.medium td:nth-child(4){color:#b45309;font-weight:600}tr.none{opacity:.6}code{font-size:10px}</style>
<h1>IMDb link fixes — ${new Date().toISOString().slice(0, 10)}</h1>
<p>${fixes.filter(f => f.confidence === 'high').length} high · ${fixes.filter(f => f.confidence === 'medium').length} medium · ${fixes.filter(f => !f.proposed).length} without a proposal. <code>--apply</code> writes high; <code>--approve id,…</code> writes chosen ones.</p>
<table><tr><th>Film</th><th>Current IMDb link points to</th><th>Proposed</th><th>Confidence</th><th>id</th></tr>${fixes.map(row).join('')}</table>`);
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
