#!/usr/bin/env node
/**
 * learn.mjs — turn session outcomes into rule evidence and proposed rules (Research Engine: loop 2 and 3).
 *
 *   node scripts/research/learn.mjs            # report only
 *   node scripts/research/learn.mjs --write    # also update Research Rules (Times Applied, Last Applied) and add Proposed rules
 *
 * Reads every reports/research/session<N>/ folder:
 *   review-N.json   flags, each citing the Active rule it came from  → Times Applied per rule (recomputed, idempotent)
 *   overrides.json  what review changed in agent drafts               → recurring patterns
 * A field corrected in 2+ works (across any sessions) that no Active rule covers becomes a Proposed rule
 * stub with the evidence attached. The research lead rewrites the stub into a real rule (or retires it);
 * nothing Proposed reaches briefs until it is set Active. Rules that change what the site shows are the
 * owner's call (Decided By: Kyle).
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import { getNotion } from '../lib/notion.js';
import { loadEnv, DS, WORK_DIR, rulesIndex, stamp, today } from './lib.mjs';

loadEnv();
const WRITE = process.argv.includes('--write');
const sessions = existsSync(WORK_DIR) ? readdirSync(WORK_DIR).filter(x => /^session\d+$/.test(x)).sort((a, b) => +a.slice(7) - +b.slice(7)) : [];
const rules = await rulesIndex();

// ---- rule usage from review flags
const uses = new Map(); const lastUse = new Map();
for (const s of sessions) for (const f of readdirSync(`${WORK_DIR}/${s}`).filter(x => /^review-\d+\.json$/.test(x))) {
  const day = statSync(`${WORK_DIR}/${s}/${f}`).mtime.toISOString().slice(0, 10);
  for (const fl of JSON.parse(readFileSync(`${WORK_DIR}/${s}/${f}`, 'utf8')).flags || []) if (fl.rule) {
    uses.set(fl.rule, (uses.get(fl.rule) || 0) + 1); if (!lastUse.has(fl.rule) || lastUse.get(fl.rule) < day) lastUse.set(fl.rule, day);
  }
}

// ---- override patterns
const overrides = sessions.flatMap(s => existsSync(`${WORK_DIR}/${s}/overrides.json`) ? JSON.parse(readFileSync(`${WORK_DIR}/${s}/overrides.json`, 'utf8')).map(o => ({ ...o, session: +s.slice(7) })) : []);
// Which Active rules speak to a field (by keyword in the rule, its example or Enforced By).
const FIELD_WORDS = { Country: /country|creative origin/i, Confidence: /confidence|★/i, watchLinks: /watch link/i, Year: /year/i, Director: /director/i, directors: /director|nationality|text only/i,
  studios: /studio/i, 'Original Title': /title|script/i, 'Alternate Titles': /title/i, Technique: /technique|hybrid|mixed/i, Format: /format|series|season|feature/i, series: /series|sequel/i,
  IMDB: /imdb/i, Wikipedia: /wikipedia/i, Notes: /notes/i, icon: /emoji|icon/i };
const NARRATIVE = new Set(['Synopsis', 'Historical Context', 'Notes', 'Key Credits', 'Research Sources', 'Runtime']);   // prose edits are expected, not a rule signal
const byField = new Map();
for (const o of overrides) { if (NARRATIVE.has(o.field)) continue; byField.set(o.field, [...(byField.get(o.field) || []), o]); }
const patterns = [...byField.entries()].map(([field, list]) => {
  const works = new Set(list.map(o => o.work)); const re = FIELD_WORDS[field];
  const covered = re ? rules.filter(r => r.status === 'Active' && (re.test(r.rule) || re.test(r.example) || re.test(r.enforcedBy))).map(r => r.rule) : [];
  return { field, count: list.length, works: works.size, sessions: [...new Set(list.map(o => o.session))], covered, examples: list.slice(0, 4) };
}).sort((x, y) => y.works - x.works);
const proposals = patterns.filter(p => p.works >= 2 && !p.covered.length);

// ---- report
const lines = [`# Learning report (${today()})`, '', `Sessions scanned: ${sessions.length} · overrides recorded: ${overrides.length} · rule uses from review flags: ${[...uses.values()].reduce((a, b) => a + b, 0)}`, '',
  '## Override patterns', '', '| Field | Overrides | Works | Sessions | Covered by an Active rule |', '|---|---|---|---|---|',
  ...patterns.map(p => `| ${p.field} | ${p.count} | ${p.works} | ${p.sessions.join(', ')} | ${p.covered.length ? p.covered[0].slice(0, 60) + '…' : '**no**'} |`), '',
  '## Proposed rules', '', ...(proposals.length ? proposals.map(p => `- **${p.field}** corrected in ${p.works} works (sessions ${p.sessions.join(', ')}): ${p.examples.map(e => `${e.work}: ${e.from} → ${e.to}`).join('; ')}`) : ['None: every recurring correction is covered by an Active rule.']), '',
  '## Rule usage', '', ...rules.filter(r => r.status === 'Active').map(r => `- ${uses.get(r.rule) || 0}× ${r.rule.slice(0, 100)}`)];
const out = `${WORK_DIR}/learn-${stamp()}.md`; writeFileSync(out, lines.join('\n'));
console.log(lines.slice(0, 40).join('\n')); console.log(`\nReport: ${out}`);

if (!WRITE) process.exit(0);
const n = getNotion(); const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s || '').slice(0, 1900) } }] });
for (const r of rules) {
  const count = uses.get(r.rule) || 0; if (!count) continue;
  await n.pages.update({ page_id: r.id, properties: { 'Times Applied': { number: count }, 'Last Applied': { date: { start: lastUse.get(r.rule) } } } });
}
const existing = new Set(rules.map(r => r.rule.toLowerCase()));
for (const p of proposals) {
  const title = `Review corrected "${p.field}" in ${p.works} works: decide the expected handling and write it as a rule.`;
  if ([...existing].some(e => e.startsWith(`review corrected "${p.field.toLowerCase()}"`))) continue;
  await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.rules }, properties: {
    Rule: { title: [{ type: 'text', text: { content: title } }] }, Kind: { select: { name: 'Review' } }, Status: { select: { name: 'Proposed' } }, Scope: { multi_select: [{ name: 'All' }] },
    Why: t(`learn.mjs found ${p.count} overrides of ${p.field} across sessions ${p.sessions.join(', ')} with no Active rule covering it.`),
    Example: t(p.examples.map(e => `${e.work} (S${e.session}): ${e.from} → ${e.to}`).join('; ')), 'Enforced By': t('none yet') } });
  console.log(`proposed: ${title}`);
}
console.log('Research Rules updated.');
