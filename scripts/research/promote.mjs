#!/usr/bin/env node
/**
 * promote.mjs — enter a linted research draft into Notion (Validation Protocol steps 3–6).
 *   node scripts/research/promote.mjs <draft.json> --session <N> [--dry]
 *
 * 1. Lints the whole draft first; any error aborts before a single write.
 * 2. Creates missing entity pages (from draft.entities) and links each new
 *    director to the studios they share films with in this draft.
 * 3. Per film: creates the Films page (or resumes one a failed run created),
 *    adds watch links (Unverified), links any existing series, then updates
 *    the Queue item (Validated + Film DB Entry + note) in the same pass.
 * 4. Creates batch-level series entries linking new and existing films.
 * Re-running after a failure is safe: finished films are skipped, and a page
 * created without its Queue update is picked up and completed.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { getNotion, queryAll } from '../lib/notion.js';
import { loadEnv, DB, DS, WORK_DIR, plain, today, stamp, schemaOptions, entityIndex, resolve, filmsIndex, queueMatches } from './lib.mjs';
import { lint } from './lint.mjs';

loadEnv();
const args = process.argv.slice(2);
const file = args[0]; const session = args[args.indexOf('--session') + 1]; const DRY = args.includes('--dry');
if (!file || !args.includes('--session')) { console.error('usage: promote.mjs <draft.json> --session <N> [--dry]'); process.exit(2); }
const draft = JSON.parse(readFileSync(file, 'utf8'));
const n = getNotion();

// ---------- markdown (house style) → blocks
function richText(s) {
  const out = []; const re = /<(b|i)>(.*?)<\/\1>|\*\*(.+?)\*\*/gs; let last = 0, m;
  const push = (t, ann = {}) => { for (let i = 0; i < t.length; i += 1900) out.push({ type: 'text', text: { content: t.slice(i, i + 1900) }, annotations: ann }); };
  while ((m = re.exec(s))) { if (m.index > last) push(s.slice(last, m.index)); if (m[3]) push(m[3], { bold: true }); else push(m[2], m[1] === 'b' ? { bold: true } : { italic: true }); last = re.lastIndex; }
  if (last < s.length) push(s.slice(last)); return out.filter(t => t.text.content.length);
}
function blocks(md) {
  const L = String(md).replace(/\r/g, '').split('\n'); const out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i].trimEnd(); if (!l.trim()) continue;
    if (/^---+$/.test(l.trim())) { out.push({ object: 'block', type: 'divider', divider: {} }); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/); if (h) { const t = ['heading_1', 'heading_2', 'heading_3'][h[1].length - 1]; out.push({ object: 'block', type: t, [t]: { rich_text: richText(h[2]) } }); continue; }
    if (/^\|/.test(l)) { const rows = []; while (i < L.length && /^\|/.test(L[i].trim())) rows.push(L[i++].trim()); i--;
      const cells = rows.filter(r => !/^\|\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())); const wd = Math.max(...cells.map(c => c.length));
      out.push({ object: 'block', type: 'table', table: { table_width: wd, has_column_header: true, has_row_header: false, children: cells.map(c => ({ type: 'table_row', table_row: { cells: Array.from({ length: wd }, (_, k) => richText(c[k] || '')) } })) } }); continue; }
    const b = l.match(/^\s*[-*]\s+(.*)/); if (b) { out.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(b[1]) } }); continue; }
    out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(l) } });
  }
  return out;
}
const text = s => ({ rich_text: richText(String(s ?? '')) });
const url = v => ({ url: v && v !== 'N/A' ? v : null });
const num = v => ({ number: typeof v === 'number' ? v : null });
const ms = a => ({ multi_select: [].concat(a || []).filter(Boolean).map(name => ({ name })) });

// ---------- 1. lint everything first
const ctx = { schema: await schemaOptions(), ents: await entityIndex(), films: await filmsIndex(),
  queue: (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), linked: (p.properties['Film DB Entry']?.relation || []).length, notes: p.properties.Notes?.rich_text || [] })) };
const cannotFind = f => /^\s*CANNOT FIND:/i.test(f.conflicts || '');   // research could not verify the work: route to Queue status Cannot Find
const inProduction = f => /^\s*IN PRODUCTION:/i.test(f.conflicts || '');   // announced but not released: Queue status In Production (release tracking)
const duplicateOf = f => (String(f.conflicts || '').match(/^\s*DUPLICATE OF:\s*([^\n]+)/i) || [])[1] || null;   // already in Films (e.g. an episode of a series entry): route to Queue status Duplicate
const pending = draft.films.filter(f => !cannotFind(f) && !duplicateOf(f) && !inProduction(f) && !queueMatches(ctx.queue, f).some(q => q.linked));   // resumable: skip finished films
// Entities this pipeline already created (earlier run of this draft, or a parallel batch) are linked, not re-created.
// Only exact-name pages whose id appears in a promote log qualify; hand-made pages and variants still fail lint.
const pipelineIds = new Set(existsSync(WORK_DIR) ? readdirSync(WORK_DIR).filter(f => /^promote-session.*\.json$/.test(f) && !f.includes('-dry'))
  .flatMap(f => { try { return (JSON.parse(readFileSync(`${WORK_DIR}/${f}`, 'utf8')).entities || []).map(e => e.id); } catch { return []; } }) : []);
const reused = [];
for (const kind of ['directors', 'studios']) if (draft.entities?.[kind]) draft.entities[kind] = draft.entities[kind].filter(e => {
  const r = resolve(ctx.ents[kind], e.Name);
  if (r.status === 'exact' && r.entity.name === e.Name && pipelineIds.has(r.entity.id)) { reused.push({ [kind.slice(0, -1)]: e.Name, id: r.entity.id, reused: true }); return false; }
  return true; });
if (reused.length) console.log(reused.map(r => `reuse   ${r.director || r.studio} → ${r.id} (created by an earlier pipeline run)`).join('\n'));
const { errors, warnings } = await lint({ ...draft, films: pending }, ctx);
const resumeOnly = errors.length && errors.every(e => /possible duplicate of Films/.test(e));
if (errors.length && !resumeOnly) { console.log(errors.map(e => `ERROR  ${e}`).join('\n')); console.log('Aborted: fix the draft (lint.mjs) and re-run. Nothing was written.'); process.exit(1); }
const log = { session, file, started: new Date().toISOString(), warnings, entities: [], reusedEntities: reused, films: [], series: [] };
// Save the log after every write, so a run that crashes midway still records what it created
// (resume relies on the log to recognise its own entities).
const out = `${WORK_DIR}/promote-session${session}-${stamp()}${DRY ? '-dry' : ''}.json`;
const save = () => { mkdirSync(WORK_DIR, { recursive: true }); writeFileSync(out, JSON.stringify(log, null, 1)); };
for (const k of ['entities', 'films', 'series']) log[k].push = function (...a) { const r = Array.prototype.push.apply(this, a); if (!DRY) save(); return r; };

// ---------- 2. entities
const idOf = (kind, name) => { const r = resolve(ctx.ents[kind], name); return r.entity?.id || created[kind][name]; };
const created = { directors: {}, studios: {} };
if (!DRY) {
  for (const e of draft.entities?.studios || []) {
    const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.studios }, properties: {
      Name: { title: richText(e.Name) }, Country: { select: { name: e.Country } }, Founded: num(e.Founded), Closed: num(e.Closed), Active: { checkbox: !!e.Active },
      Type: { select: { name: e.Type } }, Significance: text(`${e.Significance}${e.sources?.length ? ` (Sources: ${e.sources.map(s => s.name).join(', ')})` : ''}`),
      'Notable Techniques': ms(e['Notable Techniques']), Website: url(e.Website), Wikipedia: url(e.Wikipedia) } });
    created.studios[e.Name] = p.id; log.entities.push({ studio: e.Name, id: p.id });
  }
  for (const e of draft.entities?.directors || []) {
    const shared = [...new Set(draft.films.filter(f => (f.directors || []).includes(e.Name)).flatMap(f => f.studios || []))].map(s => idOf('studios', s)).filter(Boolean);
    const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.directors }, properties: {
      Name: { title: richText(e.Name) }, 'Native Name': text(e['Native Name'] || 'N/A'), Nationality: { select: { name: e.Nationality } },
      'Birth Year': num(e['Birth Year']), 'Death Year': num(e['Death Year']), Bio: text(e.Bio), Significance: text(`${e.Significance}${e.sources?.length ? ` (Sources: ${e.sources.map(s => s.name).join(', ')})` : ''}`),
      'Signature Style': text(e['Signature Style']), Awards: text(e.Awards || 'N/A'), 'Primary Technique': ms(e['Primary Technique']),
      IMDB: url(e.IMDb || e.IMDB), Wikipedia: url(e.Wikipedia), Studios: { relation: shared.map(id => ({ id })) } } });
    created.directors[e.Name] = p.id; log.entities.push({ director: e.Name, id: p.id, studios: shared.length });
  }
}

// ---------- 3. films
const seriesList = (await queryAll(DB.series)).map(p => ({ id: p.id, name: plain(p.properties.Name) }));
const liveFilms = await queryAll(DB.films);
const linkedFromQueue = new Set((await queryAll(DB.queue)).flatMap(p => (p.properties['Film DB Entry']?.relation || []).map(r => r.id)));
const pageFor = {};
for (const f of draft.films) {
  const p = f.properties; const q = queueMatches(ctx.queue, f)[0];
  if (q.linked) { log.films.push({ film: p['Title (English)'], skipped: 'already promoted' }); continue; }
  if (inProduction(f)) {
    if (DRY) { log.films.push({ film: f.queueTitle, dry: 'would set Queue to In Production' }); continue; }
    const live = await n.pages.retrieve({ page_id: q.id }); const st = live.properties.Status?.select?.name;
    if (st !== 'New' && st !== 'Validated') { log.films.push({ film: f.queueTitle, skipped: `In Production not applied: Queue status is ${st}` }); continue; }
    const notes = [...(live.properties.Notes?.rich_text || [])]; if (notes.length) notes.push({ type: 'text', text: { content: '\n' } });
    notes.push({ type: 'text', text: { content: `In Production (not yet released), Session ${session}. ${String(f.conflicts).replace(/^\s*IN PRODUCTION:\s*/i, '').slice(0, 1700)}` } });
    await n.pages.update({ page_id: q.id, properties: { Status: { select: { name: 'In Production' } }, 'Release Status': { select: { name: 'Announced' } }, Notes: { rich_text: notes.slice(0, 100) } } });
    log.films.push({ film: f.queueTitle, inProduction: true, queue: q.id, before: st }); continue;
  }
  if (duplicateOf(f)) {
    if (DRY) { log.films.push({ film: f.queueTitle, dry: 'would set Queue to Duplicate' }); continue; }
    const live = await n.pages.retrieve({ page_id: q.id }); const st = live.properties.Status?.select?.name;
    if (st !== 'New' && st !== 'Validated') { log.films.push({ film: f.queueTitle, skipped: `Duplicate not applied: Queue status is ${st}` }); continue; }
    const notes = [...(live.properties.Notes?.rich_text || [])]; if (notes.length) notes.push({ type: 'text', text: { content: '\n' } });
    notes.push({ type: 'text', text: { content: `DUPLICATE of existing Films entry ${duplicateOf(f).slice(0, 1500)}. Session ${session}.` } });
    await n.pages.update({ page_id: q.id, properties: { Status: { select: { name: 'Duplicate' } }, Notes: { rich_text: notes.slice(0, 100) } } });
    log.films.push({ film: f.queueTitle, duplicate: true, queue: q.id, before: st }); continue;
  }
  if (cannotFind(f)) {
    if (DRY) { log.films.push({ film: p['Title (English)'] || f.queueTitle, dry: 'would set Queue to Cannot Find' }); continue; }
    const live = await n.pages.retrieve({ page_id: q.id }); const st = live.properties.Status?.select?.name;
    if (st !== 'New' && st !== 'Validated') { log.films.push({ film: f.queueTitle, skipped: `Cannot Find not applied: Queue status is ${st}` }); continue; }
    const notes = [...(live.properties.Notes?.rich_text || [])]; if (notes.length) notes.push({ type: 'text', text: { content: '\n' } });
    notes.push({ type: 'text', text: { content: `Cannot Find, Session ${session}. ${String(f.conflicts).replace(/^\s*CANNOT FIND:\s*/i, '').slice(0, 1700)}` } });
    await n.pages.update({ page_id: q.id, properties: { Status: { select: { name: 'Cannot Find' } }, Notes: { rich_text: notes.slice(0, 100) } } });
    log.films.push({ film: f.queueTitle, cannotFind: true, queue: q.id, before: st }); continue;
  }
  // resume: an orphan page with the same title + year that no Queue item links to
  const orphan = liveFilms.find(pg => plain(pg.properties['Title (English)']) === p['Title (English)'] && pg.properties.Year?.number === p.Year && !linkedFromQueue.has(pg.id));
  if (!orphan && resumeOnly && errors.some(e => e.startsWith(f.queueTitle + ':'))) { log.films.push({ film: p['Title (English)'], skipped: 'duplicate (not an orphan to resume)' }); continue; }
  if (DRY) { log.films.push({ film: p['Title (English)'], dry: orphan ? 'would resume orphan page' : 'would create', blocks: blocks(f.content).length }); continue; }
  try {
    let page = orphan; let iconFallback = false;
    if (!page) {
      const props = {
        'Title (English)': { title: richText(p['Title (English)']) }, 'Original Title': text(p['Original Title'] || 'N/A'), 'Romanized Title': text(p['Romanized Title'] || 'N/A'),
        'Alternate Titles': text(p['Alternate Titles'] || 'None'), Year: num(p.Year), Country: { select: { name: p.Country } }, Director: text(p.Director), Studio: text(p.Studio),
        Format: { select: { name: p.Format } }, Runtime: text(p.Runtime), Technique: ms(p.Technique), Color: { select: { name: p.Color } }, Sound: { select: { name: p.Sound } },
        Genre: ms(p.Genre), Keywords: ms((p.Keywords || []).slice(0, 5)), Synopsis: text(p.Synopsis), 'Historical Context': text(p['Historical Context']), 'Key Credits': text(p['Key Credits']),
        'Source Material': text(p['Source Material'] || 'N/A'), Notes: text(p.Notes), 'Research Sources': text(p['Research Sources']), IMDB: url(p.IMDB), Letterboxd: url(p.Letterboxd),
        Wikipedia: url(p.Wikipedia), Confidence: { select: { name: p.Confidence } }, 'Watch Status': { select: { name: 'Not Watched' } }, 'Has Subtitles': { checkbox: false }, 'Subtitle Source': text('N/A'),
        'Director (Link)': { relation: (f.directors || []).map(d => ({ id: idOf('directors', d) })) }, 'Studio (Link)': { relation: (f.studios || []).map(s => ({ id: idOf('studios', s) })) },
      };
      const ser = f.series && seriesList.find(s => s.name === f.series); if (ser) props['Series/Universe'] = { relation: [{ id: ser.id }] };
      const all = blocks(f.content);
      const createWith = icon => n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.films }, icon: icon ? { type: 'emoji', emoji: icon } : undefined, properties: props, children: all.slice(0, 100) });
      try { page = await createWith(f.icon); }
      catch (e) { if (!/body\.icon/.test(e.message)) throw e; page = await createWith('🎬'); iconFallback = true; }   // Notion's emoji list lags Unicode
      for (let i = 100; i < all.length; i += 100) await n.blocks.children.append({ block_id: page.id, children: all.slice(i, i + 100) });
    }
    const existingLinks = orphan ? (orphan.properties['Watch Links (Linked)']?.relation || []).length : 0;
    const wl = [];
    if (!existingLinks) for (const w of f.watchLinks || []) {
      const r = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.watch }, properties: {
        Label: { title: richText(`${w.platform} - ${p['Title (English)']}`) }, URL: { url: w.url }, Platform: { select: { name: w.platform } }, 'Access Type': { select: { name: w.accessType } },
        'Link Status': { select: { name: 'Unverified' } }, Completeness: { select: { name: 'Complete' } }, Region: ms(w.region),
        Notes: text(`[${today()} Added] Session ${session} validation. ${typeof w.verified === 'string' ? w.verified : ''}`.trim()), Film: { relation: [{ id: page.id }] } } });
      wl.push(r.id);
    }
    const notes = [...q.notes]; if (notes.length) notes.push({ type: 'text', text: { content: '\n' } });
    notes.push({ type: 'text', text: { content: `Validated ${today()} Session ${session}. Films DB entry: ${page.id}` } });
    await n.pages.update({ page_id: q.id, properties: { Status: { select: { name: 'Validated' } }, 'Film DB Entry': { relation: [{ id: page.id }] }, 'Films DB Checked': { checkbox: true }, Notes: { rich_text: notes.slice(0, 100) } } });
    pageFor[f.queueTitle] = page.id; pageFor[p['Title (English)']] = page.id;
    log.films.push({ film: p['Title (English)'], year: p.Year, page: page.id, queue: q.id, watchLinks: wl, resumed: !!orphan, directors: f.directors, studios: f.studios, confidence: p.Confidence, ...(iconFallback ? { iconFallback: `${f.icon} rejected by Notion, used 🎬` } : {}), note: (f.conflicts || '').slice(0, 300) });
  } catch (e) { log.films.push({ film: p['Title (English)'], error: e.message }); }
}

// ---------- 4. batch-level series
if (!DRY) for (const s of draft.series || []) {
  if (seriesList.find(x => x.name === s.Name)) { log.series.push({ series: s.Name, skipped: 'exists' }); continue; }
  const filmIds = (s.films || []).map(t => pageFor[t] || liveFilms.find(pg => plain(pg.properties['Title (English)']) === t)?.id).filter(Boolean);
  const studioIds = [...new Set(draft.films.filter(f => (s.films || []).includes(f.queueTitle)).flatMap(f => f.studios || []))].map(x => idOf('studios', x)).filter(Boolean);
  const r = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.series }, properties: {
    Name: { title: richText(s.Name) }, Type: { select: { name: s.Type } }, Country: { select: { name: s.Country } }, Description: text(s.Description), 'Years Active': text(s['Years Active']),
    'Total Entries': num(s['Total Entries']), 'Watch Order': text(s['Watch Order']), Films: { relation: filmIds.map(id => ({ id })) }, Studio: { relation: studioIds.map(id => ({ id })) } } });
  log.series.push({ series: s.Name, id: r.id, films: filmIds.length });
}

save();
for (const f of log.films) console.log(f.error ? `FAILED  ${f.film}: ${f.error}` : f.cannotFind ? `cannot  ${f.film}: Queue → Cannot Find` : f.duplicate ? `dup     ${f.film}: Queue → Duplicate` : f.inProduction ? `inprod  ${f.film}: Queue → In Production` : f.skipped ? `skip    ${f.film}: ${f.skipped}` : f.dry ? `dry     ${f.film}: ${f.dry}` : `${f.resumed ? 'resumed' : 'created'} ${f.film} → ${f.page}${f.watchLinks.length ? ` (+${f.watchLinks.length} watch link)` : ''}`);
for (const e of log.entities) console.log(`entity  ${e.director || e.studio} → ${e.id}`);
for (const s of log.series) console.log(`series  ${s.series} ${s.id ? '→ ' + s.id : s.skipped}`);
if (warnings.length) console.log(`${warnings.length} lint warning(s) recorded in ${out}`);
console.log(`Log: ${out}`);
if (log.films.some(f => f.error)) { console.log('Some films failed; fix the cause and re-run the same command to resume.'); process.exit(1); }
