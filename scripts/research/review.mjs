#!/usr/bin/env node
/**
 * review.mjs — soft checks between lint and promote, and the capture point for learning.
 *
 *   node scripts/research/review.mjs reports/research/session196/draft-1.json [more drafts…]
 *
 * 1. Freezes the agent's draft as draft-N.agent.json (only the first time), so log-session.mjs can
 *    measure exactly what review changed (the main learning signal; see the Research Engine design).
 * 2. Flags what lint can't judge: facts that disagree with the Queue, studio-as-director, superlative
 *    claims, native-language source depth, watch-link copyright, country and season policy, confidence.
 *    Each flag names the Research Rule it comes from, so a reviewer resolves it by the rule or precedent.
 * 3. Writes review-N.md / review-N.json next to the draft. Exit code 0 always: flags are for the lead,
 *    who resolves each one (edit the draft, or accept it with a reason) before promote.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { queryAll } from '../lib/notion.js';
import { loadEnv, DB, plain, entityIndex, resolve, sourcesIndex, hostOf, rulesIndex, queueMatches } from './lib.mjs';

loadEnv();
const files = process.argv.slice(2).filter(f => f.endsWith('.json') && !f.endsWith('.agent.json'));
if (!files.length) { console.error('usage: review.mjs <draft.json> [...]'); process.exit(2); }
const [queueRaw, ents, srcIdx, rules] = await Promise.all([queryAll(DB.queue), entityIndex(), sourcesIndex(), rulesIndex()]);
const queue = queueRaw.map(p => ({ id: p.id, title: plain(p.properties.Title), orig: plain(p.properties['Original Title']), year: p.properties.Year?.number,
  country: p.properties.Country?.select?.name, format: p.properties.Format?.select?.name, director: plain(p.properties.Director), src: plain(p.properties['Source Found']), linked: (p.properties['Film DB Entry']?.relation || []).length }));
const ruleRef = re => { const r = rules.find(x => x.status === 'Active' && re.test(x.rule)); return r ? r.rule : null; };
const R = {
  queue: ruleRef(/Queue notes as leads/i), studioDir: ruleRef(/'Director' value may be a studio/i), claims: ruleRef(/First \/ only \/ biggest/i),
  native: ruleRef(/2 native-language sources/i), uraa: ruleRef(/URAA/), country: ruleRef(/creative origin/i), season: ruleRef(/One Films entry per series/i),
};
// Languages: Sources DB tags by host, else wikipedia subdomain / country TLD / non-Latin title.
const hostLang = new Map(srcIdx.filter(s => s.url).map(s => [hostOf(s.url), s.languages]));
const ENGLISH = new Set(['USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Ireland', 'Nigeria', 'Kenya', 'South Africa', 'Zambia', 'Ghana', 'Uganda', 'Zimbabwe', 'Jamaica', 'Trinidad and Tobago', 'Singapore']);
const TLD = { Bulgaria: 'bg', 'East Germany': 'de', Germany: 'de', Iran: 'ir', Brazil: 'br', Spain: 'es', France: 'fr', Italy: 'it', Japan: 'jp', China: 'cn', Taiwan: 'tw', 'South Korea': 'kr', Russia: 'ru', USSR: 'ru',
  Poland: 'pl', Hungary: 'hu', Czechoslovakia: 'cz', 'Czech Republic': 'cz', Slovakia: 'sk', Croatia: 'hr', Serbia: 'rs', Yugoslavia: 'rs', Romania: 'ro', Estonia: 'ee', Latvia: 'lv', Lithuania: 'lt', Ukraine: 'ua',
  Portugal: 'pt', Netherlands: 'nl', Belgium: 'be', Sweden: 'se', Norway: 'no', Denmark: 'dk', Finland: 'fi', Turkey: 'tr', Israel: 'il', Egypt: 'eg', India: 'in', Mexico: 'mx', Argentina: 'ar', Cuba: 'cu',
  Chile: 'cl', Colombia: 'co', Vietnam: 'vn', Thailand: 'th', Indonesia: 'id', Malaysia: 'my', Philippines: 'ph', Greece: 'gr', Austria: 'at', Switzerland: 'ch' };
const isNative = (s, country) => {
  const h = hostOf(s.url || ''); const wiki = h.match(/^([a-z-]+)\.wikipedia\.org$/);
  if (wiki) return false;   // the rule asks for 2 beyond Wikipedia
  const langs = hostLang.get(h); if (langs && langs.some(l => l !== 'English')) return true;
  if (TLD[country] && h.endsWith('.' + TLD[country])) return true;
  return /[^\u0000-ɏ -⁯]/.test(s.name || '');   // non-Latin script in the cited title
};
const STUDIOISH = /\b(studios?|animation|films?|pictures|entertainment|productions?|media|lab|company|ltd|inc)\b/i;
// Claims about the work's standing, not plot: "the first Iranian feature", "highest-grossing", "the only animated…".
const CLAIM = /\b((?:the|its|country's|nation's|[A-Z][a-z]+(?:'s|n))\s+(?:very\s+)?first\s+(?:[\w-]+\s+){0,3}?(?:animated|animation|feature|full-length|feature-length|colou?r|sound|cartoon|puppet|stop[- ]motion|series|film)\b(?!\s+of\s+[A-Z])|first[- ]ever|highest[- ]grossing|best[- ]selling|record[- ](?:breaking|setting)|the only (?:animated|feature|film|series|animation)|earliest (?:surviving|known|animated)|pioneered)/;
const ATTRIB = /\b(according to|described as|calls?|called|claimed|claims|billed as|marketed as|reports?|reported(ly)?|per |by the count of|as .* puts it|says|said|counts?)\b|\((?:[^()]*?(?:[A-Z][\w.-]+)[^()]*?[,;][^()]*|per [^()]+|[A-Z][\w-]+(?: [A-Z][\w-]+)*,? \d{4})\)/;   // named sources, or a parenthetical citation such as (DEFA-Stiftung, DIAF)
const sentences = t => String(t || '').replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+/);

for (const file of files) {
  const frozen = file.replace(/\.json$/, '.agent.json');
  if (!existsSync(frozen)) { copyFileSync(file, frozen); console.log(`froze   ${frozen}`); }
  const draft = JSON.parse(readFileSync(file, 'utf8')); const flags = []; const stats = [];
  const flag = (work, check, detail, rule) => flags.push({ work, check, detail, rule: rule || null });
  for (const f of draft.films || []) {
    const p = f.properties || {}; const w = p['Title (English)'] || f.queueTitle; const q = queueMatches(queue, f)[0];
    // Queue delta
    if (q) {
      const deltas = [];
      if (q.year && p.Year && Number(p.Year) !== q.year) deltas.push(`Year ${q.year} → ${p.Year}`);
      if (q.country && p.Country && p.Country !== q.country) deltas.push(`Country ${q.country} → ${p.Country}`);
      if (q.format && q.format !== 'Unknown' && p.Format && p.Format !== q.format) deltas.push(`Format ${q.format} → ${p.Format}`);
      if (q.director && p.Director && !q.director.split(/,|&/).some(d => d.trim() && String(p.Director).toLowerCase().includes(d.trim().toLowerCase().split(' ').pop()))) deltas.push(`Director "${q.director}" → "${p.Director}"`);
      if (deltas.length) flag(w, 'queue-delta', `${deltas.join('; ')}${String(f.conflicts || '').length < 20 ? ' (not explained in conflicts)' : ''}`, R.queue);
      if (q.director && (resolve(ents.studios, q.director).status !== 'missing' || STUDIOISH.test(q.director))) flag(w, 'director-is-studio', `Queue director "${q.director}" looks like a studio; credited: ${p.Director}`, R.studioDir);
      if (p.Country && q.country && p.Country !== q.country && !/creative origin|country/i.test(p.Notes || '')) flag(w, 'country-unexplained', `Country changed to ${p.Country} but Notes don't explain why`, R.country);
    } else flag(w, 'queue-missing', 'No matching Queue item', null);
    // Claims
    const claimText = [p['Historical Context'], p.Notes].join(' ');   // not Synopsis/content: plot sentences trip the pattern
    const claims = sentences(claimText).filter(s => CLAIM.test(s) && !ATTRIB.test(s) && !/\bnot (?:the|its|a) first\b/i.test(s)).slice(0, 4);
    if (claims.length) flag(w, 'claims', claims.map(s => `"${s.trim().slice(0, 140)}"`).join(' · '), R.claims);
    // Native sources
    if (!ENGLISH.has(p.Country)) {
      const nat = (f.sources || []).filter(s => isNative(s, p.Country));
      if (nat.length < 2) flag(w, 'native-sources', `${nat.length} native-language source(s) beyond Wikipedia (${(f.sources || []).length} total)`, R.native);
    }
    stats.push({ work: w, nonEnglish: !ENGLISH.has(p.Country), native: (f.sources || []).filter(s => isNative(s, p.Country)).length, sources: (f.sources || []).length, queueDeltas: flags.filter(x => x.work === w && x.check === 'queue-delta').length });
    // Watch-link copyright (US term for restored foreign works: published 1931+ may still be protected)
    for (const l of f.watchLinks || []) {
      const ia = /archive\.org/i.test(l.url || '') || /internet archive/i.test(l.platform || '');
      if (ia && p.Country !== 'USA' && Number(p.Year) > 1930) flag(w, 'watch-copyright', `${l.url}: foreign work from ${p.Year}; check home-country term on 1 Jan 1996 (URAA)`, R.uraa);
    }
    // Season policy
    if (p.Format === 'Series' && /(\bseason\b|\bS\d\b|\s\d$|\(\d\)$|\b(II|2)\b)/i.test(f.queueTitle || '')) flag(w, 'season', `Queue title "${f.queueTitle}" may be a later season of an existing series`, R.season);
    // Confidence vs sourcing
    const n = (f.sources || []).length;
    if (p.Confidence === '★★★★★' && !/scholar|journal|university|encyclop|archive/i.test(JSON.stringify(f.sources || []))) flag(w, 'confidence', '★★★★★ without a scholarly or archival source', null);
    if (p.Confidence === '★★★★' && n < 4) flag(w, 'confidence', `★★★★ on ${n} sources`, null);
  }
  const out = file.replace(/draft-(\d+)\.json$/, 'review-$1');
  writeFileSync(`${out}.json`, JSON.stringify({ draft: file, frozen, flags, stats }, null, 1));
  const md = [`# Review: ${file}`, '', `${flags.length} flag(s). Resolve each (edit the draft, or accept with a reason) before promote.`, '',
    '| Work | Check | Detail | Rule |', '|---|---|---|---|', ...flags.map(x => `| ${x.work} | ${x.check} | ${String(x.detail).replace(/\|/g, '/')} | ${x.rule ? x.rule.slice(0, 70) + '…' : ''} |`)].join('\n');
  writeFileSync(`${out}.md`, md);
  console.log(`${file}: ${flags.length} flag(s) → ${out}.md`);
  for (const x of flags) console.log(`  ${x.check.padEnd(20)} ${x.work}: ${String(x.detail).slice(0, 150)}`);
}
