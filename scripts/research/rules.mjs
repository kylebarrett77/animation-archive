#!/usr/bin/env node
/**
 * rules.mjs — the Research Rules database (Animation Archive: Research Rules).
 *
 *   node scripts/research/rules.mjs list [--status Active] [--kind Precedent]
 *   node scripts/research/rules.mjs add rules.json        # [{Rule, Kind, Status, Scope:[], Why, Example, "Enforced By", "Decided By", originSessions:[191]}]
 *
 * Briefs read Active Brief/Review/Precedent/Process rules by scope (lib.rulesFor). Lint and Review rules are
 * enforced in code; their "Enforced By" names the check. New rules from learn.mjs arrive as Proposed.
 */
import { readFileSync, writeFileSync } from 'fs';
import { getNotion, queryAll } from '../lib/notion.js';
import { loadEnv, DB, DS, WORK_DIR, plain, schemaOptions, rulesIndex, stamp } from './lib.mjs';

loadEnv();
const [cmd, arg] = process.argv.slice(2); const a = process.argv.slice(2); const opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (cmd === 'list') {
  const rows = (await rulesIndex()).filter(r => (!opt('--status') || r.status === opt('--status')) && (!opt('--kind') || r.kind === opt('--kind')));
  for (const r of rows) console.log(`${(r.status || '?').padEnd(8)} ${(r.kind || '?').padEnd(9)} [${r.scope.join(', ')}] ${r.rule}`);
  console.log(`${rows.length} rule(s)`); process.exit(0);
}
if (cmd !== 'add' || !arg) { console.error('usage: rules.mjs list | add <rules.json>'); process.exit(2); }
const rows = JSON.parse(readFileSync(arg, 'utf8'));
const schema = (await schemaOptions()).rules;
const existing = new Set((await rulesIndex()).map(r => r.rule.trim().toLowerCase()));
const sessions = (await queryAll(DB.sessions)).map(p => ({ id: p.id, n: Number((plain(p.properties.Session).match(/^Session\s+(\d+)/i) || [])[1]) }));
const n = getNotion(); const t = s => ({ rich_text: [{ type: 'text', text: { content: String(s || '').slice(0, 1900) } }] }); const log = [];
for (const r of rows) {
  if (existing.has(r.Rule.trim().toLowerCase())) { log.push({ rule: r.Rule, skipped: 'already exists' }); continue; }
  const bad = [['Kind', [r.Kind]], ['Status', [r.Status || 'Proposed']], ['Scope', r.Scope || []], ['Decided By', r['Decided By'] ? [r['Decided By']] : []]]
    .flatMap(([k, vals]) => vals.filter(v => !schema[k].includes(v)).map(v => `${k} "${v}"`));
  if (bad.length) { log.push({ rule: r.Rule, skipped: `not allowed: ${bad.join(', ')}` }); continue; }
  const origin = (r.originSessions || []).map(num => sessions.find(s => s.n === num)?.id).filter(Boolean);
  const p = await n.pages.create({ parent: { type: 'data_source_id', data_source_id: DS.rules }, properties: {
    Rule: { title: [{ type: 'text', text: { content: r.Rule } }] }, Kind: { select: { name: r.Kind } }, Status: { select: { name: r.Status || 'Proposed' } },
    Scope: { multi_select: (r.Scope || ['All']).map(name => ({ name })) }, Why: t(r.Why), Example: t(r.Example), 'Enforced By': t(r['Enforced By']),
    ...(r['Decided By'] ? { 'Decided By': { select: { name: r['Decided By'] } } } : {}), 'Origin Session': { relation: origin.map(id => ({ id })) } } });
  existing.add(r.Rule.trim().toLowerCase()); log.push({ rule: r.Rule, created: p.id, origin: origin.length });
}
const out = `${WORK_DIR}/rules-add-${stamp()}.json`; writeFileSync(out, JSON.stringify(log, null, 1));
for (const l of log) console.log(l.created ? `added   ${l.rule}` : `skip    ${l.rule}: ${l.skipped}`);
console.log(`Log: ${out}`);
