#!/usr/bin/env node
/**
 * Lightweight accessibility smoke test for the built `dist/` output.
 *
 * This is NOT a substitute for a real screen-reader pass — it's a regression
 * guard for the WCAG 2.1 AA fixes applied in Batch E so they don't silently
 * get reverted by a future edit.
 *
 * Checks on a sample of built HTML pages:
 *   1. <main> landmark with id="main-content" is present
 *   2. Skip-link points to #main-content
 *   3. No <table class="film-table"> carries role="grid" (role conflicts
 *      with plain table semantics)
 *   4. Every .sortable <th> has tabindex="0" AND aria-sort
 *   5. Every .collapsible-header has role="button", tabindex="0",
 *      aria-expanded, and aria-controls — and the referenced id exists
 *   6. Every <a class="watch-btn" target="_blank"> has rel="noopener"
 *      and an aria-label (the generated glyph-only ones are unlabeled
 *      without this)
 *   7. CSS does NOT regress the --ink-faint contrast token back to #a8a29e
 *
 * Exits 1 on failure so `npm run ci` catches regressions.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';

const DIST = './dist';

if (!existsSync(DIST)) {
  console.error('✗ a11y audit: ./dist does not exist — run `npm run build` first');
  process.exit(1);
}

// Sample pages: homepage, a facet index, a facet detail, a film detail
function pickSample() {
  const samples = ['index.html'];
  const tryDir = (dir, n = 1) => {
    const p = `${DIST}/${dir}`;
    if (!existsSync(p)) return;
    const files = readdirSync(p).filter(f => f.endsWith('.html')).slice(0, n);
    for (const f of files) samples.push(`${dir}/${f}`);
  };
  tryDir('countries', 2);
  tryDir('techniques', 2);
  tryDir('genres', 2);
  tryDir('studios', 1);
  tryDir('films', 2);
  return samples;
}

const errors = [];
const warnings = [];

function check(cond, msg, list = errors) {
  if (!cond) list.push(msg);
}

// --- CSS-level checks (applies to all pages that share styles.css) ---
const css = readFileSync(`${DIST}/styles.css`, 'utf8');
check(
  !/--ink-faint\s*:\s*#a8a29e/i.test(css),
  'CSS regression: --ink-faint was reverted to #a8a29e (fails 4.5:1 contrast on cream)'
);
check(
  /\.filter-item\{[^}]*min-height:44px/.test(css),
  'CSS regression: .filter-item lost min-height:44px (WCAG 2.5.5 touch target)'
);
check(
  /--ink-faint\s*:\s*#6b6660/i.test(css),
  'CSS regression: --ink-faint not set to a11y-safe value #6b6660'
);

// --- HTML-level checks ---
const pages = pickSample();
console.log(`🔍 a11y smoke test: scanning ${pages.length} sample pages`);

for (const rel of pages) {
  const path = `${DIST}/${rel}`;
  if (!existsSync(path)) { warnings.push(`skipped missing ${rel}`); continue; }
  const html = readFileSync(path, 'utf8');

  // (1) main landmark
  check(
    /<main[^>]*id=["']main-content["']/.test(html),
    `${rel}: missing <main id="main-content"> landmark`
  );

  // (2) skip-link (href and class can appear in either order on the <a>)
  const skipLinkRe = /<a\b[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*>/;
  const skipMatch = html.match(skipLinkRe);
  check(!!skipMatch, `${rel}: no .skip-link element`);
  if (skipMatch) {
    check(
      /\bhref=["']#main-content["']/.test(skipMatch[0]),
      `${rel}: .skip-link does not point to #main-content`
    );
  }

  // (3) no role="grid" on film-table
  check(
    !/<table[^>]*class=["'][^"']*film-table[^"']*["'][^>]*role=["']grid["']/.test(html),
    `${rel}: <table class="film-table"> still carries role="grid"`
  );

  // (4) sortable th with tabindex + aria-sort
  const thRe = /<th\b[^>]*class=["'][^"']*\bsortable\b[^"']*["'][^>]*>/g;
  let m;
  while ((m = thRe.exec(html)) !== null) {
    const tag = m[0];
    check(/\btabindex=["']0["']/.test(tag),
      `${rel}: .sortable <th> missing tabindex="0": ${tag.slice(0, 120)}`);
    check(/\baria-sort=/.test(tag),
      `${rel}: .sortable <th> missing aria-sort: ${tag.slice(0, 120)}`);
  }

  // (5) collapsible headers
  const chRe = /<div\b[^>]*class=["'][^"']*\bcollapsible-header\b[^"']*["'][^>]*>/g;
  while ((m = chRe.exec(html)) !== null) {
    const tag = m[0];
    check(/\brole=["']button["']/.test(tag),
      `${rel}: .collapsible-header missing role="button"`);
    check(/\btabindex=["']0["']/.test(tag),
      `${rel}: .collapsible-header missing tabindex="0"`);
    check(/\baria-expanded=/.test(tag),
      `${rel}: .collapsible-header missing aria-expanded`);
    const ac = /\baria-controls=["']([^"']+)["']/.exec(tag);
    check(!!ac, `${rel}: .collapsible-header missing aria-controls`);
    if (ac) {
      const idRe = new RegExp(`\\bid=["']${ac[1]}["']`);
      check(idRe.test(html),
        `${rel}: .collapsible-header aria-controls="${ac[1]}" has no matching id`);
    }
  }

  // (6) external watch-btn links: rel + aria-label
  const wbRe = /<a\b[^>]*class=["'][^"']*\bwatch-btn\b[^"']*["'][^>]*>/g;
  while ((m = wbRe.exec(html)) !== null) {
    const tag = m[0];
    if (/\btarget=["']_blank["']/.test(tag)) {
      check(/\brel=["'][^"']*noopener/.test(tag),
        `${rel}: .watch-btn target=_blank missing rel="noopener"`);
      check(/\baria-label=/.test(tag),
        `${rel}: .watch-btn target=_blank missing aria-label`);
    }
  }
}

// --- Report ---
if (warnings.length) {
  console.log(`  ⚠ ${warnings.length} warning(s):`);
  warnings.forEach(w => console.log(`    - ${w}`));
}
if (errors.length) {
  console.error(`✗ a11y audit FAILED: ${errors.length} issue(s)`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`✓ a11y smoke test passed (${pages.length} pages, CSS + ARIA + touch targets)`);
