#!/usr/bin/env node
/**
 * refine-data.js — the archive checks and improves its own records.
 *
 * Reads the committed snapshot (data/*.json), compares it with itself and
 * with outside sources, and produces a plan. Only two kinds of change are
 * ever written to Notion automatically, and only with --apply:
 *
 *   links   A film's Studio/Director text names an entity that exists in the
 *           Studios/Directors database, but the relation was never set.
 *           Written additively (existing relations are kept).
 *   fill    An empty Wikipedia or IMDB field, filled from Wikidata when the
 *           film's identity is confirmed (title and year agree).
 *
 * Everything else goes to the review page (reports/refine-review.html):
 *
 *   facts     Year / director / runtime that disagree with Wikidata and TMDB
 *             (never overwritten: a person may have chosen our value)
 *   identity  Films whose IMDb link points at something else entirely
 *   entities  Studio/director names used by several films with no entity
 *   watch     Free copies on the Internet Archive for films with no
 *             working watch link (review only: uploads vary in legitimacy)
 *
 * Usage:
 *   node scripts/refine-data.js                 # plan + review page (no writes)
 *   node scripts/refine-data.js --apply         # also write links + fills (+ log a Session)
 *   node scripts/refine-data.js --publish       # put the review checklist on 🔎 Automated Data Check
 *   node scripts/refine-data.js --only links,fill   # run some checks only
 *   node scripts/refine-data.js --limit 50      # cap writes (testing)
 *
 * Env: NOTION_TOKEN (for --apply), TMDB_TOKEN (optional, strengthens facts).
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { getNotion } from './lib/notion.js';
import { titleSimilarity, bestTitleMatch, imdbIdOf } from './lib/title-match.js';
import { hasTmdb, tmdbFindImdb } from './lib/tmdb.js';

const UA = 'GlobalAnimationArchive/1.0 (https://animationarchive.netlify.app)';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PUBLISH = args.includes('--publish');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null; })();
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity; })();
const runs = name => !ONLY || ONLY.has(name);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const asList = v => (Array.isArray(v) ? v : Object.values(v));
const films = asList(JSON.parse(readFileSync('data/films.json', 'utf8')));
const studios = asList(JSON.parse(readFileSync('data/studios.json', 'utf8')));
const directors = asList(JSON.parse(readFileSync('data/directors.json', 'utf8')));

// Accent-, case- and punctuation-insensitive form used for name matching.
const key = s => ' ' + String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
const GENERIC = new Set([' unknown ', ' various ', ' tba ', ' independent ', ' n a ', ' none ', ' others ']);

async function pool(items, n, fn) {
  const queue = items.map((x, i) => [x, i]);
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) { const [x, i] = queue.shift(); out[i] = await fn(x); }
  }));
  return out;
}

// ---------------------------------------------------------------- links
/**
 * The separate credits in a Studio/Director text field. Splits on , ; / and
 * parentheses, so "Toei Dōga (Toei Animation)" yields both names and
 * "Gonzo (S1)" yields "Gonzo". Segments are also split on "&" / "and" as a
 * second pass, keeping the unsplit form for names like "Halas and Batchelor".
 * All-lowercase segments are annotations ("pilot", "creator") and dropped.
 */
const CORP_SUFFIX = / (inc|ltd|llc|co|corp|corporation|company|gmbh|kft|productions|production|studios|studio) $/;
function creditSegments(text) {
  const coarse = String(text || '').split(/[,;/()]|\s[-–—]\s/).map(s => s.trim()).filter(Boolean);
  const fine = coarse.flatMap(s => s.split(/\s+(?:&|and)\s+/).map(x => x.trim()));
  return [...new Set([...coarse, ...fine])].filter(s => s !== s.toLowerCase() || /[^\x00-\x7f]/.test(s));
}

/**
 * Entities named by a whole credit in the film's text field but not linked.
 * A credit matches an entity when the normalised names are equal, or equal
 * once a corporate suffix is dropped ("OLM, Inc.", "Hanna-Barbera
 * Productions"). Names inside longer names don't count ("OLM Digital" is not
 * OLM; "del Arte e Industria" is not Arte). Names shared by two entity pages
 * are ambiguous and go to review instead.
 */
function linkProposals(entities, textField, linkedField, label) {
  const byKey = new Map();
  for (const e of entities) {
    const k = key(e.name);
    if (k.trim().length < 3 || GENERIC.has(k)) continue;
    byKey.set(k, [...(byKey.get(k) || []), e]);
  }
  const exact = [], ambiguous = [];
  for (const f of films) {
    const linked = new Set((f[linkedField] || []).map(e => e.id));
    const seen = new Set();
    for (const seg of creditSegments(f[textField])) {
      const s = key(seg);
      const k = byKey.has(s) ? s : (CORP_SUFFIX.test(s) && byKey.has(s.replace(CORP_SUFFIX, ' ')) ? s.replace(CORP_SUFFIX, ' ') : null);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const ents = byKey.get(k);
      if (ents.some(e => linked.has(e.id))) continue;
      if (ents.length > 1) { ambiguous.push({ film: f.id, title: f.titleEnglish, kind: label, name: ents[0].name, candidates: ents.map(e => e.id) }); continue; }
      exact.push({ film: f.id, title: f.titleEnglish, year: f.year, kind: label, entity: ents[0].id, name: ents[0].name, text: f[textField] });
    }
  }
  return { exact, ambiguous };
}

/** Names used by 3+ films that match no entity: candidates for new entities. */
function entityCandidates(entities, textField, label) {
  const known = entities.map(e => key(e.name)).filter(k => k.trim().length >= 3);
  const counts = new Map();
  for (const f of films) {
    for (let p of creditSegments(f[textField])) {
      p = p.replace(/^(?:now|later|originally|produced by|animation by|chief director:?)\s+/i, '').trim();
      if (/^(ltd|inc|co|corp|s\.?\s?p\.?\s?a|llc|kft|gmbh)\.?$/i.test(p) || /^(s\d|season|series|pilot|creator|chief)/i.test(p)) continue;
      const k = key(p);
      if (k.trim().length < 3 || GENERIC.has(k) || /various|unknown|episode directors|showrunner/i.test(p)) continue;
      if (known.some(n => k.includes(n) || n.includes(k))) continue;
      const c = counts.get(k) || { name: p, films: [] };
      c.films.push(f.titleEnglish);
      counts.set(k, c);
    }
  }
  return [...counts.values()].filter(c => c.films.length >= 3)
    .sort((a, b) => b.films.length - a.films.length)
    .map(c => ({ kind: label, name: c.name, count: c.films.length, sample: c.films.slice(0, 5) }));
}

// ------------------------------------------------------------- wikidata
async function sparql(query) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Wikidata SPARQL HTTP ${res.status}`);
    return (await res.json()).results.bindings;
  }
  throw new Error('Wikidata SPARQL kept failing');
}

const UNIT_MIN = { Q7727: 1, Q11574: 1 / 60, Q25235: 60 };
/** IMDb ID -> { qid, label, years[], minutes, directors[], enwiki } */
async function wikidataByImdb(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150);
    const rows = await sparql(`SELECT ?imdb ?item ?itemLabel ?date ?amt ?unit ?dirLabel ?article WHERE {
      VALUES ?imdb { ${batch.map(id => `"${id}"`).join(' ')} }
      ?item wdt:P345 ?imdb .
      OPTIONAL { ?item wdt:P577 ?date . }
      OPTIONAL { ?item p:P2047/psv:P2047 [ wikibase:quantityAmount ?amt ; wikibase:quantityUnit ?unit ] . }
      OPTIONAL { ?item wdt:P57 ?dir . }
      OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,ru,fr,de,zh,ko,es,it,cs,pl,hu,mul". }
    }`);
    for (const r of rows) {
      const id = r.imdb.value;
      const w = out.get(id) || { qid: r.item.value.split('/').pop(), label: r.itemLabel?.value, years: new Set(), minutes: null, directors: new Set(), enwiki: null };
      if (r.date) w.years.add(Number(r.date.value.slice(0, 4)));
      if (r.amt && r.unit) { const u = UNIT_MIN[r.unit.value.split('/').pop()]; if (u) w.minutes = Math.round(Number(r.amt.value) * u); }
      if (r.dirLabel && !/^Q\d+$/.test(r.dirLabel.value)) w.directors.add(r.dirLabel.value);
      if (r.article) w.enwiki = r.article.value;
      out.set(id, w);
    }
    process.stdout.write(`\r  Wikidata: ${Math.min(i + 150, ids.length)}/${ids.length}`);
    await sleep(300);
  }
  process.stdout.write('\n');
  return out;
}

// ---------------------------------------------------------------- facts
const minutesOf = rt => {
  const s = String(rt || '').toLowerCase();
  if (!s || /ep|×|x\s*\d|episodes|series|tba/.test(s)) return null;
  const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/);
  if (h) return Number(h[1]) * 60 + (m ? Number(m[1]) : 0);
  return m ? Number(m[1]) : null;
};
const surnameTokens = name => key(name.replace(/\([^)]*\)/g, ' ')).trim().split(' ').filter(t => t.length >= 3);
function directorsAgree(ours, theirs) {
  const ourTokens = new Set(String(ours || '').split(/,|\/|&|\band\b|;|\(|\)/).flatMap(surnameTokens));
  return [...theirs].some(t => surnameTokens(t).some(x => ourTokens.has(x)));
}

// ---------------------------------------------------------------- watch
const hasWorkingLink = f => (f.watchLinks || []).some(l => l && l.url && (l.status === 'Verified' || l.status === 'Restricted'));
async function internetArchiveCandidates(film) {
  const title = film.titleEnglish || film.originalTitle;
  if (!title) return null;
  const q = `title:("${title.replace(/"/g, '')}") AND mediatype:(movies)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=date&fl[]=downloads&rows=8&output=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const docs = (await res.json()).response?.docs || [];
    const hits = docs.map(d => {
      const y = Number(d.year || String(d.date || '').slice(0, 4)) || null;
      return { id: d.identifier, title: Array.isArray(d.title) ? d.title[0] : d.title, year: y, downloads: d.downloads || 0, sim: bestTitleMatch(film, Array.isArray(d.title) ? d.title[0] : d.title) };
    }).filter(h => h.sim >= 0.85 && h.year && film.year && Math.abs(h.year - film.year) <= 1)
      .sort((a, b) => b.sim - a.sim || b.downloads - a.downloads);
    return hits.length ? hits.slice(0, 3) : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- notion writes
async function applyChanges(plan) {
  const notion = getNotion();
  const log = [];
  const writes = [...plan.links.map(l => ({ type: 'link', ...l })), ...plan.fill.map(x => ({ type: 'fill', ...x }))];
  const byFilm = new Map();
  for (const w of writes) byFilm.set(w.film, [...(byFilm.get(w.film) || []), w]);
  let done = 0;
  for (const [filmId, ws] of byFilm) {
    if (done >= LIMIT) break;
    try {
      const page = await notion.pages.retrieve({ page_id: filmId });
      const props = {};
      for (const [prop, kind] of [['Studio (Link)', 'studio'], ['Director (Link)', 'director']]) {
        const add = ws.filter(w => w.type === 'link' && w.kind === kind).map(w => w.entity);
        if (!add.length) continue;
        const current = (page.properties[prop]?.relation || []).map(r => r.id);
        if (page.properties[prop]?.has_more) { log.push({ film: filmId, skipped: `${prop} has more than 25 relations` }); continue; }
        const merged = [...new Set([...current, ...add])];
        if (merged.length !== current.length) props[prop] = { relation: merged.map(id => ({ id })) };
      }
      for (const w of ws.filter(x => x.type === 'fill')) {
        const prop = w.field === 'wikipedia' ? 'Wikipedia' : 'IMDB';
        if (page.properties[prop]?.url) { log.push({ film: filmId, skipped: `${prop} no longer empty` }); continue; }
        props[prop] = { url: w.value };
      }
      if (!Object.keys(props).length) { log.push({ film: filmId, skipped: 'nothing to change' }); continue; }
      await notion.pages.update({ page_id: filmId, properties: props });
      log.push({ film: filmId, title: ws[0].title, wrote: ws.map(w => w.type === 'link' ? `${w.kind}: ${w.name}` : `${w.field}: ${w.value}`) });
      done++;
    } catch (e) { log.push({ film: filmId, error: e.message }); }
    if (done % 25 === 0) process.stdout.write(`\r  Written ${done}/${byFilm.size}`);
  }
  process.stdout.write('\n');
  mkdirSync('reports', { recursive: true });
  const file = `reports/refine-writes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(log, null, 1));
  const wrote = log.filter(l => l.wrote).length;
  console.log(`Wrote ${wrote} film(s), skipped ${log.filter(l => l.skipped).length}, failed ${log.filter(l => l.error).length}. Log: ${file}`);
  return wrote;
}

// ---------------------------------------------------------------- notion: review checklist + session log
// "🔎 Automated Data Check" page under 🎬 Animation Archive, and the Sessions
// data source. Both must be shared with the integration (••• → Connections).
const REVIEW_PAGE_ID = '4259fae4-b254-81b3-b0d4-e59b9eea917c';
const SESSIONS_DB_ID = '157b71aed4894f70adf9e03f4d37d628';
const SESSIONS_DS_ID = '97313c25-5f6e-4498-a61d-58ad292febd1';
const SECTION_CAP = 150;

const rt = (text, url) => ({ type: 'text', text: { content: String(text).slice(0, 1900), link: url ? { url } : null } });
const mention = id => ({ type: 'mention', mention: { page: { id } } });
const block = (type, rich_text, extra = {}) => ({ object: 'block', type, [type]: { rich_text, ...extra } });
const todo = parts => block('to_do', parts, { checked: false });

function reviewBlocks(plan) {
  const blocks = [];
  const section = (title, intro, items, render) => {
    blocks.push(block('heading_2', [rt(`${title} (${items.length})`)]));
    blocks.push(block('paragraph', [rt(intro)]));
    for (const x of items.slice(0, SECTION_CAP)) blocks.push(todo(render(x)));
    if (items.length > SECTION_CAP) blocks.push(block('paragraph', [rt(`…and ${items.length - SECTION_CAP} more in the run's review artifact (reports/refine-review.html).`)]));
  };
  blocks.push(block('callout', [rt(`Automated Cleanup/Audit check, ${new Date().toISOString().slice(0, 10)}. Auto-fixed this run: ${plan.links.length} relations, ${plan.fill.length} empty fields${APPLY ? '' : ' (planned only)'}. Everything below is for a research session.`)], { icon: { type: 'emoji', emoji: '🤖' }, color: 'blue_background' }));
  section('Wrong IMDb links', 'The IMDb ID resolves to a different title. Find the correct tt-ID.', plan.identity,
    x => [mention(x.film), rt(' → IMDb '), rt(x.imdb, `https://www.imdb.com/title/${x.imdb}/`), rt(` is “${x.label}”${x.years.length ? ` (${x.years.join(', ')})` : ''}`)]);
  section('Facts that disagree with Wikidata / TMDB', 'Verify with native-language sources first; our value may be right. ★ = both outside sources agree with each other.', plan.facts,
    x => [rt(x.strong ? '★ ' : ''), mention(x.film), rt(` — ${x.field}: ours “${x.ours}”, Wikidata “${x.wikidata ?? '—'}”${x.tmdb ? `, TMDB “${x.tmdb}”` : ''}`)]);
  section('Entities needing creation', 'Names used by 3+ films with no Studios/Directors page. Create the page with this exact name; the next run links the films. Some are alternate names of an existing page, so add the alias to that page’s film credits instead.', plan.entities,
    x => [rt(`${x.kind}: `), rt(x.name), rt(` — ${x.count} films (${x.sample.join('; ')})`)]);
  section('Duplicate entity pages', 'Two pages share this name, so the film can’t be linked. Merge them.', plan.ambiguous,
    x => [rt(`${x.kind}: ${x.name} — `), mention(x.film)]);
  section('Free copies on the Internet Archive', 'Films ≥50 years old with no working watch link. Check the upload is legitimate, then add a Watch Links entry (Link Status: Unverified).', plan.watch,
    x => [mention(x.film), rt(' — '), ...x.hits.flatMap((h, i) => [rt(i ? ', ' : ''), rt(`${h.title} (${h.year})`, `https://archive.org/details/${h.id}`)])]);
  return blocks;
}

async function publishReview(plan) {
  const notion = getNotion();
  const blocks = reviewBlocks(plan);
  const page = await notion.pages.create({
    parent: { page_id: REVIEW_PAGE_ID },
    icon: { type: 'emoji', emoji: '🗓️' },
    properties: { title: { title: [rt(`Data check — ${new Date().toISOString().slice(0, 10)}`)] } },
    children: blocks.slice(0, 100),
  });
  for (let i = 100; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: page.id, children: blocks.slice(i, i + 100) });
  }
  // Keep only the newest checklist; older ones go to Notion's trash.
  const kids = await notion.blocks.children.list({ block_id: REVIEW_PAGE_ID, page_size: 100 });
  for (const b of kids.results.filter(b => b.type === 'child_page' && b.id !== page.id && /^Data check — /.test(b.child_page.title))) {
    await notion.pages.update({ page_id: b.id, in_trash: true });
  }
  console.log(`Review checklist published to Notion: ${page.url}`);
}

async function logSession(plan, wrote) {
  const notion = getNotion();
  const { queryAll } = await import('./lib/notion.js');
  const rows = await queryAll(SESSIONS_DB_ID);
  const nums = rows.map(r => Number(((r.properties.Session?.title || []).map(t => t.plain_text).join('').match(/^Session\s+(\d+)/i) || [])[1])).filter(Number.isFinite);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const text = s => ({ rich_text: [rt(s)] });
  const studioN = plan.links.filter(l => l.kind === 'studio').length, directorN = plan.links.length - studioN;
  await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: SESSIONS_DS_ID },
    properties: {
      Session: { title: [rt(`Session ${n}: Cleanup/Audit — Automated data check`)] },
      Date: { date: { start: new Date().toISOString().slice(0, 10) } },
      'Focus Region': { select: { name: 'Mixed/Other' } },
      'Films Validated': { number: 0 }, 'Films Added': { number: 0 }, 'Queue Items Added': { number: 0 },
      'Time Spent': text('automated (nightly refresh)'),
      'Methodology Notes': text(`scripts/refine-data.js --apply. Updated ${wrote} film(s): ${studioN} Studio (Link) + ${directorN} Director (Link) relations added (exact whole-credit match to existing pages, additive only), ${plan.fill.length} empty Wikipedia/IMDB fields filled from Wikidata (title + year confirmed).`),
      Blockers: text(`For review on 🔎 Automated Data Check: ${plan.identity.length} wrong IMDb links, ${plan.facts.length} fact disagreements, ${plan.entities.length} entities needing creation, ${plan.ambiguous.length} duplicate entity pages, ${plan.watch.length} Internet Archive candidates.`),
    },
  });
  console.log(`Logged Session ${n} in Notion`);
}

// ---------------------------------------------------------------- review page
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function reviewHtml(plan) {
  const filmById = new Map(films.map(f => [f.id, f]));
  const notionLink = id => { const f = filmById.get(id); return f ? `<a href="${esc(f.url)}">${esc(f.titleEnglish || 'Untitled')}</a>${f.year ? ` (${f.year})` : ''}` : esc(id); };
  const table = (head, rows) => rows.length ? `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="none">Nothing found.</p>';
  const section = (id, title, intro, body) => `<section id="${id}"><h2>${title}</h2><p class="intro">${intro}</p>${body}</section>`;
  const f = plan.facts;
  return `<!doctype html><meta charset="utf-8"><title>Data review</title>
<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;color:#222}h1{font-weight:500}h2{margin-top:40px;border-bottom:2px solid #222;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#666}.intro{color:#555}.none{color:#888}.hi{color:#a0153e;font-weight:600}nav a{margin-right:14px}code{background:#f3f3f3;padding:1px 4px}</style>
<h1>Data review — ${new Date().toISOString().slice(0, 10)}</h1>
<p>Generated by <code>scripts/refine-data.js</code>. Titles open the film in Notion. Nothing on this page has been written; fix in Notion and the next refresh picks it up.</p>
<nav>${[['facts', `Facts (${f.length})`], ['identity', `Identity (${plan.identity.length})`], ['entities', `New entities (${plan.entities.length})`], ['ambiguous', `Ambiguous links (${plan.ambiguous.length})`], ['watch', `Free copies (${plan.watch.length})`], ['applied', `Auto-fixes (${plan.links.length + plan.fill.length})`]].map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>
${section('facts', 'Facts that disagree with outside sources', 'Our value next to Wikidata and TMDB. <span class="hi">Red</span> rows: both outside sources agree with each other and not with us. Our value is never overwritten automatically.',
  table(['Film', 'Field', 'Ours', 'Wikidata', 'TMDB'], f.map(x => [notionLink(x.film), x.field, esc(x.ours), esc(x.wikidata ?? '—'), esc(x.tmdb ?? '—')].map((c, i) => i === 1 && x.strong ? `<span class="hi">${c}</span>` : c))))}
${section('identity', 'IMDb links that point at a different title', 'The IMDb ID resolves to a title and year that don’t match the film. Fix the IMDB field in Notion.',
  table(['Film', 'IMDb', 'Resolves to'], plan.identity.map(x => [notionLink(x.film), `<a href="https://www.imdb.com/title/${x.imdb}/">${x.imdb}</a>`, esc(`${x.label} (${x.years.join(', ') || '?'})`)])))}
${section('entities', 'Studios and directors without an entry', 'Names used by three or more films with no matching page in the Studios or Directors database. Creating the page (with the exact name) lets the next run link the films automatically.',
  table(['Kind', 'Name', 'Films', 'Examples'], plan.entities.map(x => [x.kind, esc(x.name), x.count, esc(x.sample.join('; '))])))}
${section('ambiguous', 'Ambiguous names', 'The film names an entity, but two entity pages share that name. Merge or rename one, then the next run links it.',
  table(['Film', 'Kind', 'Name', 'Entity pages'], plan.ambiguous.map(x => [notionLink(x.film), x.kind, esc(x.name), x.candidates.length])))}
${section('watch', 'Possible free copies on the Internet Archive', 'Films with no working watch link where the Internet Archive has an upload with a matching title and year. Check the upload is legitimate (public domain, or posted by the rights holder) before adding it.',
  table(['Film', 'Candidates'], plan.watch.map(x => [notionLink(x.film), x.hits.map(h => `<a href="https://archive.org/details/${esc(h.id)}">${esc(h.title)}</a> (${h.year}, ${h.downloads.toLocaleString()} views)`).join('<br>')])))}
${section('applied', 'Automatic fixes in this plan', APPLY ? 'Written to Notion in this run.' : 'Planned only (run with --apply to write).',
  table(['Film', 'Change'], [...plan.links.map(x => [notionLink(x.film), `link ${x.kind}: ${esc(x.name)}`]), ...plan.fill.map(x => [notionLink(x.film), `fill ${x.field}: <a href="${esc(x.value)}">${esc(x.value)}</a>`])]))}
`;
}

// ---------------------------------------------------------------- main
async function main() {
  const plan = { generated: new Date().toISOString(), links: [], ambiguous: [], fill: [], facts: [], identity: [], entities: [], watch: [] };

  if (runs('links')) {
    const s = linkProposals(studios, 'studio', 'studioEntities', 'studio');
    const d = linkProposals(directors, 'director', 'directorEntities', 'director');
    plan.links = [...s.exact, ...d.exact];
    plan.ambiguous = [...s.ambiguous, ...d.ambiguous];
    console.log(`Links: ${s.exact.length} studio + ${d.exact.length} director relations to add; ${plan.ambiguous.length} ambiguous`);
  }
  if (runs('entities')) {
    plan.entities = [...entityCandidates(studios, 'studio', 'studio'), ...entityCandidates(directors, 'director', 'director')];
    console.log(`Entities: ${plan.entities.length} names used by 3+ films with no entity page`);
  }

  if (runs('facts') || runs('fill')) {
    const withImdb = films.map(f => [f, imdbIdOf(f.imdb)]).filter(([, id]) => id);
    const wd = await wikidataByImdb([...new Set(withImdb.map(([, id]) => id))]);
    let tmdbYears = new Map();
    if (runs('facts') && hasTmdb()) {
      const found = await pool(withImdb, 8, async ([, id]) => [id, await tmdbFindImdb(id).catch(() => null)]);
      tmdbYears = new Map(found.filter(([, t]) => t).map(([id, t]) => [id, t]));
      console.log(`  TMDB: ${tmdbYears.size} of ${withImdb.length} IMDb IDs resolved`);
    }
    for (const [f, id] of withImdb) {
      const w = wd.get(id), t = tmdbYears.get(id);
      const wYear = w && w.years.size ? Math.min(...w.years) : null;
      const sim = Math.max(w ? bestTitleMatch(f, w.label) : 0, t ? bestTitleMatch(f, t.title, t.original) : 0);
      const outYear = wYear ?? t?.year ?? null;
      // Identity: neither source's title resembles ours and the year is off too.
      if ((w || t) && sim < 0.4 && (!outYear || !f.year || Math.abs(outYear - f.year) > 2)) {
        plan.identity.push({ film: f.id, imdb: id, label: w?.label || t?.title, years: [...new Set([wYear, t?.year].filter(Boolean))] });
        continue;
      }
      if (runs('fill') && !f.wikipedia && w?.enwiki && sim >= 0.6 && (!wYear || !f.year || Math.abs(wYear - f.year) <= 1)) {
        plan.fill.push({ film: f.id, title: f.titleEnglish, field: 'wikipedia', value: w.enwiki });
      }
      if (!runs('facts')) continue;
      // Year: flag 2+ years off, or 1 off when both sources agree on another year.
      if (f.year && (wYear || t?.year)) {
        const offs = [wYear, t?.year].filter(Boolean).map(y => y - f.year);
        const agree = wYear && t?.year && wYear === t.year && wYear !== f.year;
        if (agree || offs.some(o => Math.abs(o) >= 2)) {
          plan.facts.push({ film: f.id, field: 'year', ours: f.year, wikidata: wYear, tmdb: t?.year ?? null, strong: Boolean(agree) });
        }
      }
      if (w && w.directors.size && f.director && !/unknown|various|tba/i.test(f.director) && !directorsAgree(f.director, w.directors)) {
        plan.facts.push({ film: f.id, field: 'director', ours: f.director, wikidata: [...w.directors].join(', '), tmdb: null, strong: false });
      }
      const ours = f.format === 'Feature' ? minutesOf(f.runtime) : null;
      if (ours && w?.minutes && Math.abs(ours - w.minutes) > 10 && Math.abs(ours - w.minutes) / w.minutes > 0.15) {
        plan.facts.push({ film: f.id, field: 'runtime', ours: f.runtime, wikidata: `${w.minutes} min`, tmdb: null, strong: false });
      }
    }
    // Missing IMDb: fill from Wikidata via the film's English Wikipedia article.
    if (runs('fill')) {
      const noImdb = films.filter(f => !imdbIdOf(f.imdb) && /en\.wikipedia\.org\/wiki\//.test(f.wikipedia || ''));
      for (const f of noImdb) {
        const title = decodeURIComponent(f.wikipedia.split('/wiki/')[1].split('#')[0]).replace(/_/g, ' ');
        const rows = await sparql(`SELECT ?imdb ?itemLabel ?date WHERE { ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name "${title.replace(/"/g, '\\"')}"@en . ?item wdt:P345 ?imdb . OPTIONAL { ?item wdt:P577 ?date } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`).catch(() => []);
        const r = rows.find(x => /^tt\d+$/.test(x.imdb.value));
        const y = r?.date ? Number(r.date.value.slice(0, 4)) : null;
        if (r && bestTitleMatch(f, r.itemLabel?.value) >= 0.6 && (!y || !f.year || Math.abs(y - f.year) <= 1)) {
          plan.fill.push({ film: f.id, title: f.titleEnglish, field: 'imdb', value: `https://www.imdb.com/title/${r.imdb.value}/` });
        }
      }
    }
    const order = { year: 0, director: 1, runtime: 2 };
    plan.facts.sort((a, b) => (b.strong - a.strong) || order[a.field] - order[b.field]);
    console.log(`Facts: ${plan.facts.length} disagreements (${plan.facts.filter(x => x.strong).length} strong); identity: ${plan.identity.length}; fills: ${plan.fill.length}`);
  }

  if (runs('watch')) {
    // Older films only: the Internet Archive is a legitimate home mainly for
    // public-domain and archival animation; uploads of recent films are not.
    const PD_CUTOFF = new Date().getFullYear() - 50;
    const need = films.filter(f => !hasWorkingLink(f) && f.year && f.year <= PD_CUTOFF);
    const found = await pool(need, 4, async f => ({ film: f.id, hits: await internetArchiveCandidates(f) }));
    plan.watch = found.filter(x => x.hits);
    console.log(`Watch: ${plan.watch.length} of ${need.length} pre-${PD_CUTOFF + 1} films without a working link have a matching Internet Archive upload`);
  }

  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/refine-plan.json', JSON.stringify(plan, null, 1));
  writeFileSync('reports/refine-review.html', reviewHtml(plan));
  console.log('Plan: reports/refine-plan.json   Review page: reports/refine-review.html');

  let wrote = 0;
  if (APPLY && (plan.links.length || plan.fill.length)) wrote = await applyChanges(plan);
  // Notion side effects are best-effort: a missing share must not fail the refresh.
  const hint = e => e.code === 'object_not_found' ? ' (share the page/database with the integration: ••• → Connections)' : '';
  if (APPLY && wrote > 0) await logSession(plan, wrote).catch(e => console.warn(`⚠ Session not logged: ${e.message}${hint(e)}`));
  if (PUBLISH) await publishReview(plan).catch(e => console.warn(`⚠ Review checklist not published: ${e.message}${hint(e)}`));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `written=${wrote}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
