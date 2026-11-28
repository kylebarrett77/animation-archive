#!/usr/bin/env node
/**
 * brief.mjs — pre-check a batch of Queue items and write the research brief.
 *
 *   node scripts/research/brief.mjs --next 10            # next items from the promotion backlog
 *   node scripts/research/brief.mjs "Title A" "Title B"  # specific Queue titles
 *   options: --status Validated|New  --split 5  --batch NAME
 *            --world           skip USA/Japan items (audit priority: work beyond the two biggest industries)
 *            --country NAME    only items from this Queue country
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
const WORLD = args.includes('--world'); const onlyCountry = opt('--country', null);
const titles = args.filter((a, i) => !a.startsWith('--') && !['--next', '--status', '--split', '--batch', '--country'].includes(args[i - 1]));

const PRIO = { High: 0, Medium: 1, Low: 2 };
const queue = (await queryAll(DB.queue)).map(p => ({ id: p.id, title: plain(p.properties.Title), status: p.properties.Status?.select?.name, prio: p.properties.Priority?.select?.name,
  year: p.properties.Year?.number, country: p.properties.Country?.select?.name, format: p.properties.Format?.select?.name, director: plain(p.properties.Director),
  orig: plain(p.properties['Original Title']), notes: plain(p.properties['Research Notes']), src: plain(p.properties['Source Found']), linked: (p.properties['Film DB Entry']?.relation || []).length }));
let picks;
if (titles.length) picks = titles.map(t => { const m = queue.filter(q => q.title === t); if (m.length !== 1) throw new Error(`Queue title "${t}" matched ${m.length}`); return m[0]; });
else picks = queue.filter(q => q.status === status && !q.linked && !/session 46/i.test(q.src)   // Session 46 import is flagged unreliable
    && (!WORLD || !['USA', 'Japan'].includes(q.country)) && (!onlyCountry || q.country === onlyCountry))
  .sort((a, b) => (PRIO[a.prio] ?? 3) - (PRIO[b.prio] ?? 3) || (a.year ?? 9999) - (b.year ?? 9999)).slice(0, N);   // undated items last

const [films, ents, schema] = await Promise.all([filmsIndex(), entityIndex(), schemaOptions()]);
const pre = picks.map(q => {
  const yearInTitle = Number((q.title.match(/\([^)]*?\b(1[89]\d\d|20\d\d)\b[^)]*\)/) || [])[1]) || null;   // '(1989)', '(Los Fruittis, 1989)', '(2021 CGI film)'
  const dups = findDuplicates(films, { titles: [q.title, q.orig !== 'N/A' ? q.orig : ''], year: q.year || yearInTitle, director: q.director });
  const people = q.director.split(/,|&|\band\b/).map(s => s.replace(/\([^)]*\)/g, '').trim()).filter(s => s && !/unknown|various/i.test(s));
  return { queue: q, duplicates: dups, directors: people.map(n => ({ name: n, ...resolve(ents.directors, n) })) };
});
const held = pre.filter(p => p.duplicates.some(d => d.strength !== 'director-year'));
const ok = pre.filter(p => !held.includes(p));

const dir = `${WORK_DIR}/${batch}`; mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/precheck.json`, JSON.stringify(pre, null, 1));

// ---- native-language sources by Queue country (rule: native sources outrank English aggregators)
const NATIVE = {
  Japan: 'ja.wikipedia, Media Arts Database (mediaarts-db.bunka.go.jp), allcinema, ANN encyclopedia (English, but sourced from Japanese credits)',
  China: 'zh.wikipedia, Baidu Baike, Douban, Mtime, China Film Archive / Shanghai Animation Film Studio publications',
  Taiwan: 'zh.wikipedia, Taiwan Cinema (taiwancinema.bamid.gov.tw), TAICCA, Taiwan Film and Audiovisual Institute',
  'Hong Kong': 'zh.wikipedia, Hong Kong Film Archive, HK Movie Database (hkmdb.com)',
  'South Korea': 'ko.wikipedia, KMDb (kmdb.or.kr), Korean Film Archive, Naver Movie',
  Iran: 'fa.wikipedia, Sourehcinema (sourehcinema.com), Kanoon (kanoonparvaresh.com, news.kanoonparvaresh.com), Persian press (Hamshahri, IRNA, ISNA, Mehr, Etemad, Khabar Online), ensani.ir / sid.ir papers. Search in Persian script.',
  USSR: 'ru.wikipedia, animator.ru, Kinopoisk, Kino-Teatr.ru, Soyuzmultfilm archive', Russia: 'ru.wikipedia, animator.ru, Kinopoisk, Kino-Teatr.ru',
  Ukraine: 'uk.wikipedia, Dovzhenko Centre, animator.ru (Soviet era)', Georgia: 'ka.wikipedia, Georgian National Film Center', Armenia: 'hy.wikipedia, Armenian National Cinema Center',
  Estonia: 'et.wikipedia, Estonian Film Database (efis.ee), Nukufilm / Eesti Joonisfilm', Latvia: 'lv.wikipedia, filmas.lv (National Film Centre of Latvia)', Lithuania: 'lt.wikipedia, Lithuanian Film Centre',
  Czechoslovakia: 'cs.wikipedia, ČSFD (csfd.cz), Národní filmový archiv / Filmový přehled', 'Czech Republic': 'cs.wikipedia, ČSFD, Filmový přehled', Slovakia: 'sk.wikipedia, SK CINEMA (Slovak Film Institute), ČSFD',
  Poland: 'pl.wikipedia, FilmPolski.pl, Filmweb, Studio Filmów Rysunkowych / Se-ma-for archives', Hungary: 'hu.wikipedia, PORT.hu, Hungarian National Film Institute (NFI), Pannónia Film', 
  Yugoslavia: 'hr/sr.wikipedia, Zagreb Film archive, Croatian Film Association (hfs.hr)', Croatia: 'hr.wikipedia, Zagreb Film, HAVC, hfs.hr', Serbia: 'sr.wikipedia, Yugoslav Film Archive (kinoteka.org.rs)', Montenegro: 'sr/cnr.wikipedia, Film Centre of Montenegro',
  Romania: 'ro.wikipedia, CineMagia, Animafilm', Bulgaria: 'bg.wikipedia, Bulgarian National Film Archive, Sofia Animation Studio', 'East Germany': 'de.wikipedia, DEFA-Stiftung, filmportal.de', Germany: 'de.wikipedia, filmportal.de',
  France: 'fr.wikipedia, CNC, Ciné-Ressources, Annecy catalogue, AlloCiné', Belgium: 'fr/nl.wikipedia, Cinémathèque royale', Italy: 'it.wikipedia, Cinematografo.it, CSC Cineteca Nazionale', Spain: 'es.wikipedia, ICAA catalogue (cultura.gob.es), Filmoteca Española',
  Portugal: 'pt.wikipedia, Cinemateca Portuguesa, Casa da Animação', Netherlands: 'nl.wikipedia, Eye Filmmuseum', Sweden: 'sv.wikipedia, Svensk Filmdatabas', Denmark: 'da.wikipedia, Danish Film Institute (dfi.dk)', Norway: 'no.wikipedia, Nasjonalbiblioteket / Norsk filmografi', Finland: 'fi.wikipedia, Elonet (KAVI)', Iceland: 'is.wikipedia, Icelandic Film Centre',
  Brazil: 'pt.wikipedia, Cinemateca Brasileira, AnimaMundi catalogue, Filme B', Argentina: 'es.wikipedia, cinenacional.com, INCAA', Mexico: 'es.wikipedia, IMCINE, Cineteca Nacional', Cuba: 'es.wikipedia, ICAIC, EcuRed', Chile: 'es.wikipedia, CineChile', Colombia: 'es.wikipedia, Proimágenes Colombia', Peru: 'es.wikipedia', Venezuela: 'es.wikipedia',
  Egypt: 'ar.wikipedia, elCinema.com, Egyptian press (Al-Ahram)', 'Saudi Arabia': 'ar.wikipedia, elCinema.com, Saudi Film Commission', UAE: 'ar.wikipedia, elCinema.com', Turkey: 'tr.wikipedia, Sinematurk, Beyazperde', Israel: 'he.wikipedia, Israel Film Archive',
  India: 'Wikipedia in the film\'s language (hi/ml/ta/bn/mr), Films Division archive, Indian press (The Hindu, Scroll.in)', Thailand: 'th.wikipedia, Thai Film Archive', Vietnam: 'vi.wikipedia, Vietnam Animation Studio, Vietnam Film Institute', Indonesia: 'id.wikipedia, filmindonesia.or.id', Malaysia: 'ms.wikipedia, FINAS', Philippines: 'tl.wikipedia, Philippine press (Inquirer)',
  'South Africa': 'Animation SA, Cape Town International Animation Festival, NFVF, News24, Daily Maverick, Mail & Guardian (af.wikipedia for Afrikaans works)',
  Nigeria: 'Punch, The Guardian Nigeria, Premium Times, Pulse Nigeria, BellaNaija, Nollywood Reinvented, CEAN box office (yo/ha/ig.wikipedia for works in those languages)',
  Kenya: 'Daily Nation, The Standard, Business Daily, Kenya Film Commission (sw.wikipedia for Swahili works)', Zambia: 'Zambia Daily Mail, Lusaka Times, Zambian press',
  Uganda: 'Daily Monitor, New Vision', Ghana: 'Graphic Online, MyJoyOnline', Zimbabwe: 'The Herald, NewsDay',
  'North Korea': 'ko.wikipedia, KMDb, North Korean film literature (via South Korean archives)', Greece: 'el.wikipedia, Greek Film Centre', Austria: 'de.wikipedia, Filmarchiv Austria',
};
const nativeLine = g => { const cs = [...new Set(g.map(p => p.queue.country).filter(c => NATIVE[c]))]; return cs.length ? cs.map(c => `  - ${c}: ${NATIVE[c]}`).join('\n') : '  - (no native-language list for these countries; use the national film archive/database and Wikipedia in the original language)'; };

// ---- brief(s)
const knownDirectors = [...new Set(ok.flatMap(p => p.directors.filter(d => d.entity).map(d => d.entity.name)))];
const opts = k => schema.films[k].join(', ');
const groups = []; for (let i = 0; i < ok.length; i += split) groups.push(ok.slice(i, i + split));
groups.forEach((g, gi) => {
  const out = `${dir}/draft-${gi + 1}.json`;
  const md = `Research ${g.length} animated works as DRAFT Films entries for a curated animation archive (Notion), following its Validation Protocol. Do NOT write to Notion. Write only the draft JSON, then run the linter (below) and fix every error before you finish. Use WebSearch (load with ToolSearch "select:WebSearch") and WebFetch.

**Works** (use these EXACT strings as "queueTitle"):
${g.map((p, i) => `${i + 1}. "${p.queue.title}"${queue.filter(x => x.title === p.queue.title).length > 1 ? ` (another Queue item has this title: also set "queueId": "${p.queue.id}")` : ''}. Queue notes: ${p.queue.year || '?'} · ${p.queue.country || '?'} · ${p.queue.format || '?'} · dir. ${p.queue.director || '?'}. ${p.queue.notes.slice(0, 220)}${p.duplicates.length ? ` ⚠ Related Films entry exists: ${p.duplicates.map(d => `${d.title} (${d.year}, ${d.format})`).join('; ')}. Confirm this is a DIFFERENT work and say why in "conflicts".` : ''}`).join('\n')}

**Research rules:**
- 3+ independent sources per work. Native-language sources first for non-English works, searched in the original script; they outrank English aggregators. Aim for at least 2 native-language sources per work beyond Wikipedia filmographies. For these works:
${nativeLine(g)}
- English: Wikipedia, BCDB, Letterboxd, Cartoon Research, festival catalogues. Fan wikis support only.
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

{ "films": [ { "queueTitle", "queueId" (only when the work list gives one), "icon", "series": null, "properties": { "Title (English)", "Original Title", "Romanized Title", "Alternate Titles", "Year", "Country", "Director", "Studio", "Format", "Runtime", "Technique": [], "Color", "Sound", "Genre": [], "Keywords": [], "Synopsis", "Historical Context", "Key Credits", "Source Material", "Notes", "Research Sources", "IMDB", "Letterboxd", "Wikipedia", "Confidence" }, "directors": [], "studios": [], "content", "sources": [ {"name","url","supports"} ], "watchLinks": [ {"platform","url","accessType","region":[],"verified"} ], "conflicts" } ], "entities": { "directors": [ {"Name","Native Name","Nationality","Birth Year","Death Year","Bio","Significance","Signature Style","Primary Technique":[],"Awards","Wikipedia","IMDb","sources":[]} ], "studios": [ {"Name","Country","Founded","Closed","Active","Type","Significance","Notable Techniques":[],"Website","Wikipedia","sources":[]} ] }, "series": [] }

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
