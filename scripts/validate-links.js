/**
 * Watch Link Validator
 * Checks all watchLinks URLs in the film database for validity
 * Run: npm run validate
 */

import { readFileSync, writeFileSync } from 'fs';

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));

// Rate limiting: wait between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check a single URL with HEAD request
async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects automatically
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AnimationArchiveBot/1.0; +https://animationarchive.netlify.app)'
      }
    });

    clearTimeout(timeout);

    return {
      status: response.status,
      statusText: response.statusText,
      redirectUrl: response.headers.get('location') || null,
      ok: response.ok
    };
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError') {
      return { status: 'timeout', statusText: 'Request timed out', ok: false };
    }
    return { status: 'error', statusText: error.message, ok: false };
  }
}

async function validateAllLinks() {
  console.log('🔗 WATCH LINK VALIDATION');
  console.log('========================\n');

  // Filter films with watch links
  const filmsWithLinks = films.filter(f => f.watchLinks);
  console.log(`Total films: ${films.length}`);
  console.log(`Films with watch links: ${filmsWithLinks.length}\n`);
  console.log('Checking links (this may take a few minutes)...\n');

  const results = {
    valid: [],
    notFound: [],
    redirects: [],
    timeouts: [],
    errors: [],
    serverErrors: []
  };

  let checked = 0;

  for (const film of filmsWithLinks) {
    const url = film.watchLinks;
    const filmInfo = {
      id: film.id,
      title: film.titleEnglish || 'Untitled',
      year: film.year,
      country: film.country,
      url: url
    };

    const result = await checkUrl(url);

    if (result.status === 200) {
      results.valid.push(filmInfo);
    } else if (result.status === 404) {
      results.notFound.push({ ...filmInfo, statusText: result.statusText });
    } else if (result.status === 301 || result.status === 302 || result.status === 303 || result.status === 307 || result.status === 308) {
      results.redirects.push({ ...filmInfo, redirectUrl: result.redirectUrl, status: result.status });
    } else if (result.status === 'timeout') {
      results.timeouts.push(filmInfo);
    } else if (result.status === 'error') {
      results.errors.push({ ...filmInfo, error: result.statusText });
    } else if (result.status >= 500) {
      results.serverErrors.push({ ...filmInfo, status: result.status, statusText: result.statusText });
    } else {
      // Other status codes (403, 429, etc.)
      results.errors.push({ ...filmInfo, status: result.status, statusText: result.statusText });
    }

    checked++;
    if (checked % 50 === 0) {
      console.log(`  Checked ${checked}/${filmsWithLinks.length}...`);
    }

    // Rate limit: ~3 requests per second
    await delay(350);
  }

  // Print report
  console.log('\n');
  console.log('WATCH LINK VALIDATION REPORT');
  console.log('============================');
  console.log(`Total films with links: ${filmsWithLinks.length}`);
  console.log('');
  console.log(`✓ Valid (200): ${results.valid.length}`);
  console.log(`✗ Not Found (404): ${results.notFound.length}`);
  console.log(`⚠ Redirect (3xx): ${results.redirects.length}`);
  console.log(`⏱ Timeout: ${results.timeouts.length}`);
  console.log(`✗ Server Error (5xx): ${results.serverErrors.length}`);
  console.log(`✗ Other Error: ${results.errors.length}`);

  if (results.notFound.length > 0) {
    console.log('\n\nBROKEN LINKS (404):');
    console.log('-------------------');
    results.notFound.forEach(f => {
      console.log(`- "${f.title}" (${f.country || '?'}, ${f.year || '?'})`);
      console.log(`  ${f.url}`);
    });
  }

  if (results.redirects.length > 0) {
    console.log('\n\nREDIRECTS (may need update):');
    console.log('----------------------------');
    results.redirects.forEach(f => {
      console.log(`- "${f.title}" (${f.status})`);
      console.log(`  ${f.url}`);
      if (f.redirectUrl) console.log(`  → ${f.redirectUrl}`);
    });
  }

  if (results.timeouts.length > 0) {
    console.log('\n\nTIMEOUTS:');
    console.log('---------');
    results.timeouts.forEach(f => {
      console.log(`- "${f.title}": ${f.url}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n\nOTHER ERRORS:');
    console.log('-------------');
    results.errors.forEach(f => {
      console.log(`- "${f.title}": ${f.status || 'error'} - ${f.statusText || f.error}`);
      console.log(`  ${f.url}`);
    });
  }

  if (results.serverErrors.length > 0) {
    console.log('\n\nSERVER ERRORS (5xx):');
    console.log('--------------------');
    results.serverErrors.forEach(f => {
      console.log(`- "${f.title}": ${f.status} ${f.statusText}`);
      console.log(`  ${f.url}`);
    });
  }

  // Save report to JSON
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFilms: films.length,
      filmsWithLinks: filmsWithLinks.length,
      valid: results.valid.length,
      notFound: results.notFound.length,
      redirects: results.redirects.length,
      timeouts: results.timeouts.length,
      serverErrors: results.serverErrors.length,
      otherErrors: results.errors.length
    },
    details: {
      notFound: results.notFound,
      redirects: results.redirects,
      timeouts: results.timeouts,
      serverErrors: results.serverErrors,
      otherErrors: results.errors
    }
  };

  writeFileSync('./data/link-report.json', JSON.stringify(report, null, 2));
  console.log('\n\n✅ Report saved to data/link-report.json');
}

validateAllLinks().catch(console.error);
