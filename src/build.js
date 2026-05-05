import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllFeeds } from './fetch.js';
import { dedupeById, sortByDateDesc } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FEEDS_PATH = path.join(ROOT, 'public', 'feeds.json');
const DATA_PATH = path.join(ROOT, 'public', 'data.json');

async function readJsonOrDefault(filePath, defaultValue) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return defaultValue;
  }
}

async function main() {
  const feedsConfig = await readJsonOrDefault(FEEDS_PATH, null);
  if (!feedsConfig || !Array.isArray(feedsConfig.feeds)) {
    console.error('feeds.json not found or invalid');
    process.exit(1);
  }
  const settings = feedsConfig.settings || {};
  const maxItemsPerFeed = settings.maxItemsPerFeed ?? 10;
  const displayCount = settings.displayCount ?? 20;
  const ttlHours = settings.ttlHours ?? 168;

  const previous = await readJsonOrDefault(DATA_PATH, { items: [] });
  const previousByFeedId = {};
  for (const it of previous.items || []) {
    if (!previousByFeedId[it.sourceId]) previousByFeedId[it.sourceId] = [];
    previousByFeedId[it.sourceId].push(it);
  }

  console.log(`Fetching ${feedsConfig.feeds.length} feed(s)...`);
  const { successByFeedId, failedFeedIds } = await fetchAllFeeds(feedsConfig.feeds, maxItemsPerFeed);

  const merged = [];
  for (const feed of feedsConfig.feeds) {
    if (feed.enabled === false) continue;
    if (successByFeedId[feed.id]) {
      merged.push(...successByFeedId[feed.id]);
    } else if (previousByFeedId[feed.id]) {
      merged.push(...previousByFeedId[feed.id]);
      console.log(`[KEEP] ${feed.name}: kept ${previousByFeedId[feed.id].length} items from previous data.json`);
    }
  }

  const now = Date.now();
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const fresh = merged.filter(it => {
    const t = Date.parse(it.publishedAt);
    return Number.isFinite(t) && (now - t) < ttlMs;
  });

  const sorted = sortByDateDesc(dedupeById(fresh)).slice(0, displayCount);

  const output = {
    generatedAt: new Date().toISOString(),
    items: sorted
  };

  await fs.writeFile(DATA_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${sorted.length} items to ${path.relative(ROOT, DATA_PATH)}`);

  const allFailedAndNoPrev = failedFeedIds.length > 0
    && Object.keys(successByFeedId).length === 0
    && (previous.items || []).length === 0;
  if (allFailedAndNoPrev) {
    console.error('All feeds failed and no previous data — exiting with error');
    process.exit(2);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
