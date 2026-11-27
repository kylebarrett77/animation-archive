#!/usr/bin/env node
/**
 * lint.mjs — validate a research draft before anything touches Notion.
 *   node scripts/research/lint.mjs <draft.json> [--quiet]
 * Exit 0 and "LINT PASSED" when there are no errors. promote.mjs runs the
 * same checks and refuses to write if any fail.
 */
import { readFileSync } from 'fs';
import { queryAll } from '../lib/notion.js';
import { titleSimilarity } from '../lib/title-match.js';
import { tmdbFindImdb, hasTmdb } from '../lib/tmdb.js';
import { loadEnv, DB, plain, schemaOptions, entityIndex, resolve, filmsIndex, findDuplicates, wikidataByImdb, wikipediaSummary } from './lib.mjs';

export async function lint(draft, ctx = {}) {
  const schema = ctx.schema || await schemaOptions();
  const ents = ctx.ents || await entityIndex();
  const films = ctx.films || await filmsIndex();
  const queue = ctx.queue || (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), linked: (p.properties['Film DB Entry']?.relation || []).length }));
  const errors = [], warnings = [];
  const E = (w, m) => errors.push(`${w}: ${m}`), W = (w, m) => warnings.push(`${w}: ${m}`);
  const inSet = (where, label, vals, allowed) => { for (const v of [].concat(vals ?? [])) if (v !== null && v !== '' && !allowed.includes(v)) E(where, `${label} "${v}" is not an allowed value`); };
  if (!Array.isArray(draft.films)) { E('draft', 'missing "films" array'); return { errors, warnings }; }
  const newDirs = new Set((draft.entities?.directors || []).map(e => e.Name)), newStudios = new Set((draft.entities?.studios || []).map(e => e.Name));
  const REQ = ['Title (English)', 'Year', 'Country', 'Director', 'Studio', 'Format', 'Runtime', 'Technique', 'Color', 'Sound', 'Synopsis', 'Historical Context', 'Key Credits', 'Notes', 'Research Sources', 'IMDB', 'Wikipedia', 'Confidence', 'Alternate Titles'];
  for (const f of draft.films) {
    const p = f.properties || {}; const w = f.queueTitle || p['Title (English)'] || '(untitled)';
    // queue
    const q = queue.filter(x => x.title === f.queueTitle);
    if (q.length !== 1) E(w, `queueTitle must match exactly one Queue item (matched ${q.length})`);
    else if (q[0].linked) E(w, 'Queue item is already linked to a Films entry');
    // fields
    for (const k of REQ) if (p[k] === undefined || p[k] === null || p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) E(w, `missing ${k}`);
    if (typeof p.Year !== 'number') E(w, 'Year must be a number');
    inSet(w, 'Country', p.Country, schema.films.Country); inSet(w, 'Format', p.Format, schema.films.Format);
    inSet(w, 'Color', p.Color, schema.films.Color); inSet(w, 'Sound', p.Sound, schema.films.Sound);
    inSet(w, 'Confidence', p.Confidence, schema.films.Confidence); inSet(w, 'Technique', p.Technique, schema.films.Technique);
    inSet(w, 'Genre', p.Genre, schema.films.Genre); inSet(w, 'Keyword', p.Keywords, schema.films.Keywords);
    if ((p.Keywords || []).length > 5) E(w, 'more than 5 Keywords');
    // entities
    for (const [kind, names, idx, created] of [['director', f.directors || [], ents.directors, newDirs], ['studio', f.studios || [], ents.studios, newStudios]]) {
      if (!names.length) E(w, `no ${kind}s to link`);
      for (const n of names) {
        if (created.has(n)) continue;
        const r = resolve(idx, n);
        if (r.status === 'missing') E(w, `${kind} "${n}" does not exist; add it to entities.${kind}s (3+ sources) or drop the link`);
        else if (r.status === 'ambiguous') E(w, `${kind} "${n}" matches several pages: ${r.candidates.map(c => c.name).join(' | ')}; use one exact name`);
        else if (r.status === 'variant') W(w, `${kind} "${n}" will link to existing page "${r.entity.name}" (spelling variant)`);
      }
    }
    // sources and content
    const srcs = (f.sources || []).filter(s => s && s.url);
    if (srcs.length < 3) E(w, `only ${srcs.length} sources with URLs (need 3+)`);
    const c = String(f.content || '');
    for (const h of ['Overview', 'Synopsis', 'Production', 'Analysis', 'Historical Context']) if (!new RegExp(`^##\\s+${h}`, 'm').test(c)) W(w, `content has no "## ${h}" section`);
    if (c.split(/\s+/).length < 400) W(w, `content is short (${c.split(/\s+/).length} words)`);
    // identity: IMDb
    const tt = (String(p.IMDB || '').match(/tt\d{6,10}/) || [])[0];
    const names = [p['Title (English)'], p['Original Title'], p['Romanized Title'], ...String(p['Alternate Titles'] || '').split(/[;,|]/)].filter(Boolean);
    const sim = t => Math.max(0, ...names.map(n => titleSimilarity(n, t || '')));
    if (tt) {
      const wd = await wikidataByImdb(tt).catch(() => null);
      if (wd && wd.length) { if (Math.max(...wd.map(x => sim(x.label))) < 0.5) W(w, `IMDb ${tt} is Wikidata ${wd[0].qid} "${wd[0].label}", which does not resemble the title; double-check`); }
      else if (hasTmdb()) {
        const t = await tmdbFindImdb(tt).catch(() => null);
        if (!t) E(w, `IMDb ${tt} not found on Wikidata or TMDB; confirm or use N/A`);
        else if (sim(t.title) < 0.5 && sim(t.original) < 0.5) E(w, `IMDb ${tt} resolves (TMDB) to "${t.title}" (${t.year}), not this work`);
        else if (t.year && Math.abs(t.year - p.Year) > 1) W(w, `IMDb ${tt} year on TMDB is ${t.year}`);
        else W(w, `IMDb ${tt} confirmed by TMDB only (not on Wikidata)`);
      } else W(w, `IMDb ${tt} not on Wikidata and TMDB unavailable`);
    } else if (p.IMDB && p.IMDB !== 'N/A') E(w, `IMDB "${p.IMDB}" is not a title URL; use a tt-ID URL or N/A`);
    // identity: Wikipedia
    if (p.Wikipedia && p.Wikipedia !== 'N/A') {
      const s = await wikipediaSummary(p.Wikipedia).catch(e => ({ error: e.message }));
      if (!s || s.error) E(w, `Wikipedia URL does not resolve (${s?.error})`);
      else if (s.type === 'disambiguation') E(w, 'Wikipedia URL is a disambiguation page');
      else if (sim(s.title.replace(/\s*\([^)]*\)$/, '')) < 0.5) W(w, `Wikipedia article "${s.title}" does not resemble the title`);
    }
    if (p.Letterboxd && p.Letterboxd !== 'N/A' && !/^https:\/\/letterboxd\.com\/film\/[^/]+\/?$/.test(p.Letterboxd)) E(w, 'Letterboxd must be https://letterboxd.com/film/<slug>/ or N/A');
    // duplicates
    const d = findDuplicates(films, { titles: names, year: p.Year, director: p.Director }).filter(x => x.strength !== 'director-year');
    for (const x of d) (/(different|distinct|separate|not the same)/i.test(f.conflicts || '') ? W : E)(w, `possible duplicate of Films "${x.title}" (${x.year}, ${x.format}) [${x.strength} ${x.similarity}]${/(different|distinct|separate)/i.test(f.conflicts || '') ? ' (explained in conflicts)' : ': explain in conflicts if it is a different work'}`);
    // watch links
    for (const l of f.watchLinks || []) {
      inSet(w, 'watch platform', l.platform, schema.watch.Platform); inSet(w, 'watch accessType', l.accessType, schema.watch['Access Type']);
      if (!Array.isArray(l.region)) E(w, 'watch region must be an array'); else inSet(w, 'watch region', l.region, schema.watch.Region);
      if (!/^https?:\/\//.test(l.url || '')) E(w, 'watch link url missing');
    }
    if (f.series && typeof f.series !== 'string') E(w, '"series" must be an existing Series name or null');
  }
  for (const e of draft.entities?.directors || []) {
    const w = `entity ${e.Name}`; if ((e.sources || []).length < 3) E(w, 'fewer than 3 sources; keep this person in text only');
    inSet(w, 'Nationality', e.Nationality, schema.directors.Nationality); inSet(w, 'Primary Technique', e['Primary Technique'], schema.directors['Primary Technique']);
    const r = resolve(ents.directors, e.Name); if (r.status !== 'missing') E(w, `already exists as "${r.entity?.name || r.candidates.map(c => c.name).join('|')}"; link that instead`);
  }
  for (const e of draft.entities?.studios || []) {
    const w = `entity ${e.Name}`; if ((e.sources || []).length < 3) E(w, 'fewer than 3 sources');
    inSet(w, 'Country', e.Country, schema.studios.Country); inSet(w, 'Type', e.Type, schema.studios.Type); inSet(w, 'Notable Techniques', e['Notable Techniques'], schema.studios['Notable Techniques']);
    const r = resolve(ents.studios, e.Name); if (r.status !== 'missing') E(w, `already exists as "${r.entity?.name || r.candidates.map(c => c.name).join('|')}"; link that instead`);
  }
  return { errors, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const file = process.argv[2]; if (!file) { console.error('usage: lint.mjs <draft.json>'); process.exit(2); }
  let draft; try { draft = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`ERROR: draft is not valid JSON: ${e.message}`); process.exit(1); }
  const { errors, warnings } = await lint(draft);
  for (const e of errors) console.log(`ERROR  ${e}`);
  if (!process.argv.includes('--quiet')) for (const w of warnings) console.log(`warn   ${w}`);
  console.log(errors.length ? `LINT FAILED: ${errors.length} error(s), ${warnings.length} warning(s)` : `LINT PASSED (${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
