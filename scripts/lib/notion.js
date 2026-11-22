/**
 * Shared Notion access for every data script (fetch, validate, migrate).
 *
 * Notion API 2025-09-03 (client v5) splits each database into one or more
 * "data sources", and queries now target a data source rather than the
 * database. Keeping that shape here means the next API change is a
 * one-file fix instead of four.
 *
 * - The client is created lazily, so scripts can finish loading .env first
 *   (validate-watch-links.js loads dotenv with a dynamic import).
 * - Client v5 is CommonJS without a named export Node can detect, so the
 *   ESM import must go through the default export.
 */
import notionPkg from '@notionhq/client';

const { Client } = notionPkg;

let client;

export function getNotion() {
  if (!client) {
    if (!process.env.NOTION_TOKEN) {
      throw new Error('NOTION_TOKEN is not set (add it to .env locally, or as a GitHub Actions secret).');
    }
    client = new Client({ auth: process.env.NOTION_TOKEN });
  }
  return client;
}

const dataSourceIds = new Map();

/** Resolve (and cache) the data source behind a database ID. */
export async function dataSourceIdFor(databaseId) {
  if (!dataSourceIds.has(databaseId)) {
    const db = await getNotion().databases.retrieve({ database_id: databaseId });
    const sources = db.data_sources || [];
    if (sources.length === 0) {
      throw new Error(`Notion database ${databaseId} has no data sources`);
    }
    if (sources.length > 1) {
      console.warn(`  ⚠ Notion database ${databaseId} has ${sources.length} data sources; using "${sources[0].name}"`);
    }
    dataSourceIds.set(databaseId, sources[0].id);
  }
  return dataSourceIds.get(databaseId);
}

/**
 * Fetch every page in a database, following pagination.
 * `params` accepts the usual query options (filter, sorts).
 * `onBatch(batch, batchNumber, totalSoFar)` is an optional progress hook.
 */
export async function queryAll(databaseId, params = {}, onBatch) {
  const notion = getNotion();
  const data_source_id = await dataSourceIdFor(databaseId);
  const pages = [];
  let start_cursor;
  let batchNumber = 0;
  do {
    const res = await notion.dataSources.query({ data_source_id, page_size: 100, ...params, start_cursor });
    // Queries can also return nested data sources (wikis); keep pages only.
    const batch = res.results.filter(r => r.object === 'page');
    pages.push(...batch);
    batchNumber++;
    if (onBatch) onBatch(batch, batchNumber, pages.length);
    start_cursor = res.has_more ? res.next_cursor : undefined;
  } while (start_cursor);
  return pages;
}
