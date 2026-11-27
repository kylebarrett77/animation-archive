#!/usr/bin/env node
/**
 * brief.mjs — pre-check a batch of Queue items and write the research brief.
 *
 *   node scripts/research/brief.mjs --next 10            # next items from the promotion backlog
 *   node scripts/research/brief.mjs "Title A" "Title B"  # specific Queue titles
 *   options: --status Validated|New  --split 5  --batch NAME
 *
 * Writes <RESEARCH_DIR>/<batch>/precheck.json, brief-<n>.md (one per agent)
 * and prints the pre-check: duplicate candidates (exact/similar/director+year)
 * and entity resolution (exact / variant of an existing page / missing).
 * Items with an exact or similar duplicate are held out of the briefs.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { queryAll } from '../lib/notion.js';
import { loadEnv, DB, WORK_DIR, plain, schemaOptions, entityIndex, resolve, filmsIndex, findDuplicates, stamp } from './lib.mjs';

loadEnv();
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--next', 0)); const status = opt('--status', 'Validated'); const split = Number(opt('--split', 5));
const batch = opt('--batch', `batch-${stamp()}`);
const titles = args.filter((a, i) => !a.startsWith('--') && !['--next', '--status', '--split', '--batch'].includes(args[i - 1]));

const PRIO = { High: 0, Medium: 1, Low: 2 };
const queue = (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), status: p.properties.Status?.select?.name, prio: p.properties.Priority?.select?.name,
  year: p.properties.Year?.number, country: p.properties.Country?.select?.name, format: p.properties.Format?.select?.name, director: plain(p.properties.Director),
  orig: plain(p.properties['Original Title']), notes: plain(p.properties['Research Notes']), src: plain(p.properties['Source Found']), linked: (p.properties['Film DB Entry']?.relation || []).length }));
let picks;
if (titles.length) picks = titles.map(t => { const m = queue.filter(q => q.title === t); if (m.length !== 1) throw new Error(`Queue title "${t}" matched ${m.length}`); return m[0]; });
else picks = queue.filter(q => q.status === status && !q.linked && !/session 46/i.test(q.src))   // Session 46 import is flagged unreliable
  .sort((a, b) => (PRIO[a.prio] ?? 3) - (PRIO[b.prio] ?? 3) || (a.year || 0) - (b.year || 0)).slice(0, N);

const [films, ents, schema] = await Promise.all([filmsIndex(), entityIndex(), schemaOptions()]);
const pre = picks.map(q => {
  const yearInTitle = Number((q.title.match(/\((\d{4})\)/) || [])[1]) || null;
  const dups = findDuplicates(films, { titles: [q.title, q.orig !== 'N/A' ? q.orig : ''], year: q.year || yearInTitle, director: q.director });
  const people = q.director.split(/,|&|\band\b/).map(s => s.replace(/\([^)]*\)/g, '').trim()).filter(s => s && !/unknown|various/i.test(s));
  return { queue: q, duplicates: dups, directors: people.map(n => ({ name: n, ...resolve(ents.directors, n) })) };
});
const held = pre.filter(p => p.duplicates.some(d => d.strength !== 'director-year'));
const ok = pre.filter(p => !held.includes(p));

const dir = `${WORK_DIR}/${batch}`; mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/precheck.json`, JSON.stringify(pre, null, 1));

// ---- brief(s)
const knownDirectors = [...new Set(ok.flatMap(p => p.directors.filter(d => d.entity).map(d => d.entity.name)))];
const opts = k => schema.films[k].join(', ');
const groups = []; for (let i = 0; i < ok.length; i += split) groups.push(ok.slice(i, i + split));
groups.forEach((g, gi) => {
  const out = `${dir}/draft-${gi + 1}.json`;
  const md = `Research ${g.length} animated works as DRAFT Films entries for a curated animation archive (Notion), following its Validation Protocol. Do NOT write to Notion. Write only the draft JSON, then run the linter (below) and fix every error before you finish. Use WebSearch (load with ToolSearch "select:WebSearch") and WebFetch.

**Works** (use these EXACT strings as "queueTitle"):
${g.map((p, i) => `${i + 1}. "${p.queue.title}". Queue notes: ${p.queue.year || '?'} · ${p.queue.country || '?'} · ${p.queue.format || '?'} · dir. ${p.queue.director || '?'}. ${p.queue.notes.slice(0, 220)}${p.duplicates.length ? ` ⚠ Related Films entry exists: ${p.duplicates.map(d => `${d.title} (${d.year}, ${d.format})`).join('; ')}. Confirm this is a DIFFERENT work and say why in "conflicts".` : ''}`).join('\n')}

**Research rules:**
- 3+ independent sources per work. Native-language sources first for non-English works (ja.wikipedia, ANN encyclopedia, allcinema; Baidu/Douban for China; national film databases). English: Wikipedia, BCDB, Letterboxd, Cartoon Research. Fan wikis support only.
- Verify the year, format, episode count, runtime and director across 2+ sources.
- Never invent URLs.
  - IMDb: tt-IDs confirmed via Wikidata P345 or a Wikipedia external link (IMDb blocks fetches). Use "N/A" if IMDb has no entry for the work itself; note any episode-only IDs in Notes.
  - Wikipedia: the work's own article (English, else ja.wikipedia, else "N/A").
  - Letterboxd: only if the page exists, else "N/A".
- Fill Alternate Titles (include native-script titles and romanization) to prevent future duplicates.

**Entities.** Existing pages you should use by EXACT name when credited: ${knownDirectors.join(', ') || '(none resolved)'}. Any other director or studio name is checked by the linter against the live archive, with romanization and macron variants accepted. A credited director or studio that does not exist yet goes in entities.directors / entities.studios with full researched fields and 3+ sources; thinly sourced people stay in the text only.

**Allowed values.** Anything else is rejected.
- Country: ${opts('Country')}
- Format: ${opts('Format')}. A multi-episode series or OVA is Series; a single OVA or TV special under ~60 min is Short; a feature-length film, OVA or TV movie is Feature.
- Color: ${opts('Color')}
- Sound: ${opts('Sound')}
- Confidence: ${opts('Confidence')}. Use ★★★★ normally; ★★★★★ only with scholarly sources; ★★★ if the director or year rests on thin sourcing.
- Technique: ${opts('Technique')}
- Genre: ${opts('Genre')}
- Keywords (at most 5): ${opts('Keywords')}
- Entity studio Type: ${schema.studios.Type.join(', ')}
- Entity techniques: ${schema.studios['Notable Techniques'].join(', ')}
- Director Nationality: ${schema.directors.Nationality.join(', ')}
- Watch link platform: ${schema.watch.Platform.join(', ')}
- Watch link accessType: ${schema.watch['Access Type'].join(', ')}
- Watch link region (array): ${schema.watch.Region.join(', ')}
- Watch links only for a live, legitimate Discovery-safe link (official channel, Tubi, Internet Archive public domain); otherwise [].

**House style** (match existing entries):
- Director: "Name, Name"
- Studio: "Studio, Studio"
- Runtime: "~25 min" or "~22 min/ep (26 episodes)"
- Key Credits: "Directed by: …, Written by: …, Voice: Name (Role), …, Music: …, Animation: …"
- Historical Context: one rich paragraph
- Notes: a dense factual paragraph
- Research Sources: comma-separated names
- Source Material
- Original Title (native script) / Romanized Title, or "N/A" for English originals
- Synopsis: 4–6 sentences
- content: Notion Markdown with these sections separated by "---", using <b>/<i>:
  - ## Overview (2 paragraphs)
  - ## Synopsis
  - ## Production
  - ## Voice Cast (| Actor | Role(s) |)
  - ## Analysis
  - ## Historical Context
  - 600–1000 words, your own prose
- icon: one emoji

**Series:**
- If the work is narratively connected (shared characters or continuity) to an existing Series & Universes entry, set "series" to that entry's exact name.
- If it starts a new connected group with an existing Films entry, describe it in batch-level "series" (Name, Type, Country, Description, Years Active, Total Entries, Watch Order, films: [queueTitles or existing Films titles]).
- Never use Series for filmographies or studio collections.

**Output** to ${out}:

{ "films": [ { "queueTitle", "icon", "series": null, "properties": { "Title (English)", "Original Title", "Romanized Title", "Alternate Titles", "Year", "Country", "Director", "Studio", "Format", "Runtime", "Technique": [], "Color", "Sound", "Genre": [], "Keywords": [], "Synopsis", "Historical Context", "Key Credits", "Source Material", "Notes", "Research Sources", "IMDB", "Letterboxd", "Wikipedia", "Confidence" }, "directors": [], "studios": [], "content", "sources": [ {"name","url","supports"} ], "watchLinks": [ {"platform","url","accessType","region":[],"verified"} ], "conflicts" } ], "entities": { "directors": [ {"Name","Native Name","Nationality","Birth Year","Death Year","Bio","Significance","Signature Style","Primary Technique":[],"Awards","Wikipedia","IMDb","sources":[]} ], "studios": [ {"Name","Country","Founded","Closed","Active","Type","Significance","Notable Techniques":[],"Website","Wikipedia","sources":[]} ] }, "series": [] }

Use numbers for years and null for unknowns.

**Before finishing, run:** \`cd /Users/kyle/Code/animation-archive-site && node scripts/research/lint.mjs ${out}\`, then fix every ERROR and re-run until it prints "LINT PASSED". Warnings need a sentence in that work's "conflicts".

Reply briefly: per work, the verified year/format/runtime/director, confidence, IMDb ID and unresolved conflicts.`;
  writeFileSync(`${dir}/brief-${gi + 1}.md`, md);
});

// ---- report
console.log(`Batch ${batch}: ${picks.length} picked, ${ok.length} briefed in ${groups.length} brief(s), ${held.length} held for duplicate review`);
for (const p of pre) {
  const d = p.duplicates.map(x => `${x.strength}:${x.title} (${x.year},${x.format}) ${x.similarity}`).join('; ');
  const e = p.directors.map(x => `${x.name}→${x.status}${x.entity ? `(${x.entity.name})` : ''}${x.candidates ? `[${x.candidates.map(c => c.name).join('|')}]` : ''}`).join(', ');
  console.log(`${held.includes(p) ? 'HOLD' : ' ok '} | ${p.queue.prio} | ${p.queue.title} ${p.queue.year || ''} | dup: ${d || '—'} | dirs: ${e || '—'}`);
}
console.log(`Files: ${dir}/precheck.json${groups.map((_, i) => `, brief-${i + 1}.md`).join('')}`);
