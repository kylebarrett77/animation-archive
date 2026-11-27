/**
 * Title matching shared by the data-linking scripts (source-posters.js,
 * check-imdb-links.js): normalised title similarity, a film's known titles,
 * and sequel/part-marker detection.
 */

/**
 * Lowercase, strip accents, a possessive credit before "The" ("J. R. R.
 * Tolkien's The Hobbit" -> "The Hobbit"; "Kiki's Delivery Service" is left
 * alone), parentheticals, punctuation and a leading "the".
 */
export const norm = t => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  .replace(/^[\p{L}\p{N}.\s-]{1,40}?['’]s\s+(?=the\s)/u, '')
  .replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, '').trim();

/** 1 for equal titles, length ratio when one contains the other, else word overlap. */
export function titleSimilarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  const inter = [...A].filter(w => B.has(w)).length;
  return inter / new Set([...A, ...B]).size;
}

/** Every title a film is known by (English, original, romanized, alternates). */
export const filmNames = film => [
  film.titleEnglish, film.originalTitle, film.romanizedTitle,
  ...String(film.alternateTitles || '').split(/[;,|\n]/),
].map(s => s && s.trim()).filter(Boolean);

/** Best similarity between any of the film's titles and any candidate title. */
export const bestTitleMatch = (film, ...candidates) =>
  Math.max(0, ...filmNames(film).flatMap(n => candidates.filter(Boolean).map(c => titleSimilarity(n, c))));

// Sequel / part markers: "Tekkaman Blade II" must not match the parent
// "Tekkaman Blade". ("new"/"next" are left out: too common in real titles.)
const SEQUEL_TOKEN = /^(ii|iii|iv|v|vi|vii|viii|ix|x|\d+|part|season|movie|film|final|chapter|episode|ova|special|returns|reborn|zero|sequel|gaiden|kai|shippuden)$/;

/** Sequel/part tokens in the film title that the other title lacks. */
export function sequelMismatch(filmTitle, otherTitle) {
  const other = new Set(norm(otherTitle).split(' '));
  return norm(filmTitle).split(' ').filter(t => t && !other.has(t) && SEQUEL_TOKEN.test(t));
}

/** First IMDb title ID (tt…) in a string or URL, or null. */
export const imdbIdOf = v => (String(v || '').match(/tt\d{6,10}/) || [])[0] || null;
