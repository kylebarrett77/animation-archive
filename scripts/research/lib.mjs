/**
 * Shared library for the validation pipeline (brief → lint → promote → log).
 *
 * Everything that used to be checked by hand during Sessions 186–188 lives
 * here, so every step enforces it the same way:
 *   - live schema options (drafts can never invent select values)
 *   - entity resolution against live Directors/Studios, with fuzzy matching
 *     for romanization/macron/name-order variants (Ōbari ≈ Obari Masami)
 *   - duplicate detection against live Films (titles, alternates, original
 *     titles, director + year), per the Duplicate Prevention checklist
 *   - IMDb identity via Wikidata P345 first, TMDB second (TMDB mis-maps some
 *     IDs and lacks others)
 */
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { getNotion, queryAll } from '../lib/notion.js';
import { titleSimilarity } from '../lib/title-match.js';

export const DB = {
  films: '9bdc62e48ffe43fda6b992248570c49f',
  queue: 'd35eca46b6f444e09b842d4850017e0b',
  directors: '59f9c337c2ae490b9b59561129c911a0',
  studios: 'ae6d444ad0d847d49f7ff716642c5955',
  series: '6a5c2864815945bd8662a47c03bd649d',
  watch: 'e19f5cd9525446ca8e352f6b9121b3af',
  sessions: '157b71aed4894f70adf9e03f4d37d628',
};
export const DS = {
  films: '54a05454-abf6-46c2-9e67-22f683e5e838',
  queue: '7e926899-2915-4aa4-bbc1-f1b7f78e10a3',
  directors: '76bc715a-0e81-4956-bf5f-ad706efeea72',
  studios: 'bcf75e13-2857-410a-9aaf-1c240ce5fbe0',
  series: 'c40481db-dedf-441d-9131-2130ee76f9ea',
  watch: '081a1b55-8709-423d-8320-fb977b9819e0',
  sessions: '97313c25-5f6e-4498-a61d-58ad292febd1',
};
export const UA = 'GlobalAnimationArchive/1.0 (https://animationarchive.netlify.app)';
export const WORK_DIR = process.env.RESEARCH_DIR || 'reports/research';
export const today = () => new Date().toISOString().slice(0, 10);
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function loadEnv() {
  if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  mkdirSync(WORK_DIR, { recursive: true });
}

export const plain = p => (p?.title || p?.rich_text || []).map(t => t.plain_text).join('');

// ---------------------------------------------------------------- schema options
export async function schemaOptions() {
  const n = getNotion(); const out = {};
  for (const [name, id] of Object.entries(DS)) {
    const ds = await n.dataSources.retrieve({ data_source_id: id });
    out[name] = Object.fromEntries(Object.entries(ds.properties).filter(([, v]) => v.select || v.multi_select)
      .map(([k, v]) => [k, (v.select || v.multi_select).options.map(o => o.name)]));
  }
  return out;
}

// ---------------------------------------------------------------- name keys
const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Person/studio key tolerant of macrons, long-vowel spellings, punctuation and name order. */
export function nameKey(s) {
  const base = fold(String(s).replace(/\([^)]*\)/g, ' ')).replace(/ou|oo/g, 'o').replace(/uu/g, 'u').replace(/[^a-z0-9]+/g, ' ').trim();
  return base.split(' ').filter(Boolean).sort().join(' ');
}
const nativeOf = s => (String(s).match(/[぀-ヿ㐀-鿿가-힯]+/g) || []).join('');

// ---------------------------------------------------------------- entity index
export async function entityIndex() {
  const load = async (db) => (await queryAll(db)).map(p => ({ id: p.id, name: plain(p.properties.Name), native: plain(p.properties['Native Name']) }));
  const directors = await load(DB.directors), studios = await load(DB.studios);
  const build = list => {
    const exact = new Map(), fuzzy = new Map(), native = new Map();
    for (const e of list) {
      exact.set(e.name, e);
      const k = nameKey(e.name); fuzzy.set(k, [...(fuzzy.get(k) || []), e]);
      const nat = nativeOf(e.name) || nativeOf(e.native); if (nat) native.set(nat, [...(native.get(nat) || []), e]);
    }
    return { list, exact, fuzzy, native };
  };
  return { directors: build(directors), studios: build(studios) };
}
/** Resolve a name: {status: exact|variant|ambiguous|missing, entity?, candidates?} */
export function resolve(index, name) {
  if (index.exact.has(name)) return { status: 'exact', entity: index.exact.get(name) };
  const f = index.fuzzy.get(nameKey(name)) || [];
  const nat = nativeOf(name); const nm = nat ? index.native.get(nat) || [] : [];
  const cands = [...new Map([...f, ...nm].map(e => [e.id, e])).values()];
  if (cands.length === 1) return { status: 'variant', entity: cands[0] };
  if (cands.length > 1) return { status: 'ambiguous', candidates: cands };
  return { status: 'missing' };
}
/** Groups of entity pages that look like the same person/studio (for the merge list). */
export function duplicateEntities(index) {
  const groups = [];
  for (const list of [...index.fuzzy.values(), ...index.native.values()]) if (list.length > 1) groups.push(list.map(e => e.name));
  return [...new Map(groups.map(g => [g.slice().sort().join('|'), g])).values()];
}

// ---------------------------------------------------------------- films index + duplicate search
export async function filmsIndex() {
  return (await queryAll(DB.films)).map(p => {
    const pr = p.properties;
    const names = ['Title (English)', 'Original Title', 'Romanized Title'].map(k => plain(pr[k]))
      .concat(plain(pr['Alternate Titles']).split(/[;,|]/)).map(s => s.replace(/\([^)]*\)/g, ' ').trim()).filter(s => s && s !== 'N/A' && s !== 'None');
    return { id: p.id, title: plain(pr['Title (English)']), year: pr.Year?.number, format: pr.Format?.select?.name, director: plain(pr.Director), names };
  });
}
/** Candidate duplicates for a work: strength 'exact' (same name, year ±1), 'similar' (≥0.85), 'director-year'. */
export function findDuplicates(films, { titles, year, director }) {
  const mine = titles.map(s => String(s || '').replace(/\([^)]*\)/g, ' ').trim()).filter(s => s.length > 1);
  const dirKeys = new Set(String(director || '').split(/,|&|\band\b/).map(nameKey).filter(Boolean));
  const out = [];
  for (const f of films) {
    const gap = year && f.year ? Math.abs(f.year - year) : 0;
    if (gap > 5) continue;
    let best = 0; for (const a of mine) for (const b of f.names) best = Math.max(best, titleSimilarity(a, b));
    const sameDir = dirKeys.size && String(f.director || '').split(/,|&|\band\b/).map(nameKey).some(k => dirKeys.has(k));
    // Production vs release year often differ (Amazon Symphony: Queue 1951, Films 1953). Beyond ±1 year,
    // only an exact title or a near title by the same director counts; remakes further apart don't.
    if (gap > 1 && !(best >= 0.999 || (sameDir && best >= 0.85))) continue;
    const strength = best >= 0.999 ? 'exact' : best >= 0.85 ? 'similar' : (sameDir && year && f.year === year && best >= 0.3) ? 'director-year' : null;
    if (strength) out.push({ id: f.id, title: f.title, year: f.year, format: f.format, similarity: +best.toFixed(2), strength });
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}

// ---------------------------------------------------------------- identity checks
export async function wikidataByImdb(id) {
  const q = `SELECT ?i ?l ?a WHERE { ?i wdt:P345 "${id}". OPTIONAL{?i rdfs:label ?l FILTER(lang(?l)="en")} OPTIONAL{?a schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} }`;
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const b = (await r.json()).results.bindings;
  return b.map(x => ({ qid: x.i.value.split('/').pop(), label: x.l?.value, enwiki: x.a?.value }));
}
export async function wikipediaSummary(url) {
  if (!url || url === 'N/A') return null;
  const m = url.match(/^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/); if (!m) return { error: 'not a wikipedia URL' };
  const r = await fetch(`https://${m[1]}.wikipedia.org/api/rest_v1/page/summary/${m[2]}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const j = await r.json(); return { type: j.type, title: j.title, description: j.description };
}

/** Queue items a draft film refers to: by queueId when given (same-titled Queue items exist), else by exact queueTitle. */
export const queueMatches = (queue, f) => {
  const key = id => String(id || '').replace(/-/g, '');
  return f.queueId ? queue.filter(q => key(q.id) === key(f.queueId)) : queue.filter(q => q.title === f.queueTitle);
};
