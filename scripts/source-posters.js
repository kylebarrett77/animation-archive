#!/usr/bin/env node
/**
 * source-posters.js — find artwork for films that have none, and real
 * posters for films that only have a wide title card.
 *
 * Usage:
 *   node scripts/source-posters.js                 dry run: plan + review page, writes nothing
 *   node scripts/source-posters.js --apply         write exact matches to Notion
 *   node scripts/source-posters.js --approve <id,id,...>
 *                                                  write chosen title-guess candidates
 * Options:
 *   --only-missing   don't touch films that already have art (daily runs)
 *   --limit N        consider only the first N candidates (testing)
 *
 * Env: NOTION_TOKEN (for --apply/--approve); TMDB_TOKEN (v4 read access
 * token) or TMDB_API_KEY (v3). Without a TMDB key, only Wikipedia is used.
 * Reads data/films.json, so run `npm run fetch` first.
 *
 * Matching:
 *   exact   TMDB poster found by the film's IMDb ID, or the lead image of
 *           the film's own Wikipedia article (films without art only).
 *           --apply writes these.
 *   review  TMDB title + year search. Never written automatically; listed
 *           in reports/poster-review.html for approval with --approve.
 *
 * Writes put the new image FIRST in the film's "Poster images" property
 * (the pipeline uses the first file) and keep any existing files after it,
 * so a replaced title card stays in Notion. The file name ("TMDB poster
 * (auto)" / "Wikipedia image (auto)") records provenance for credits.
 * Every write is logged to reports/poster-writes-<timestamp>.json.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { getNotion } from './lib/notion.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const APPROVE = args.includes('--approve') ? (args[args.indexOf('--approve') + 1] || '').split(',').filter(Boolean) : null;
const ONLY_MISSING = args.includes('--only-missing');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const TMDB_TOKEN = process.env.TMDB_TOKEN || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const HAS_TMDB = Boolean(TMDB_TOKEN || TMDB_API_KEY);
const UA = 'GlobalAnimationArchive/1.0 (https://animationarchive.netlify.app; poster sourcing)';
const REPORTS = './reports';
const NAMES = { tmdb: 'TMDB poster (auto)', wikipedia: 'Wikipedia image (auto)' };
const TITLE_CARD_MIN_AR = 0.8; // wider than this = title card / logo, not a poster

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const imdbIdOf = f => (String(f.imdb || '').match(/tt\d{6,10}/) || [])[0] || null;

// Run tasks with a small concurrency limit.
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ---------- TMDB ----------
async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  if (!TMDB_TOKEN) url.searchParams.set('api_key', TMDB_API_KEY);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: TMDB_TOKEN ? { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' } : { accept: 'application/json' } });
    if (res.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 401) throw new Error('TMDB rejected the key (401). Check TMDB_TOKEN / TMDB_API_KEY.');
    if (!res.ok) throw new Error(`TMDB ${path} → HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`TMDB ${path} → rate limited`);
}
const posterUrl = path => `https://image.tmdb.org/t/p/w780${path}`;
const yearOf = d => (d ? Number(String(d).slice(0, 4)) : null);

async function tmdbByImdb(imdbId) {
  const r = await tmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
  const hit = [...(r.movie_results || []), ...(r.tv_results || [])].find(x => x.poster_path);
  if (!hit) return null;
  return {
    url: posterUrl(hit.poster_path),
    via: 'tmdb', match: 'exact',
    detail: `TMDB ${hit.media_type || (hit.title ? 'movie' : 'tv')} #${hit.id} “${hit.title || hit.name}” (${yearOf(hit.release_date || hit.first_air_date) || '?'}) via IMDb ${imdbId}`,
    link: `https://www.themoviedb.org/${hit.title ? 'movie' : 'tv'}/${hit.id}`,
    imdbId,
    tmdbTitle: hit.title || hit.name || '',
    tmdbOriginal: hit.original_title || hit.original_name || '',
    tmdbYear: yearOf(hit.release_date || hit.first_air_date),
  };
}

// An IMDb-ID match is only as good as the IMDb link stored in Notion, and
// some are wrong (e.g. "Megas XLR" (2004) linked to "Face the Nation"
// (1954)). Returns a reason when TMDB's record disagrees with the film.
function tmdbIdentity(film, c) {
  const yd = film.year && c.tmdbYear ? Math.abs(film.year - c.tmdbYear) : null;
  const best = Math.max(...filmNames(film).flatMap(n => [titleSimilarity(n, c.tmdbTitle), titleSimilarity(n, c.tmdbOriginal)]));
  const what = `IMDb ${c.imdbId} is “${c.tmdbTitle}” (${c.tmdbYear ?? '?'}) on TMDB`;
  if (yd !== null && yd > 5) return `${what}, ${yd} years from the archive's ${film.year}: IMDb link may be wrong`;
  if (yd !== null && yd >= 2 && best < 0.6) return `${what}; year and title disagree: IMDb link may be wrong`;
  if (best < 0.3) return `${what}; titles don't match: IMDb link may be wrong`;
  // A sequel linked to its parent (e.g. "Starzinger II" -> "Starzinger") gets
  // the earlier work's poster.
  const extra = sequelMismatch(film.titleEnglish, `${c.tmdbTitle} ${c.tmdbOriginal}`);
  if (extra.length) return `${what}; film title has “${extra.join(' ')}” that TMDB's lacks (sequel/part?)`;
  return null;
}

async function tmdbTitleGuess(film) {
  if (!film.titleEnglish) return null;
  const r = await tmdb('/search/multi', { query: film.titleEnglish, include_adult: 'false' });
  const hits = (r.results || []).filter(x => (x.media_type === 'movie' || x.media_type === 'tv') && x.poster_path);
  const near = hits.find(x => film.year && Math.abs((yearOf(x.release_date || x.first_air_date) || 0) - film.year) <= 1);
  if (!near) return null;
  return {
    url: posterUrl(near.poster_path),
    via: 'tmdb', match: 'review',
    detail: `TMDB title search: “${near.title || near.name}” (${yearOf(near.release_date || near.first_air_date)})`,
    link: `https://www.themoviedb.org/${near.media_type}/${near.id}`,
  };
}

// ---------- Is a Wikipedia article really about THIS film? ----------
// A film is sometimes linked to its franchise or source-material article
// (no dedicated article exists), whose lead image is then a logo or a manga
// / novel cover. Those go to review instead of being written as exact.
const norm = t => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/^the /, '').trim();
function titleSimilarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  const inter = [...A].filter(w => B.has(w)).length;
  return inter / new Set([...A, ...B]).size;
}
const filmNames = film => [film.titleEnglish, film.originalTitle, film.romanizedTitle, ...String(film.alternateTitles || '').split(/[;,|\n]/)].filter(Boolean);
const NOT_THE_WORK = /manga|franchise|novel|comic|video game|game|book|character|soundtrack|album|song|toy|media mix/i;
// Sequel / part markers: "Tekkaman Blade II" must not take the image of the
// parent "Tekkaman Blade" article (that is the earlier series' artwork).
const SEQUEL_TOKEN = /^(ii|iii|iv|v|vi|vii|viii|ix|x|\d+|part|season|movie|film|final|chapter|episode|ova|special|returns|reborn|zero|next|new|sequel|gaiden|kai|shippuden)$/;
function sequelMismatch(filmTitle, articleTitle) {
  const art = new Set(norm(articleTitle).split(' '));
  return norm(filmTitle).split(' ').filter(t => t && !art.has(t) && SEQUEL_TOKEN.test(t));
}
const COVER_FILE = /\b(vol(ume)?\.?[ _-]*0?\d+|manga|tank[oō]bon|light[ _-]?novel|novel|comic|book[ _-]?cover|cover[ _-]?art)\b/i;
function wikiIdentity(film, articleTitle, imageName) {
  const qual = (articleTitle.match(/\(([^)]+)\)\s*$/) || [])[1] || '';
  if (NOT_THE_WORK.test(qual)) return `article is about the ${qual}`;
  const qYear = (qual.match(/\b(19|20)\d{2}\b/) || [])[0];
  if (qYear && film.year && Math.abs(Number(qYear) - film.year) > 1) return `article is the ${qYear} work`;
  if (COVER_FILE.test(String(imageName || '').replace(/_/g, ' '))) return `image looks like a book/manga cover (${imageName})`;
  const best = Math.max(...filmNames(film).map(n => titleSimilarity(n, articleTitle)));
  if (best < 0.6) return `article title “${articleTitle}” differs from the film title`;
  const extra = sequelMismatch(film.titleEnglish, articleTitle);
  if (extra.length) return `film title has “${extra.join(' ')}” that the article “${articleTitle}” lacks (sequel/part?)`;
  return null; // looks like the film itself
}

// ---------- Wikipedia (lead images, batched 50 titles per request) ----------
function parseWiki(url) {
  const m = String(url || '').match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^#?]+)/);
  if (!m) return null;
  try { return { lang: m[1], title: decodeURIComponent(m[2]).replace(/_/g, ' ') }; } catch { return null; }
}

async function wikipediaLeadImages(films) {
  const byLang = new Map();
  for (const f of films) {
    const w = parseWiki(f.wikipedia);
    if (!w) continue;
    if (!byLang.has(w.lang)) byLang.set(w.lang, []);
    byLang.get(w.lang).push({ film: f, title: w.title });
  }
  const found = new Map(); // film.id -> candidate
  for (const [lang, list] of byLang) {
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const api = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      Object.entries({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageimages|pageprops', ppprop: 'wikibase_item',
        piprop: 'original|name', pilicense: 'any', titles: chunk.map(c => c.title).join('|') })
        .forEach(([k, v]) => api.searchParams.set(k, v));
      const res = await fetch(api, { headers: { 'User-Agent': UA } });
      if (!res.ok) { console.warn(`  ⚠ Wikipedia (${lang}) HTTP ${res.status}; skipping ${chunk.length} titles`); continue; }
      const q = (await res.json()).query || {};
      // Follow title normalisation and redirects back to the requested title.
      const alias = new Map();
      for (const n of q.normalized || []) alias.set(n.from, n.to);
      for (const r of q.redirects || []) alias.set(r.from, r.to);
      const resolve = t => { let x = t; for (let k = 0; k < 4 && alias.has(x); k++) x = alias.get(x); return x; };
      const pages = new Map((q.pages || []).map(p => [p.title, p]));
      for (const c of chunk) {
        const page = pages.get(resolve(c.title));
        if (page?.original?.source) {
          const doubt = wikiIdentity(c.film, page.title, page.pageimage);
          found.set(c.film.id, {
            url: page.original.source, via: 'wikipedia', match: doubt ? 'review' : 'exact',
            detail: `Wikipedia (${lang}) lead image of “${page.title}” — ${page.original.width}×${page.original.height}${doubt ? ` · review: ${doubt}` : ''}`,
            link: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
            qid: page.pageprops?.wikibase_item || null,
          });
        }
      }
      await sleep(200); // be polite to Wikimedia
    }
  }
  await demotePrintWorks(found);
  return found;
}

// Wikidata "instance of" (P31) tells us whether an article's subject is the
// animation or its manga / novel / franchise, even when both share a title.
// Types are classified by their English label, so no ID list can go stale.
// This can only send a candidate to review, never promote one.
const PRINT_TYPE = /manga|manhwa|manhua|webtoon|novel|comic|book|literary|written work|franchise|video game|magazine|character/i;
const SCREEN_TYPE = /film|television|tv |anime|animat|cartoon|web series|video|episode|short|ova|ona|series/i;
async function wikidata(params) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  Object.entries({ format: 'json', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  return (await res.json()).entities || {};
}
async function demotePrintWorks(found) {
  const withItem = [...found.values()].filter(c => c.qid);
  const typesOf = new Map();
  try {
    const ids = [...new Set(withItem.map(c => c.qid))];
    for (let i = 0; i < ids.length; i += 50) {
      const ents = await wikidata({ action: 'wbgetentities', props: 'claims', ids: ids.slice(i, i + 50).join('|') });
      for (const [id, e] of Object.entries(ents)) {
        typesOf.set(id, (e.claims?.P31 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean));
      }
      await sleep(200);
    }
    const typeIds = [...new Set([...typesOf.values()].flat())];
    const label = new Map();
    for (let i = 0; i < typeIds.length; i += 50) {
      const ents = await wikidata({ action: 'wbgetentities', props: 'labels', languages: 'en', ids: typeIds.slice(i, i + 50).join('|') });
      for (const [id, e] of Object.entries(ents)) label.set(id, e.labels?.en?.value || id);
      await sleep(200);
    }
    let demoted = 0;
    for (const c of withItem) {
      const labels = (typesOf.get(c.qid) || []).map(t => label.get(t) || t);
      const print = labels.filter(l => PRINT_TYPE.test(l));
      const screen = labels.filter(l => !PRINT_TYPE.test(l) && SCREEN_TYPE.test(l));
      if (print.length && !screen.length && c.match === 'exact') {
        c.match = 'review';
        c.detail += ` · review: Wikidata says the article is a ${print.join(', ')}`;
        demoted++;
      }
    }
    console.log(`  Wikidata check: ${withItem.length} articles typed, ${demoted} more sent to review (print/franchise subject)`);
  } catch (e) {
    console.warn(`  ⚠ Wikidata check skipped (${e.message}); title heuristics still applied`);
  }
}

// ---------- Notion write ----------
async function writePoster(film, candidate) {
  const notion = getNotion();
  const page = await notion.pages.retrieve({ page_id: film.id });
  const current = page.properties['Poster images']?.files || [];
  if (current.some(f => f.type === 'external' && f.external?.url === candidate.url)) return { skipped: 'already present' };
  // Keep every existing file (Notion-hosted files are echoed back by URL).
  const keep = current.map(f => f.type === 'file'
    ? { name: f.name, type: 'file', file: { url: f.file.url } }
    : { name: f.name, type: 'external', external: { url: f.external.url } });
  const files = [{ name: NAMES[candidate.via], type: 'external', external: { url: candidate.url } }, ...keep];
  await notion.pages.update({ page_id: film.id, properties: { 'Poster images': { files } } });
  return { previous: current.map(f => f.name) };
}

// ---------- main ----------
async function main() {
  if (!existsSync('./data/films.json')) throw new Error('data/films.json not found; run `npm run fetch` first.');
  if ((APPLY || APPROVE) && !process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is required to write to Notion.');
  mkdirSync(REPORTS, { recursive: true });

  const films = JSON.parse(readFileSync('./data/films.json', 'utf8'));
  const byId = new Map(films.map(f => [f.id, f]));

  // --approve: write previously reviewed title-guess candidates.
  if (APPROVE) {
    const plan = JSON.parse(readFileSync(`${REPORTS}/poster-plan.json`, 'utf8'));
    const picks = plan.filter(p => p.match === 'review' && APPROVE.includes(p.id));
    console.log(`Approving ${picks.length} of ${APPROVE.length} requested candidate(s)...`);
    return applyAll(picks.map(p => ({ film: byId.get(p.id), candidate: p.candidate, reason: p.reason })).filter(x => x.film));
  }

  const missing = films.filter(f => !f.poster);
  const titleCards = ONLY_MISSING ? [] : films.filter(f => f.poster && f.poster.source === 'notion' && f.poster.ar >= TITLE_CARD_MIN_AR);
  const candidates = [...missing.map(f => ({ film: f, reason: 'missing' })), ...titleCards.map(f => ({ film: f, reason: 'title-card' }))].slice(0, LIMIT);
  console.log(`Films without art: ${missing.length} | title cards to upgrade: ${titleCards.length} | considering: ${candidates.length}`);
  console.log(HAS_TMDB ? 'Sources: TMDB (by IMDb ID) → Wikipedia lead image → TMDB title search (review only)'
                       : 'Sources: Wikipedia lead image only (no TMDB_TOKEN / TMDB_API_KEY set)');

  // 1. TMDB exact, by IMDb ID
  const decisions = new Map();
  const suspects = new Map(); // film.id -> TMDB candidate whose IMDb link looks wrong
  if (HAS_TMDB) {
    let done = 0;
    await pool(candidates, 6, async ({ film }) => {
      const imdb = imdbIdOf(film);
      if (imdb) {
        try {
          const c = await tmdbByImdb(imdb);
          if (c) {
            const doubt = tmdbIdentity(film, c);
            if (doubt) { c.match = 'review'; c.detail += ` · review: ${doubt}`; suspects.set(film.id, c); }
            decisions.set(film.id, c);
          }
        }
        catch (e) { if (/401/.test(e.message)) throw e; console.warn(`  ⚠ ${film.titleEnglish}: ${e.message}`); }
      }
      if (++done % 250 === 0) console.log(`  TMDB: ${done}/${candidates.length} checked, ${decisions.size} posters found`);
    });
    console.log(`  TMDB by IMDb ID: ${decisions.size} posters found; ${suspects.size} look like wrong IMDb links (sent to review)`);
  }

  // 2. Wikipedia lead image, for films that still have no art (not for
  //    title cards: a series' lead image is usually that same title card).
  const needWiki = candidates.filter(c => c.reason === 'missing' && decisions.get(c.film.id)?.match !== 'exact').map(c => c.film);
  const wiki = await wikipediaLeadImages(needWiki);
  // An exact Wikipedia image beats a doubtful TMDB one; otherwise keep TMDB's.
  for (const [id, c] of wiki) if (c.match === 'exact' || !decisions.has(id)) decisions.set(id, c);
  const wikiReview = [...wiki.values()].filter(c => c.match === 'review').length;
  console.log(`  Wikipedia lead images: ${wiki.size} found (of ${needWiki.length} looked up); ${wikiReview} need review (franchise/source article)`);

  // 3. TMDB title search for the rest: review only.
  if (HAS_TMDB) {
    const rest = candidates.filter(c => c.reason === 'missing' && !decisions.has(c.film.id));
    let guesses = 0;
    await pool(rest, 6, async ({ film }) => {
      try { const c = await tmdbTitleGuess(film); if (c) { decisions.set(film.id, c); guesses++; } }
      catch (e) { if (/401/.test(e.message)) throw e; }
    });
    console.log(`  TMDB title guesses (review): ${guesses}`);
  }

  // Plan + reports
  const plan = candidates.map(({ film, reason }) => {
    const c = decisions.get(film.id) || null;
    return { id: film.id, title: film.titleEnglish, year: film.year, country: film.country, notion: film.url,
             reason, match: c ? c.match : 'none', candidate: c,
             imdbSuspect: suspects.has(film.id) ? suspects.get(film.id).detail.split(' · review: ')[1] : null,
             current: film.poster ? `posters/${film.poster.file}` : null };
  });
  writeFileSync(`${REPORTS}/poster-plan.json`, JSON.stringify(plan, null, 2));
  const imdbFix = plan.filter(p => p.imdbSuspect).map(p => ({ id: p.id, title: p.title, year: p.year, notion: p.notion, problem: p.imdbSuspect }));
  writeFileSync(`${REPORTS}/imdb-suspects.json`, JSON.stringify(imdbFix, null, 2));
  if (imdbFix.length) console.log(`  ${imdbFix.length} IMDb links look wrong → reports/imdb-suspects.json`);
  writeReviewPage(plan);

  const exact = plan.filter(p => p.match === 'exact');
  const review = plan.filter(p => p.match === 'review');
  const none = plan.filter(p => p.match === 'none');
  console.log(`\nPlan: ${exact.length} exact (${exact.filter(p => p.reason === 'missing').length} new art, ${exact.filter(p => p.reason === 'title-card').length} title-card upgrades), ${review.length} for review, ${none.length} not found`);
  console.log(`Review page: ${REPORTS}/poster-review.html   Plan: ${REPORTS}/poster-plan.json`);

  if (!APPLY) { console.log('\nDry run: nothing written to Notion. Re-run with --apply to write the exact matches.'); return; }
  await applyAll(exact.map(p => ({ film: byId.get(p.id), candidate: p.candidate, reason: p.reason })));
}

async function applyAll(items) {
  const log = [];
  let written = 0, skipped = 0, failed = 0;
  await pool(items, 2, async ({ film, candidate, reason }) => {
    try {
      const r = await writePoster(film, candidate);
      if (r.skipped) skipped++; else written++;
      log.push({ id: film.id, title: film.titleEnglish, reason, url: candidate.url, via: candidate.via, ...r });
    } catch (e) {
      failed++;
      log.push({ id: film.id, title: film.titleEnglish, reason, error: e.message });
      console.warn(`  ⚠ ${film.titleEnglish}: ${e.message}`);
    }
    if ((written + skipped + failed) % 100 === 0) console.log(`  … ${written + skipped + failed}/${items.length}`);
  });
  const file = `${REPORTS}/poster-writes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`\nWrote ${written} poster(s) to Notion, ${skipped} already present, ${failed} failed. Log: ${file}`);
  console.log('Run `npm run fetch` (or let the daily refresh run) to pull them into the site.');
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `written=${written}\n`, { flag: 'a' });
}

function writeReviewPage(plan) {
  const card = (p, showApprove) => {
    const c = p.candidate;
    return `<figure class="c ${p.match}">
      <div class="imgs">${p.current ? `<img src="../data/${esc(p.current)}" title="current" class="cur">` : ''}<img src="${esc(c.url)}" loading="lazy" referrerpolicy="no-referrer"></div>
      <figcaption><b>${esc(p.title)}</b> <span>${p.year || ''} · ${esc(p.country || '')}</span>
      <small>${esc(c.detail)}</small>
      <small><a href="${esc(c.link)}" target="_blank" rel="noopener">source</a> · <a href="${esc(p.notion)}" target="_blank" rel="noopener">Notion</a>${showApprove ? ` · <code>${p.id}</code>` : ''}</small></figcaption>
    </figure>`;
  };
  const exact = plan.filter(p => p.match === 'exact');
  const review = plan.filter(p => p.match === 'review');
  const none = plan.filter(p => p.match === 'none');
  writeFileSync(`${REPORTS}/poster-review.html`, `<!doctype html><meta charset=utf-8><title>Poster sourcing review</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f4ef;color:#222}h2{margin:2rem 0 .5rem}p.n{opacity:.7}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px}
.c{margin:0;background:#fff;border-radius:8px;padding:8px;box-shadow:0 1px 4px #0002}.c.review{outline:2px solid #d97706}
.imgs{display:flex;gap:4px;align-items:flex-end}.imgs img{width:100%;aspect-ratio:2/3;object-fit:contain;background:#222;border-radius:4px}
.imgs img.cur{width:38%;opacity:.8}figcaption{margin-top:6px;line-height:1.35}figcaption span{opacity:.6}
small{display:block;opacity:.75;margin-top:3px;word-break:break-word}table{border-collapse:collapse;font-size:12px}td{padding:3px 10px 3px 0;border-bottom:1px solid #0001;vertical-align:top}code{font-size:10px}</style>
<h1>Poster sourcing — ${new Date().toISOString().slice(0, 10)}</h1>
<p class=n>${exact.length} exact matches (written by <code>--apply</code>) · ${review.length} title guesses (need approval) · ${none.length} not found. For title-card upgrades the current card is shown small on the left.</p>
<h2>Needs your review (${review.length})</h2>
<p class=n>Approve with: <code>node scripts/source-posters.js --approve id1,id2,…</code></p>
<div class=g>${review.map(p => card(p, true)).join('')}</div>
<h2>Exact matches (${exact.length})</h2><div class=g>${exact.map(p => card(p, false)).join('')}</div>
<h2>IMDb links that look wrong (${plan.filter(p => p.imdbSuspect).length})</h2>
<p class=n>TMDB says these films' IMDb IDs belong to a different title or year. Worth fixing in Notion (the site links to IMDb too).</p>
<table>${plan.filter(p => p.imdbSuspect).map(p => `<tr><td><a href="${esc(p.notion)}" target="_blank" rel="noopener">${esc(p.title)}</a> (${p.year || '?'})</td><td>${esc(p.imdbSuspect)}</td></tr>`).join('')}</table>
<h2>Not found (${none.length})</h2><p class=n>${none.map(p => `${esc(p.title)} (${p.year || '?'})`).join(' · ')}</p>`);
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
