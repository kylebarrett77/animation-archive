// Promote researched Queue items into Films, per the Validation Protocol.
// usage: node promote.mjs <batch.json> <session-number> [--dry]
import { readFileSync, writeFileSync } from 'fs';
const ROOT = '/Users/kyle/Code/animation-archive-site';
const S = '/private/tmp/claude-501/-Users-kyle-Code-animation-archive-site/9b89f780-96a4-44da-913a-41fb80904d78/scratchpad/';
const { getNotion, queryAll } = await import(`${ROOT}/scripts/lib/notion.js`);
const notion = getNotion();
const [file, sessionNo] = process.argv.slice(2);
const DRY = process.argv.includes('--dry');
const batch = JSON.parse(readFileSync(file, 'utf8'));
const ids = JSON.parse(readFileSync(S + 'entity-ids.json', 'utf8')); // {directors:{name:id}, studios:{name:id}, series:{queueTitle:id}}
const FILMS_DS = '54a05454-abf6-46c2-9e67-22f683e5e838';
const QUEUE_DB = 'd35eca46b6f444e09b842d4850017e0b';
const WATCH_DS = '081a1b55-8709-423d-8320-fb977b9819e0';
const today = new Date().toISOString().slice(0, 10);

// ---------- markdown (house style: <b>, <i>, tables, ---) -> Notion blocks
function richText(s) {
  const out = [];
  const re = /<(b|i)>(.*?)<\/\1>|\*\*(.+?)\*\*/gs;
  let last = 0, m;
  const push = (text, ann = {}) => { for (let i = 0; i < text.length; i += 1900) out.push({ type: 'text', text: { content: text.slice(i, i + 1900) }, annotations: ann }); };
  while ((m = re.exec(s))) {
    if (m.index > last) push(s.slice(last, m.index));
    if (m[3]) push(m[3], { bold: true });
    else push(m[2], m[1] === 'b' ? { bold: true } : { italic: true });
    last = re.lastIndex;
  }
  if (last < s.length) push(s.slice(last));
  return out.filter(t => t.text.content.length);
}
function blocks(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trimEnd();
    if (!l.trim()) continue;
    if (/^---+$/.test(l.trim())) { out.push({ object: 'block', type: 'divider', divider: {} }); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/);
    if (h) { const t = ['heading_1', 'heading_2', 'heading_3'][h[1].length - 1]; out.push({ object: 'block', type: t, [t]: { rich_text: richText(h[2]) } }); continue; }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) { rows.push(lines[i].trim()); i++; }
      i--;
      const cells = rows.filter(r => !/^\|\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      const width = Math.max(...cells.map(c => c.length));
      out.push({ object: 'block', type: 'table', table: { table_width: width, has_column_header: true, has_row_header: false,
        children: cells.map(c => ({ type: 'table_row', table_row: { cells: Array.from({ length: width }, (_, k) => richText(c[k] || '')) } })) } });
      continue;
    }
    const b = l.match(/^\s*[-*]\s+(.*)/);
    if (b) { out.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(b[1]) } }); continue; }
    out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(l) } });
  }
  return out;
}

// ---------- properties
const text = s => ({ rich_text: richText(String(s ?? '')) });
function props(f) {
  const p = f.properties;
  const rel = (names, map) => names.map(n => { const id = map[n]; if (!id) throw new Error(`no page id for "${n}"`); return { id }; });
  const o = {
    'Title (English)': { title: richText(p['Title (English)']) },
    'Original Title': text(p['Original Title'] || 'N/A'),
    'Romanized Title': text(p['Romanized Title'] || 'N/A'),
    'Alternate Titles': text(p['Alternate Titles'] || 'None'),
    Year: { number: Number(p.Year) },
    Country: { select: { name: p.Country } },
    Director: text(p.Director),
    Studio: text(p.Studio),
    Format: { select: { name: p.Format } },
    Runtime: text(p.Runtime),
    Technique: { multi_select: (p.Technique || []).map(name => ({ name })) },
    Color: { select: { name: p.Color } },
    Sound: { select: { name: p.Sound } },
    Genre: { multi_select: (p.Genre || []).map(name => ({ name })) },
    Keywords: { multi_select: (p.Keywords || []).slice(0, 5).map(name => ({ name })) },
    Synopsis: text(p.Synopsis),
    'Historical Context': text(p['Historical Context']),
    'Key Credits': text(p['Key Credits']),
    'Source Material': text(p['Source Material'] || 'N/A'),
    Notes: text(p.Notes),
    'Research Sources': text(p['Research Sources']),
    IMDB: { url: p.IMDB || null },
    Letterboxd: { url: p.Letterboxd && p.Letterboxd !== 'N/A' ? p.Letterboxd : null },
    Wikipedia: { url: p.Wikipedia && p.Wikipedia !== 'N/A' ? p.Wikipedia : null },
    Confidence: { select: { name: p.Confidence } },
    'Watch Status': { select: { name: 'Not Watched' } },
    'Has Subtitles': { checkbox: false },
    'Subtitle Source': text('N/A'),
    'Director (Link)': { relation: rel(f.directors, ids.directors) },
    'Studio (Link)': { relation: rel(f.studios, ids.studios) },
  };
  if (ids.series[f.queueTitle]) o['Series/Universe'] = { relation: [{ id: ids.series[f.queueTitle] }] };
  return o;
}

// ---------- duplicate re-check (protocol step 1) against live Films
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/^the /, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const live = await queryAll('9bdc62e48ffe43fda6b992248570c49f');
const liveNames = live.map(pg => ({ id: pg.id, year: pg.properties.Year?.number, names: ['Title (English)', 'Original Title', 'Romanized Title', 'Alternate Titles'].flatMap(k => (pg.properties[k]?.title || pg.properties[k]?.rich_text || []).map(t => t.plain_text).join('').split(/[;,|]/)).map(norm).filter(Boolean) }));
const queue = await queryAll(QUEUE_DB);

const { makeGuard } = await import(S + 'schema-guard.mjs');
const guard = await makeGuard(notion, [FILMS_DS, WATCH_DS]);
const log = [];
for (const f of batch.films) {
  const p = f.properties;
  const myNames = [p['Title (English)'], ...String(p['Alternate Titles'] || '').split(/[;,|/]/)].map(norm).filter(n => n.length > 2);
  const dup = liveNames.find(l => (!l.year || Math.abs(l.year - p.Year) <= 1) && l.names.some(n => myNames.includes(n)));
  if (dup) { log.push({ film: p['Title (English)'], skipped: `possible duplicate of Films page ${dup.id}` }); continue; }
  const q = queue.filter(x => (x.properties.Title?.title || []).map(t => t.plain_text).join('') === f.queueTitle);
  if (q.length !== 1) { log.push({ film: p['Title (English)'], skipped: `queue match count ${q.length}` }); continue; }
  try { guard(FILMS_DS, props(f), p['Title (English)']); for (const w0 of f.watchLinks || []) { const r = w0.region || w0.Region || ['US']; guard(WATCH_DS, { Platform: { select: { name: w0.platform || w0.Platform } }, 'Access Type': { select: { name: w0.accessType || w0['Access Type'] } }, Region: { multi_select: (Array.isArray(r) ? r : [r]).map(name => ({ name })) } }, p['Title (English)'] + ' watch link'); } }
  catch (e) { log.push({ film: p['Title (English)'], skipped: e.message }); continue; }
  if (DRY) { log.push({ film: p['Title (English)'], dry: true, blocks: blocks(f.content).length }); continue; }
  try {
    const all = blocks(f.content);
    const page = await notion.pages.create({ parent: { type: 'data_source_id', data_source_id: FILMS_DS }, icon: f.icon ? { type: 'emoji', emoji: f.icon } : undefined, properties: props(f), children: all.slice(0, 100) });
    for (let i = 100; i < all.length; i += 100) await notion.blocks.children.append({ block_id: page.id, children: all.slice(i, i + 100) });
    // Watch links found during research (protocol step 5)
    const wl = [];
    for (const w0 of f.watchLinks || []) {
      const w = { platform: w0.platform || w0.Platform, url: w0.url || w0.URL, accessType: w0.accessType || w0['Access Type'], region: w0.region || w0.Region, verified: w0.verified || w0.Verified };
      const r = await notion.pages.create({ parent: { type: 'data_source_id', data_source_id: WATCH_DS }, properties: {
        Label: { title: richText(`${w.platform} - ${p['Title (English)']}`) }, URL: { url: w.url }, Platform: { select: { name: w.platform } },
        'Access Type': { select: { name: w.accessType } }, 'Link Status': { select: { name: 'Unverified' } }, Completeness: { select: { name: 'Complete' } },
        Region: { multi_select: (Array.isArray(w.region) ? w.region : [w.region || 'US']).map(name => ({ name })) },
        Notes: text(`[${today} Added] Session ${sessionNo} validation. ${w.verified || ''}`.trim()), Film: { relation: [{ id: page.id }] } } });
      wl.push(r.id);
    }
    // Queue update in the same session (protocol step 6)
    const qp = q[0]; const notes = [...(qp.properties.Notes?.rich_text || [])];
    if (notes.length) notes.push({ type: 'text', text: { content: '\n' } });
    notes.push({ type: 'text', text: { content: `Validated ${today} Session ${sessionNo}. Films DB entry: ${page.id}` } });
    await notion.pages.update({ page_id: qp.id, properties: { Status: { select: { name: 'Validated' } }, 'Film DB Entry': { relation: [{ id: page.id }] }, 'Films DB Checked': { checkbox: true }, Notes: { rich_text: notes.slice(0, 100) } } });
    log.push({ film: p['Title (English)'], page: page.id, url: page.url, queue: qp.id, watchLinks: wl });
  } catch (e) { log.push({ film: p['Title (English)'], error: e.message }); }
}
writeFileSync(`${ROOT}/reports/promote-session${sessionNo}-${new Date().toISOString().replace(/[:.]/g, '-')}${DRY ? '-dry' : ''}.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
