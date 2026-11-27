/**
 * Standalone RSS feed regenerator.
 *
 * Bypasses the full build-site.js pipeline so feed.xml can ship without
 * waiting on the slow film-page loop (which is iCloud-throttled in this
 * folder). Re-implements just the slugify + getFilmUrl helpers needed
 * to build a film URL and reuses the same RSS generation logic.
 *
 * Usage: node scripts/build-feed-only.js
 */
import { readFileSync, writeFileSync } from 'fs';

const SITE_URL = 'https://animationarchive.netlify.app';
const films = JSON.parse(readFileSync('./data/films.json', 'utf-8'));

function slugify(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getFilmUrl(film) {
  const slug = slugify(film.titleEnglish || film.title || 'untitled');
  return `films/${slug}-${film.id.slice(0, 8)}.html`;
}

const RSS_ITEM_COUNT = 30;
const FEED_URL = `${SITE_URL}/feed.xml`;
const xmlEscape = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const sorted = films
  .filter(f => f.dateAdded)
  .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
  .slice(0, RSS_ITEM_COUNT);

const lastBuildDate = sorted.length > 0
  ? new Date(sorted[0].dateAdded).toUTCString()
  : new Date().toUTCString();

const items = sorted.map(film => {
  const url = `${SITE_URL}/${getFilmUrl(film)}`;
  const title = film.titleEnglish || film.title || 'Untitled';
  const meta = [
    film.year && `${film.year}`, film.country, film.director, film.technique?.[0],
  ].filter(Boolean).join(' · ');
  const synopsis = film.synopsis
    ? (film.synopsis.length > 320 ? film.synopsis.slice(0, 317) + '…' : film.synopsis)
    : '';
  const description = `<p><strong>${xmlEscape(meta)}</strong></p>${synopsis ? `<p>${xmlEscape(synopsis)}</p>` : ''}<p><a href="${xmlEscape(url)}">View in archive</a></p>`;
  const pubDate = new Date(film.dateAdded).toUTCString();
  return `    <item>
      <title>${xmlEscape(title)}${film.year ? ` (${film.year})` : ''}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${pubDate}</pubDate>
      ${film.country ? `<category>${xmlEscape(film.country)}</category>` : ''}
      ${(film.technique || []).map(t => `<category>${xmlEscape(t)}</category>`).join('\n      ')}
      <description>${xmlEscape(description)}</description>
    </item>`;
}).join('\n');

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Global Animation Archive — New Additions</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <description>Recently added animated films in the Global Animation Archive — international focus, verified watch links, ${RSS_ITEM_COUNT} most recent entries.</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>animation-archive build-site.js</generator>
    <ttl>1440</ttl>
${items}
  </channel>
</rss>
`;

writeFileSync('./dist/feed.xml', feed);
console.log(`✓ wrote dist/feed.xml — ${sorted.length} items, latest: ${sorted[0]?.titleEnglish} (${sorted[0]?.year})`);
