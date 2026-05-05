import Parser from 'rss-parser';
import { sha1, sanitizeText } from './utils.js';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; AnimanchRSS/1.0; +https://github.com/amtokyo713/animanch-rss-aggregator)'
  }
});

export async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const items = (parsed.items || [])
    .map(it => {
      const link = it.link || '';
      if (!link) return null;
      const rawDate = it.isoDate || it.pubDate || new Date().toISOString();
      const dt = new Date(rawDate);
      const publishedAt = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
      return {
        id: sha1(link),
        title: sanitizeText(it.title || ''),
        link,
        source: feed.name,
        sourceId: feed.id,
        color: feed.color || '#888888',
        publishedAt
      };
    })
    .filter(it => it && it.title.length > 0);
  return items;
}

export async function fetchAllFeeds(feeds, maxItemsPerFeed = 10) {
  const enabled = feeds.filter(f => f.enabled !== false);
  const results = await Promise.allSettled(enabled.map(f => fetchFeed(f)));
  const successByFeedId = {};
  const failedFeedIds = [];
  results.forEach((r, i) => {
    const feed = enabled[i];
    if (r.status === 'fulfilled') {
      successByFeedId[feed.id] = r.value.slice(0, maxItemsPerFeed);
      console.log(`[OK] ${feed.name}: fetched ${r.value.length}, using ${successByFeedId[feed.id].length}`);
    } else {
      failedFeedIds.push(feed.id);
      const msg = r.reason && r.reason.message ? r.reason.message : String(r.reason);
      console.error(`[FAIL] ${feed.name}: ${msg}`);
    }
  });
  return { successByFeedId, failedFeedIds };
}
