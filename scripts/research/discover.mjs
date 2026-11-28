#!/usr/bin/env node
/**
 * discover.mjs — find animated works from a country that the archive does not have yet (roadmap stage 4).
 *
 *   node scripts/research/discover.mjs --country Bulgaria              # propose candidates (writes nothing to Notion)
 *   node scripts/research/discover.mjs --country "East Germany" --min-sitelinks 2
 *   node scripts/research/discover.mjs --country Bulgaria --add Q123,Q456   # add the chosen candidates to the Queue as New
 *
 * Candidates come from Wikidata (animated films, shorts and series whose country of origin is the
 * given country), minus anything already in Films or the Queue (same matcher as brief.mjs). They are
 * ranked by whether the work has an article in its own language's Wikipedia, then by how many
 * Wikipedias cover it: a rough signal that there is enough to research. The report also lists the
 * archive's curated Sources DB entries for the country, which are where a session should look first.
 * Queue additions go in as Status New with the Wikidata ID in Source Found, so they enter the normal
 * brief → lint → promote → log pipeline. Nothing is added without --add and explicit IDs.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { getNotion, queryAll } from '../lib/notion.js';
import { loadEnv, DB, DS, WORK_DIR, UA, plain, filmsIndex, findDuplicates, sourcesIndex, sourcesFor, stamp } from './lib.mjs';

loadEnv();
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const country = opt('--country'); if (!country) { console.error('usage: discover.mjs --country NAME [--min-sitelinks N] [--add Q1,Q2]'); process.exit(2); }
const minLinks = Number(opt('--min-sitelinks', 0));   // many national-cinema works have a Wikidata item but no article yet

// Wikidata items for the archive's Country values, and the Wikipedia language that counts as "native".
const C = {
  Bulgaria: ['Q219', 'bg'], 'East Germany': ['Q16957', 'de'], Romania: ['Q218', 'ro'], Cuba: ['Q241', 'es'], Vietnam: ['Q881', 'vi'], Portugal: ['Q45', 'pt'],
  Finland: ['Q33', 'fi'], Indonesia: ['Q252', 'id'], 'Hong Kong': ['Q8646', 'zh'], Netherlands: ['Q55', 'nl'], Sweden: ['Q34', 'sv'], Norway: ['Q20', 'no'],
  Denmark: ['Q35', 'da'], Serbia: ['Q403', 'sr'], Croatia: ['Q224', 'hr'], Slovenia: ['Q215', 'sl'], Yugoslavia: ['Q83286', 'sh'], Turkey: ['Q43', 'tr'], Israel: ['Q801', 'he'],
  Philippines: ['Q928', 'tl'], Thailand: ['Q869', 'th'], Colombia: ['Q739', 'es'], Argentina: ['Q414', 'es'], Chile: ['Q298', 'es'], Mexico: ['Q96', 'es'], Peru: ['Q419', 'es'],
  Iran: ['Q794', 'fa'], Egypt: ['Q79', 'ar'], Greece: ['Q41', 'el'], Austria: ['Q40', 'de'], Switzerland: ['Q39', 'de'], Belgium: ['Q31', 'nl'], Iceland: ['Q189', 'is'],
  Estonia: ['Q191', 'et'], Latvia: ['Q211', 'lv'], Lithuania: ['Q37', 'lt'], Ukraine: ['Q212', 'uk'], Georgia: ['Q230', 'ka'], Armenia: ['Q399', 'hy'], Poland: ['Q36', 'pl'],
  Hungary: ['Q28', 'hu'], Czechoslovakia: ['Q33946', 'cs'], 'Czech Republic': ['Q213', 'cs'], Slovakia: ['Q214', 'sk'], USSR: ['Q15180', 'ru'], Russia: ['Q159', 'ru'],
  China: ['Q148', 'zh'], Taiwan: ['Q865', 'zh'], 'South Korea': ['Q884', 'ko'], 'North Korea': ['Q423', 'ko'], India: ['Q668', 'hi'], Brazil: ['Q155', 'pt'], Italy: ['Q38', 'it'],
  Spain: ['Q29', 'es'], France: ['Q142', 'fr'], Germany: ['Q183', 'de'], Nigeria: ['Q1033', 'en'], Kenya: ['Q114', 'en'], 'South Africa': ['Q258', 'en'], Malaysia: ['Q833', 'ms'],
  Singapore: ['Q334', 'en'], Venezuela: ['Q717', 'es'], Uruguay: ['Q77', 'es'], Bolivia: ['Q750', 'es'], Albania: ['Q222', 'sq'], 'North Macedonia': ['Q221', 'mk'], Kazakhstan: ['Q232', 'kk'],
};
if (!C[country]) { console.error(`No Wikidata mapping for "${country}". Add it to the C table.`); process.exit(2); }
const [qid, nativeLang] = C[country];

// Country: the state and its predecessor states (Bulgarian works point at the People's Republic of Bulgaria, Q121932),
// found up to three "replaced by" steps back. East Germany etc. are their own items.
// Wikidata's public endpoint rate-limits (429) and times out (502/504); back off and retry, honouring Retry-After.
const sparql = async q => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (r.ok) return (await r.json()).results.bindings;
    if (![429, 500, 502, 503, 504].includes(r.status) || attempt === 5) { console.error(`Wikidata query failed: HTTP ${r.status}`); process.exit(1); }
    const wait = Math.min(120, Number(r.headers.get('retry-after')) || 15 * attempt);
    console.error(`Wikidata HTTP ${r.status}; retrying in ${wait}s (attempt ${attempt}/5)`); await new Promise(res => setTimeout(res, wait * 1000));
  }
};
// Only predecessors replaced by this country alone: the People's Republic of Bulgaria → Bulgaria counts; the German Reich
// (replaced by both German states, Austria…) does not, or pre-1945 German films would be filed as East German.
const preds = (await sparql(`SELECT DISTINCT ?s WHERE { { ?s wdt:P1366 wd:${qid} } UNION { ?s wdt:P1366 ?m . ?m wdt:P1366 wd:${qid} . FILTER NOT EXISTS { ?m wdt:P1366 ?o2 FILTER(?o2 != wd:${qid}) } } FILTER NOT EXISTS { ?s wdt:P1366 ?other FILTER(?other != wd:${qid} && NOT EXISTS { ?other wdt:P1366 wd:${qid} }) } }`)).map(b => b.s.value.split('/').pop());
const states = [qid, ...preds].map(q => `wd:${q}`).join(' ');
// Three small queries (one big UNION times out): animated work types; films with an animation genre; shorts by an animator.
const MATCH = [
  `VALUES ?kind { wd:Q202866 wd:Q17517379 wd:Q581714 wd:Q29168811 wd:Q117467246 wd:Q20650540 } ?item wdt:P31 ?kind .`,
  `VALUES ?kind { wd:Q202866 wd:Q11425 wd:Q17517379 } VALUES ?film { wd:Q11424 wd:Q24862 wd:Q506240 wd:Q5398426 } ?item wdt:P136 ?kind ; wdt:P31 ?film .`,   // fixed film types: a subclass path here timed out on large countries
  `?item wdt:P31 wd:Q24862 ; wdt:P57/wdt:P106 wd:Q266569 . BIND(wd:Q24862 AS ?kind)`,
];
// Phase 1: matching item IDs (fast). Phase 2: details in batches (labels/sitelinks in one big query time out).
const pause = ms => new Promise(res => setTimeout(res, ms));
const kindOf = new Map();
for (const m of MATCH) {
  for (const b of await sparql(`SELECT DISTINCT ?item ?kind WHERE { VALUES ?state { ${states} } ?item wdt:P495 ?state . ${m} }`))
    if (!kindOf.has(b.item.value.split('/').pop())) kindOf.set(b.item.value.split('/').pop(), b.kind?.value?.split('/').pop());
  await pause(1500);   // be polite to the endpoint
}
const rows = []; const all = [...kindOf.keys()];
for (let i = 0; i < all.length; i += 80) {
  const ids = all.slice(i, i + 80).map(q => `wd:${q}`).join(' ');
  rows.push(...await sparql(`SELECT ?item ?en ?native ?orig (MIN(?date) AS ?first) ?links ?imdb (GROUP_CONCAT(DISTINCT ?dirLabel; separator=", ") AS ?dirs) ?nativeWiki WHERE {
    VALUES ?item { ${ids} } ?item wikibase:sitelinks ?links .
    OPTIONAL { ?item wdt:P577 ?date } OPTIONAL { ?item wdt:P1476 ?orig } OPTIONAL { ?item wdt:P345 ?imdb }
    OPTIONAL { ?item wdt:P57 ?dir . OPTIONAL { ?dir rdfs:label ?dEn FILTER(lang(?dEn)="en") } OPTIONAL { ?dir rdfs:label ?dNat FILTER(lang(?dNat)="${nativeLang}") } BIND(COALESCE(?dEn, ?dNat) AS ?dirLabel) }   # one name per person
    OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") } OPTIONAL { ?item rdfs:label ?native FILTER(lang(?native)="${nativeLang}") }
    OPTIONAL { ?nativeWiki schema:about ?item; schema:isPartOf <https://${nativeLang}.wikipedia.org/> }
  } GROUP BY ?item ?en ?native ?orig ?links ?imdb ?nativeWiki`));
  await pause(1500);
}
const KIND = { Q202866: 'Feature', Q29168811: 'Feature', Q17517379: 'Short', Q581714: 'Series', Q117467246: 'Series', Q20650540: 'Short', Q11425: 'Unknown', Q24862: 'Short' };
const parsed = rows.map(b => ({
  qid: b.item.value.split('/').pop(), en: b.en?.value, native: b.native?.value, orig: b.orig?.value,
  year: b.first?.value ? Number(b.first.value.slice(0, 4)) : null, links: Number(b.links.value), imdb: b.imdb?.value || null,
  directors: b.dirs?.value || '', format: KIND[kindOf.get(b.item.value.split('/').pop())] || 'Unknown', nativeWiki: b.nativeWiki?.value || null,
}));
const byQ = new Map(); for (const x of parsed) if (!byQ.has(x.qid) || (x.nativeWiki && !byQ.get(x.qid).nativeWiki)) byQ.set(x.qid, x);

// ---- de-duplicate against Films and the Queue
const films = await filmsIndex();
const queue = (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), orig: plain(p.properties['Original Title']), status: p.properties.Status?.select?.name, src: plain(p.properties['Source Found']) }));
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const qTitles = new Set(queue.flatMap(q => [norm(q.title), norm(q.orig)]).filter(Boolean));
const candidates = [], known = [];
for (const x of byQ.values()) {
  const titles = [x.en, x.native, x.orig].filter(Boolean);
  if (!titles.length || x.links < minLinks) continue;
  const inQueue = queue.find(q => q.src.includes(x.qid)) || (titles.some(t => qTitles.has(norm(t))) && 'title');
  const dups = findDuplicates(films, { titles, year: x.year, director: x.directors }).filter(d => d.strength !== 'director-year');
  (inQueue || dups.length ? known : candidates).push({ ...x, inQueue: !!inQueue, dup: dups[0]?.title });
}
candidates.sort((p, q) => (!!q.nativeWiki - !!p.nativeWiki) || q.links - p.links || (p.year || 9999) - (q.year || 9999));

// ---- report
const srcIdx = await sourcesIndex();
const curated = sourcesFor(srcIdx, country, 10);
const dir = `${WORK_DIR}/discovery`; mkdirSync(dir, { recursive: true });
const base = `${dir}/${country.toLowerCase().replace(/\s+/g, '-')}-${stamp()}`;
writeFileSync(`${base}.json`, JSON.stringify({ country, qid, candidates, known }, null, 1));
const md = [`# Discovery: ${country}`, '', `${candidates.length} candidates not in Films or the Queue; ${known.length} Wikidata works already covered.`, '',
  `**Curated sources for ${country} (Sources DB):** ${curated.length ? curated.map(s => `${s.name} [${s.reliability}]`).join('; ') : 'none yet. Record good ones with sources-sync.mjs.'}`, '',
  '| QID | Title (en) | Native title | Year | Format | Director | Wikipedias | Native wiki | IMDb |', '|---|---|---|---|---|---|---|---|---|',
  ...candidates.map(c => `| ${c.qid} | ${c.en || ''} | ${c.native || c.orig || ''} | ${c.year || ''} | ${c.format} | ${c.directors} | ${c.links} | ${c.nativeWiki ? 'yes' : ''} | ${c.imdb || ''} |`)].join('\n');
writeFileSync(`${base}.md`, md);

const pick = opt('--add');
if (!pick) {
  console.log(`${country}: ${candidates.length} candidates, ${known.length} already covered. Curated sources: ${curated.map(s => s.name).join('; ') || 'none'}`);
  console.log(candidates.slice(0, 40).map(c => `${c.qid.padEnd(11)} ${String(c.year || '').padEnd(5)} ${c.format.padEnd(7)} ${String(c.links).padStart(2)}${c.nativeWiki ? '*' : ' '} ${c.en || c.native || c.orig}${c.native && c.en && c.native !== c.en ? ` / ${c.native}` : ''}${c.directors ? ` — ${c.directors}` : ''}`).join('\n'));
  console.log(`\nReport: ${base}.md  (* = article in ${nativeLang}.wikipedia)`);
  process.exit(0);
}

// ---- add chosen candidates to the Queue (Status New)
const ids = pick.split(',').map(s => s.trim()).filter(Boolean);
const n = getNotion(); const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s || '').slice(0, 1900) } }] }); const log = [];
for (const id of ids) {
  const c = candidates.find(x => x.qid === id);
  if (!c) { log.push({ qid: id, skipped: known.some(k => k.qid === id) ? 'already in Films or Queue' : 'not a candidate' }); continue; }
  const title = c.en || c.native || c.orig;
  const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.queue }, properties: {
    Title: { title: [{ type: 'text', text: { content: title } }] }, 'Original Title': t(c.native && c.native !== title ? c.native : c.orig || 'N/A'),
    Year: { number: c.year }, Country: { select: { name: country } }, Format: { select: { name: c.format } }, Director: t(c.directors),
    Status: { select: { name: 'New' } }, Priority: { select: { name: c.nativeWiki && c.links >= 3 ? 'High' : 'Medium' } },
    'Release Status': { select: { name: 'Released' } }, 'Content Type': { select: { name: 'Animation' } }, 'Films DB Checked': { checkbox: true },
    'Source Found': t(`Wikidata discovery (${c.qid})`),
    'Research Notes': t(`Discovered ${new Date().toISOString().slice(0, 10)} via discover.mjs. Wikidata ${c.qid}; ${c.links} Wikipedia(s)${c.nativeWiki ? `; native article ${c.nativeWiki}` : ''}${c.imdb ? `; IMDb ${c.imdb}` : ''}. Leads only: verify every field in research.`) } });
  log.push({ qid: id, title, queue: p.id });
}
writeFileSync(`${base}-added.json`, JSON.stringify(log, null, 1));
for (const l of log) console.log(l.queue ? `added   ${l.qid} ${l.title} → ${l.queue}` : `skip    ${l.qid}: ${l.skipped}`);
