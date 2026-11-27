// Create Director/Studio entity pages from a batch's researched entities, link Director<->Studio.
import { readFileSync, writeFileSync } from 'fs';
const ROOT = '/Users/kyle/Code/animation-archive-site';
const S = '/private/tmp/claude-501/-Users-kyle-Code-animation-archive-site/9b89f780-96a4-44da-913a-41fb80904d78/scratchpad/';
const { getNotion, queryAll } = await import(`${ROOT}/scripts/lib/notion.js`);
const n = getNotion();
const [file, links] = process.argv.slice(2); // links: JSON {"Director Name":["Studio Name",...]}
const b = JSON.parse(readFileSync(file, 'utf8'));
const dirStudios = JSON.parse(links || '{}');
const ids = JSON.parse(readFileSync(S + 'entity-ids.json', 'utf8'));
const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s ?? '').slice(0, 1900) } }] });
const num = v => (typeof v === 'number' ? { number: v } : { number: null });
const url = v => ({ url: v && v !== 'N/A' ? v : null });
const srcNote = e => (e.sources || []).map(s => s.name).join(', ');
// re-check existence right before creating (protocol: never create without a pre-check)
const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const liveS = (await queryAll('ae6d444ad0d847d49f7ff716642c5955')).map(p => [norm(p.properties.Name.title.map(x => x.plain_text).join('')), p.id]);
const liveD = (await queryAll('59f9c337c2ae490b9b59561129c911a0')).map(p => [norm(p.properties.Name.title.map(x => x.plain_text).join('')), p.id]);
const { makeGuard } = await import(S + 'schema-guard.mjs');
const guard = await makeGuard(n, ['bcf75e13-2857-410a-9aaf-1c240ce5fbe0', '76bc715a-0e81-4956-bf5f-ad706efeea72']);
const log = [];
for (const e of b.entities?.studios || []) {
  const hit = liveS.find(([k]) => k === norm(e.Name));
  if (hit) { ids.studios[e.Name] = hit[1]; log.push({ studio: e.Name, existed: hit[1] }); continue; }
  const sProps = {
    Name: { title: [{ type: 'text', text: { content: e.Name } }] }, Country: { select: { name: e.Country } }, Founded: num(e.Founded), Closed: num(e.Closed),
    Active: { checkbox: !!e.Active }, Type: { select: { name: e.Type } }, Significance: t(`${e.Significance}${srcNote(e) ? ` (Sources: ${srcNote(e)})` : ''}`),
    'Notable Techniques': { multi_select: (Array.isArray(e['Notable Techniques']) ? e['Notable Techniques'] : String(e['Notable Techniques'] || '').split(/,\s*/)).filter(Boolean).map(name => ({ name })) },
    Website: url(e.Website), Wikipedia: url(e.Wikipedia) };
  guard('bcf75e13-2857-410a-9aaf-1c240ce5fbe0', sProps, e.Name);
  const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: 'bcf75e13-2857-410a-9aaf-1c240ce5fbe0' }, properties: sProps });
  ids.studios[e.Name] = p.id; log.push({ studio: e.Name, created: p.id });
}
for (const e of b.entities?.directors || []) {
  const hit = liveD.find(([k]) => k === norm(e.Name));
  if (hit) { ids.directors[e.Name] = hit[1]; log.push({ director: e.Name, existed: hit[1] }); continue; }
  const studios = (dirStudios[e.Name] || []).map(s => ({ id: ids.studios[s] })).filter(x => x.id);
  const dProps = {
    Name: { title: [{ type: 'text', text: { content: e.Name } }] }, 'Native Name': t(e['Native Name'] || 'N/A'), Nationality: { select: { name: e.Nationality } },
    'Birth Year': num(e['Birth Year']), 'Death Year': num(e['Death Year']), Bio: t(e.Bio), Significance: t(`${e.Significance}${srcNote(e) ? ` (Sources: ${srcNote(e)})` : ''}`),
    'Signature Style': t(e['Signature Style']), Awards: t(e.Awards || 'N/A'),
    'Primary Technique': { multi_select: (Array.isArray(e['Primary Technique']) ? e['Primary Technique'] : String(e['Primary Technique'] || '').split(/,\s*/)).filter(Boolean).map(name => ({ name })) },
    IMDB: url(e.IMDb || e.IMDB), Wikipedia: url(e.Wikipedia), Studios: { relation: studios } };
  guard('76bc715a-0e81-4956-bf5f-ad706efeea72', dProps, e.Name);
  const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: '76bc715a-0e81-4956-bf5f-ad706efeea72' }, properties: dProps });
  ids.directors[e.Name] = p.id; log.push({ director: e.Name, created: p.id, studios: studios.length });
}
writeFileSync(S + 'entity-ids.json', JSON.stringify(ids, null, 1));
writeFileSync(`${ROOT}/reports/entities-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
