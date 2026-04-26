# Animation Archive Site: Comprehensive Code & Feature Audit (Batched Plan)

**Audit Date:** April 13, 2026  
**Status:** Static site generator pulling from Notion database + built catalog  
**Current Data:** Stale (Feb 15, 2026 fetch) - Notion now has 2,178 films vs. cached JSON  
**Key Problem:** No platform filtering for watch links (Netflix/YouTube/Hulu/etc.)

---

## Architecture Overview

### Data Flow
1. **Source:** Notion database (films, directors, studios, series, watch links)
2. **Fetch Scripts:**
   - `fetch-notion.js`: Pulls films, directors, studios, series metadata
   - `fetch-watch-links.js`: Pulls watch link data (Platform, URL, Last Verified)
3. **Transform & Validate:**
   - `validate-links.js`: Checks link health
   - `validate-watch-links.js`: Validates watch link schema, Platform values
   - `migrate-watch-links.js`: Data cleanup for broken entries
4. **Build:**
   - `build-site.js` (213KB): Main static site generator - creates index.html + faceted pages (films/, directors/, studios/, series/, countries/, decades/, genres/, keywords/, techniques/)
5. **Output:** `dist/` directory with:
   - `index.html` (1.9MB) - embedded catalog
   - `app.js` (18KB) - client-side filtering/search
   - `styles.css` (48KB)
   - Generated facet directories (1,812 film pages, 1,102 director pages, 789 studio pages, etc.)

### Data Files (data/ directory)
- `films.json`: 5.7MB (performance concern - loaded entirely client-side)
- `directors.json`: 1.4MB
- `studios.json`: 623KB
- `series.json`: 59KB
- `watch-links.json`: 858KB (critical for platform filtering)
- `stats.json`: 16KB (metadata)
- Audit & validation reports

---

## Critical Findings

### 1. **Watch Link Platform Filtering (Priority #1)**
**Status:** NOT IMPLEMENTED  
**Impact:** Users cannot search "what's on Netflix" or filter by platform.

**Evidence:**
- `watch-links.json` contains Platform field (e.g., "Netflix", "YouTube", "Hulu")
- `app.js` does client-side filtering but NO platform facet exists
- `build-site.js` generates facets for: countries, decades, genres, keywords, techniques — BUT NOT platforms/sources
- WATCH-LINKS-MIGRATION.md documents data schema includes Platform but no UI feature
- `watch-links-renderer.js` exists but unclear if integrated into build

**Blockers:**
- Platform field may have NULL/empty values in many entries (documented in watch-links migration notes)
- No validation that Platform matches known sources
- Client-side filtering in `app.js` would need new facet UI

---

### 2. **Data Staleness**
**Status:** CRITICAL  
**Last Fetch:** February 15, 2026 (58 days old)  
**Current Notion DB:** 2,178 films (vs. cached JSON - unknown count)

**Risk:**
- Users see outdated watch links (stale URLs, removed videos)
- New films in Notion not in catalog
- Watch link Platform/URL values verified Feb 15 - now 2 months out of date

**Automation Missing:**
- No scheduled fetch in Netlify config (see `netlify.toml` - no build hooks)
- Manual fetch only via `npm run fetch:notion`
- No CI/CD trigger

---

### 3. **Films.json Client-Side Performance Burden**
**Status:** SUBOPTIMAL  
- File size: 5.7MB uncompressed
- Loaded in browser: yes (entire dataset in `app.js`)
- Compression: Check if Netlify gzip enabled (likely, but not guaranteed)
- Pagination: NO (all 2,000+ films rendered on one page initially)
- Lazy loading: NO

**Impact:** Slow initial load, high memory on mobile, poor Core Web Vitals.

---

### 4. **Watch Link Data Quality**
**Status:** DEGRADED  
**Known Issues (from migration notes):**
- Many entries with empty URL fields
- Missing/null Platform values
- Inconsistent verification dates
- Stale links (verified Feb 15, now unable to access)

**Validation:**
- `validate-watch-links.js` exists but last run unknown
- No automated validation in build pipeline

---

### 5. **Code Quality & Maintainability**
**Status:** MODERATE ISSUES

**Positive:**
- Clear separation: fetch, validate, build stages
- Explicit watch-links refactoring (WATCH-LINKS-MIGRATION.md)
- Audit tooling exists (audit-data.js, audit reports)

**Concerns:**
- `build-site.js` is 213KB (single monolithic file)
- Dead code risk in watch-links-renderer.js (integration unclear)
- No TypeScript/JSDoc (type safety low)
- Error handling sparse (no try/catch patterns documented)
- Hardcoded facet list in build (adding new facets requires code change)

---

### 6. **Accessibility & Mobile**
**Status:** UNKNOWN (needs testing)

**Concerns:**
- 1.9MB index.html suggests heavy inline content
- No semantic HTML audit in provided docs
- `app.js` (18KB) handles UI - ARIA labels/keyboard nav unclear
- No mobile-first responsive design validation

---

### 7. **Build & Deploy**
**Status:** MANUAL PROCESS  
- `netlify.toml`: Minimal config (build command likely `npm run build`)
- No preview builds on PR
- No automated data refresh
- Deployment: Every manual `npm run build` + git push triggers Netlify

---

## Batched Improvement Plan

### **Batch A — Data Refresh & Sanitization**
**Scope:** Re-fetch Notion, validate schema, clean broken entries  
**Files:** `scripts/fetch-notion.js`, `scripts/fetch-watch-links.js`, `scripts/validate-watch-links.js`, `data/watch-links.json`

**Actions:**
1. Run `fetch-notion.js` to pull latest films/directors/studios/series from Notion (2,178+ films)
2. Run `fetch-watch-links.js` to refresh all watch link URLs and Platform values
3. Execute `validate-watch-links.js` with strict rules:
   - Reject entries with null Platform or empty URL
   - Flag entries verified >30 days ago for manual re-check
   - Ensure Platform in whitelist: ["Netflix", "YouTube", "Amazon Prime", "Hulu", "Disney+", "Crunchyroll", "etc."]
4. Run `validate-links.js` to test URL accessibility (HEAD requests)
5. Generate report: `data/watch-links-validation-report.json`
6. Update `data/stats.json` with new counts

**Files to touch:**
- `data/films.json`
- `data/watch-links.json`
- `data/directors.json`, `studios.json`, `series.json`
- `data/stats.json`

**Estimated Effort:** 2-4 hours (mostly waiting on Notion API + link checking)  
**Risk:** LOW (read-only from Notion; no deploy until validated)

---

### **Batch B — Watch Link Platform Filter (PRIORITY)**
**Scope:** Enable "What can I watch on Netflix?" filtering  
**Files:** `scripts/build-site.js`, `dist/app.js`, `dist/index.html`, `watch-links-renderer.js`

**Actions:**
1. Extract unique Platform values from `watch-links.json`
2. Modify `build-site.js` to generate platform facet pages (e.g., `dist/platforms/netflix.html`, `dist/platforms/youtube.html`)
3. Update `app.js` to expose Platform as a filter dimension in client-side faceted search
4. Integrate `watch-links-renderer.js` into `build-site.js` to generate watch link cards on film detail pages
5. Add Platform filter UI to `index.html` (dropdown or checkbox list)
6. Test that filtering by platform returns only films with watch links for that source

**Concrete Changes:**
- `build-site.js`: Add platform facet generation (logic similar to genres/countries)
- `app.js`: Add `filters.platform` to search logic
- `index.html`: Add `<div id="filter-platform">` + JavaScript event handler
- `watch-links-renderer.js`: Verify it's called during build for watch link card HTML

**Estimated Effort:** 8-12 hours (UI integration, testing)  
**Risk:** MEDIUM (requires testing watch link display + facet generation logic)

---

### **Batch C — Code Cleanup & DRY**
**Scope:** Refactor monolithic build, consolidate patterns, remove dead code  
**Files:** `scripts/build-site.js`, `scripts/watch-links-renderer.js`, `scripts/migrate-watch-links.js`

**Actions:**
1. Audit `build-site.js` (213KB) - identify repeating facet generation logic, extract into helper functions
2. Consolidate facet builders into a single `generateFacet(name, values, template)` function
3. Review `watch-links-renderer.js` - verify it's used or mark for removal
4. Check `migrate-watch-links.js` - if one-off migration, move to archive/ folder
5. Add JSDoc comments to all functions
6. Add error handling (try/catch) around Notion API calls and file I/O

**Estimated Effort:** 6-10 hours  
**Risk:** LOW (refactor with tests; non-breaking)

---

### **Batch D — Performance Optimization**
**Scope:** Reduce bundle size, add pagination/lazy loading, optimize data fetching

**Actions:**
1. **Compress films.json:** Split into:
   - `films-index.json` (ID, title, year only) - loaded first
   - `films-detail/{id}.json` - lazy loaded on demand
   - Reduces initial load to ~200KB instead of 5.7MB
2. **Pagination:** Modify `app.js` to show 20 films per page + "load more" button
3. **CSS optimization:** Audit `styles.css` (48KB) - minify, remove unused rules
4. **Build step:** Add gzip/brotli compression to Netlify config
5. **Image optimization:** If HTML embeds images, add webp format, srcset

**Files to touch:**
- `scripts/build-site.js` (split data generation)
- `dist/app.js` (pagination logic)
- `netlify.toml` (compression headers)
- `dist/styles.css` (minify)

**Estimated Effort:** 10-15 hours  
**Risk:** MEDIUM (requires rewriting data flow; careful testing needed)

---

### **Batch E — Accessibility & UX Polish**
**Scope:** WCAG 2.1 AA compliance, mobile-first responsive, keyboard navigation

**Actions:**
1. Audit `index.html` + `app.js` for:
   - Semantic HTML (use `<nav>`, `<main>`, `<article>`, not just divs)
   - ARIA labels on filter buttons/facets
   - Color contrast ratios (text on background)
   - Keyboard navigation (tab order, focus styles)
2. Test on mobile (375px, 768px, 1024px breakpoints)
3. Add `role="main"` to primary content area
4. Verify search/filter is keyboard accessible
5. Add skip-to-content link

**Tools:**
- Axe DevTools browser extension
- WAVE accessibility validator
- Mobile device testing or Chrome DevTools emulation

**Files to touch:**
- `dist/index.html`
- `dist/app.js` (event handling)
- `dist/styles.css` (media queries, focus styles)

**Estimated Effort:** 6-10 hours  
**Risk:** LOW (non-breaking; progressive enhancement)

---

### **Batch F — New Features & Discovery**
**Scope:** Enhanced search, recommendations, sorting, facet improvements

**Actions:**
1. **Advanced search:** Add full-text search on film descriptions/plot (if available in Notion)
2. **Sorting:** Add sort by title, year, rating (if available), most recently added
3. **Recommendations:** "Films similar to X" - tag-based clustering on genres/keywords/studios
4. **Facet improvements:**
   - Multi-select filters (e.g., "anime from Japan AND sci-fi")
   - Filter chips showing active filters
   - Clear all filters button
5. **Saved searches/bookmarks:** LocalStorage integration (user's favorite filters/films)

**Files to touch:**
- `dist/app.js` (search, sort, recommendation logic)
- `dist/index.html` (UI controls)
- Potentially: `scripts/build-site.js` (if adding computed fields like similarity scores)

**Estimated Effort:** 15-20 hours  
**Risk:** MEDIUM-HIGH (new logic, edge cases)

---

### **Batch G — Build & Deploy Hygiene**
**Scope:** CI/CD automation, preview builds, scheduled data refresh

**Actions:**
1. **Update `netlify.toml`:**
   - Set explicit build command: `npm run build`
   - Set publish directory: `./dist`
   - Add `[build.environment]` for Node version pinning
   - Add HTTP headers for security (CSP, X-Content-Type-Options)
2. **GitHub Actions (if available):**
   - Create `.github/workflows/test.yml` to run `npm run validate:*` on PR
   - Create `.github/workflows/deploy.yml` to run build + deploy on merge to main
3. **Scheduled refresh:**
   - Add cron job (GitHub Actions or Netlify Functions) to run `fetch-notion.js` weekly
   - Commit new data to repo, trigger rebuild
4. **Preview builds:** Enable Netlify preview builds for branches
5. **Sentry/monitoring:** Add error tracking (optional but recommended)

**Files to touch:**
- `netlify.toml` (build config)
- `.github/workflows/` (new)
- `.github/workflows/fetch-cron.yml` (new - scheduled refresh)
- `package.json` (scripts validation)

**Estimated Effort:** 4-8 hours  
**Risk:** LOW-MEDIUM (automation logic; test thoroughly)

---

## Priority Ranking

1. **Batch A (Data Refresh)** - IMMEDIATE (data is 2 months stale)
2. **Batch B (Platform Filter)** - HIGH (stated #1 UX problem)
3. **Batch D (Performance)** - HIGH (5.7MB load overhead)
4. **Batch C (Code Cleanup)** - MEDIUM (maintenance debt)
5. **Batch G (CI/CD)** - MEDIUM (prevents future staleness)
6. **Batch E (Accessibility)** - MEDIUM (compliance + UX)
7. **Batch F (New Features)** - LOW (nice-to-have post-MVP)

---

## Risk Summary

| Batch | Risk Level | Mitigation |
|-------|-----------|-----------|
| A | LOW | Test on staging; snapshot old data before fetch |
| B | MEDIUM | Feature flag for platform filter; manual QA |
| C | LOW | Refactor with existing tests; git bisect if issues |
| D | MEDIUM | Preserve old app.js; canary test on subset of users |
| E | LOW | Use automated a11y tools + manual testing |
| F | MEDIUM-HIGH | Incremental rollout; feature flags for new sorting/search |
| G | LOW-MEDIUM | Test CI/CD on non-main branch first |

---

## Estimated Total Timeline

- **Batch A:** 2-4 hours
- **Batch B:** 8-12 hours
- **Batch C:** 6-10 hours
- **Batch D:** 10-15 hours
- **Batch E:** 6-10 hours
- **Batch F:** 15-20 hours
- **Batch G:** 4-8 hours

**Total (Sequential):** ~51-89 hours  
**Total (Parallel A+B+C concurrent, then D+E+G, then F):** ~30-45 hours

---

## Quick Wins (Do First)

1. Re-run `fetch-notion.js` + `fetch-watch-links.js` (30 min) → commit fresh data
2. Add platform filter UI placeholder to `index.html` (30 min) → users know feature is coming
3. Update `netlify.toml` with build command + security headers (30 min)
4. Extract facet generation logic from `build-site.js` into helper (2-3 hours) → unblock Batch B

**Total: 3-4 hours → immediate data refresh + momentum for Batch B**

