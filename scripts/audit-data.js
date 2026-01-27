/**
 * Data Consistency Audit
 * Checks for data quality issues, duplicates, and inconsistencies
 * Run: npm run audit
 */

import { readFileSync, writeFileSync } from 'fs';

const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));

// Levenshtein distance for fuzzy string matching
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Normalize string for comparison
function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

// Find similar strings in an array
function findSimilar(items, threshold = 3) {
  const groups = [];
  const processed = new Set();

  for (let i = 0; i < items.length; i++) {
    if (processed.has(items[i])) continue;

    const similar = [items[i]];
    for (let j = i + 1; j < items.length; j++) {
      if (processed.has(items[j])) continue;

      const dist = levenshtein(normalize(items[i]), normalize(items[j]));
      // Also check if one contains the other
      const containsCheck = normalize(items[i]).includes(normalize(items[j])) ||
                           normalize(items[j]).includes(normalize(items[i]));

      if (dist > 0 && (dist <= threshold || containsCheck) && items[i] !== items[j]) {
        similar.push(items[j]);
        processed.add(items[j]);
      }
    }

    if (similar.length > 1) {
      groups.push(similar);
    }
    processed.add(items[i]);
  }

  return groups;
}

function runAudit() {
  console.log('📊 DATA CONSISTENCY AUDIT');
  console.log('=========================\n');
  console.log(`Total films in database: ${films.length}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    totalFilms: films.length,
    missingData: {},
    uniqueValues: {},
    potentialDuplicates: [],
    directorVariations: [],
    countryVariations: [],
    techniqueVariations: []
  };

  // ==========================================
  // MISSING DATA REPORT
  // ==========================================
  console.log('MISSING DATA REPORT');
  console.log('===================');

  const missingYear = films.filter(f => !f.year);
  const missingCountry = films.filter(f => !f.country);
  const missingTechnique = films.filter(f => !f.technique || f.technique.length === 0);
  const missingDirector = films.filter(f => !f.director);
  const missingSynopsis = films.filter(f => !f.synopsis);
  const missingTitle = films.filter(f => !f.titleEnglish);

  console.log(`No title: ${missingTitle.length} films`);
  console.log(`No year: ${missingYear.length} films`);
  console.log(`No country: ${missingCountry.length} films`);
  console.log(`No technique: ${missingTechnique.length} films`);
  console.log(`No director: ${missingDirector.length} films`);
  console.log(`No synopsis: ${missingSynopsis.length} films`);

  report.missingData = {
    noTitle: missingTitle.map(f => ({ id: f.id, originalTitle: f.originalTitle })),
    noYear: missingYear.map(f => ({ id: f.id, title: f.titleEnglish })),
    noCountry: missingCountry.map(f => ({ id: f.id, title: f.titleEnglish, year: f.year })),
    noTechnique: missingTechnique.map(f => ({ id: f.id, title: f.titleEnglish, year: f.year })),
    noDirector: missingDirector.map(f => ({ id: f.id, title: f.titleEnglish, year: f.year })),
    noSynopsis: missingSynopsis.length // Just count, too many to list
  };

  // ==========================================
  // COUNTRY STANDARDIZATION
  // ==========================================
  console.log('\n\nCOUNTRY VALUES');
  console.log('==============');

  const countries = [...new Set(films.map(f => f.country).filter(Boolean))].sort();
  console.log(`Unique countries: ${countries.length}`);
  report.uniqueValues.countries = countries;

  // Known variations to flag
  const countryVariations = [
    ['USSR', 'Soviet Union', 'Russia'],
    ['UK', 'United Kingdom', 'Great Britain', 'England'],
    ['USA', 'United States', 'America'],
    ['Czechoslovakia', 'Czech Republic', 'Czechia'],
    ['East Germany', 'DDR', 'GDR'],
    ['West Germany', 'Germany', 'FRG']
  ];

  const foundCountryVariations = [];
  for (const group of countryVariations) {
    const found = group.filter(c => countries.includes(c));
    if (found.length > 1) {
      foundCountryVariations.push(found);
    }
  }

  if (foundCountryVariations.length > 0) {
    console.log('\n⚠ Potential country variations found:');
    foundCountryVariations.forEach(group => {
      const counts = group.map(c => `${c} (${films.filter(f => f.country === c).length})`);
      console.log(`  - ${counts.join(', ')}`);
    });
    report.countryVariations = foundCountryVariations;
  }

  // ==========================================
  // TECHNIQUE STANDARDIZATION
  // ==========================================
  console.log('\n\nTECHNIQUE VALUES');
  console.log('================');

  const techniques = [...new Set(films.flatMap(f => f.technique || []))].sort();
  console.log(`Unique techniques: ${techniques.length}`);
  techniques.forEach(t => {
    const count = films.filter(f => (f.technique || []).includes(t)).length;
    console.log(`  - ${t}: ${count}`);
  });
  report.uniqueValues.techniques = techniques;

  // Find similar technique names
  const techniqueSimilar = findSimilar(techniques, 2);
  if (techniqueSimilar.length > 0) {
    console.log('\n⚠ Potential technique variations:');
    techniqueSimilar.forEach(group => {
      console.log(`  - ${group.join(' / ')}`);
    });
    report.techniqueVariations = techniqueSimilar;
  }

  // ==========================================
  // DIRECTOR NAME VARIATIONS
  // ==========================================
  console.log('\n\nDIRECTOR NAME ANALYSIS');
  console.log('======================');

  // Get all unique director names (split by comma for multi-director films)
  const allDirectors = [];
  films.forEach(f => {
    if (f.director) {
      f.director.split(',').forEach(d => {
        const trimmed = d.trim();
        if (trimmed && !allDirectors.includes(trimmed)) {
          allDirectors.push(trimmed);
        }
      });
    }
  });

  console.log(`Unique director names: ${allDirectors.length}`);
  report.uniqueValues.directors = allDirectors.length;

  // Find similar director names (potential duplicates/variations)
  const directorSimilar = findSimilar(allDirectors, 4);

  if (directorSimilar.length > 0) {
    console.log(`\n⚠ Potential director name variations (${directorSimilar.length} groups):`);
    // Show first 20 groups
    directorSimilar.slice(0, 20).forEach(group => {
      console.log(`  - ${group.join(' / ')}`);
    });
    if (directorSimilar.length > 20) {
      console.log(`  ... and ${directorSimilar.length - 20} more groups`);
    }
    report.directorVariations = directorSimilar;
  }

  // ==========================================
  // DUPLICATE DETECTION
  // ==========================================
  console.log('\n\nPOTENTIAL DUPLICATES');
  console.log('====================');

  const duplicates = [];
  const seen = new Map();

  films.forEach(film => {
    // Create a key from title + year + country
    const key = `${normalize(film.titleEnglish || film.originalTitle)}-${film.year}-${normalize(film.country)}`;

    if (seen.has(key)) {
      const existing = seen.get(key);
      duplicates.push({
        film1: { id: existing.id, title: existing.titleEnglish, year: existing.year, country: existing.country },
        film2: { id: film.id, title: film.titleEnglish, year: film.year, country: film.country }
      });
    } else {
      seen.set(key, film);
    }
  });

  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} potential duplicate pairs:`);
    duplicates.forEach(d => {
      console.log(`  - "${d.film1.title}" (${d.film1.year}, ${d.film1.country})`);
      console.log(`    IDs: ${d.film1.id.slice(0, 8)} / ${d.film2.id.slice(0, 8)}`);
    });
    report.potentialDuplicates = duplicates;
  } else {
    console.log('No exact duplicates found (same title + year + country)');
  }

  // ==========================================
  // FORMAT/CONFIDENCE DISTRIBUTION
  // ==========================================
  console.log('\n\nDATA DISTRIBUTION');
  console.log('=================');

  // Format distribution
  const formats = {};
  films.forEach(f => {
    const fmt = f.format || 'Unknown';
    formats[fmt] = (formats[fmt] || 0) + 1;
  });
  console.log('Formats:');
  Object.entries(formats).sort((a, b) => b[1] - a[1]).forEach(([fmt, count]) => {
    console.log(`  - ${fmt}: ${count}`);
  });
  report.uniqueValues.formats = formats;

  // Confidence distribution
  const confidence = {};
  films.forEach(f => {
    const conf = f.confidence || 'Unknown';
    confidence[conf] = (confidence[conf] || 0) + 1;
  });
  console.log('\nConfidence levels:');
  Object.entries(confidence).sort((a, b) => b[1] - a[1]).forEach(([conf, count]) => {
    console.log(`  - ${conf}: ${count}`);
  });
  report.uniqueValues.confidence = confidence;

  // ==========================================
  // YEAR RANGE CHECK
  // ==========================================
  console.log('\n\nYEAR RANGE');
  console.log('==========');

  const years = films.filter(f => f.year).map(f => f.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  console.log(`Range: ${minYear} - ${maxYear}`);

  // Flag suspicious years
  const currentYear = new Date().getFullYear();
  const suspiciousYears = films.filter(f => f.year && (f.year < 1880 || f.year > currentYear + 1));
  if (suspiciousYears.length > 0) {
    console.log(`\n⚠ Films with suspicious years:`);
    suspiciousYears.forEach(f => {
      console.log(`  - "${f.titleEnglish}" - Year: ${f.year}`);
    });
    report.suspiciousYears = suspiciousYears.map(f => ({ id: f.id, title: f.titleEnglish, year: f.year }));
  }

  // ==========================================
  // SAVE REPORT
  // ==========================================
  writeFileSync('./data/audit-report.json', JSON.stringify(report, null, 2));

  console.log('\n\n✅ Full report saved to data/audit-report.json');
  console.log('\nReview findings and update data in Notion, then re-fetch with: npm run fetch');
}

runAudit();
