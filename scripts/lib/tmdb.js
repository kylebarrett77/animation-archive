/**
 * Minimal TMDB client shared by source-posters.js and check-imdb-links.js.
 * Auth: TMDB_TOKEN (v4 read access token, preferred) or TMDB_API_KEY (v3).
 * Reads the environment lazily, so callers can load .env first.
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

export const hasTmdb = () => Boolean(process.env.TMDB_TOKEN || process.env.TMDB_API_KEY);
export const yearOf = d => (d ? Number(String(d).slice(0, 4)) : null);
export const posterUrl = path => `https://image.tmdb.org/t/p/w780${path}`;

export async function tmdb(path, params = {}) {
  const token = process.env.TMDB_TOKEN || '';
  const key = process.env.TMDB_API_KEY || '';
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  if (!token) url.searchParams.set('api_key', key);
  const headers = token ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 401) throw new Error('TMDB rejected the key (401). Check TMDB_TOKEN / TMDB_API_KEY.');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${path} -> HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`TMDB ${path} -> rate limited`);
}

/** What TMDB says an IMDb ID is: { id, type, title, original, year, poster } or null. */
export async function tmdbFindImdb(imdbId) {
  const r = await tmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
  const hit = r && [...(r.movie_results || []), ...(r.tv_results || [])][0];
  if (!hit) return null;
  return {
    id: hit.id,
    type: hit.title ? 'movie' : 'tv',
    title: hit.title || hit.name || '',
    original: hit.original_title || hit.original_name || '',
    year: yearOf(hit.release_date || hit.first_air_date),
    poster: hit.poster_path || null,
  };
}

/** IMDb ID TMDB has on record for one of its titles, or null. */
export async function tmdbImdbIdFor(type, id) {
  const r = await tmdb(`/${type}/${id}/external_ids`);
  return (r && r.imdb_id) || null;
}
