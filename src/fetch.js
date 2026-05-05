import Parser from 'rss-parser';
import crypto from 'node:crypto';
import { sha1, sanitizeText } from './utils.js';

const UA = 'Mozilla/5.0 (compatible; AnimanchRSS/1.0; +https://github.com/amtokyo713/animanch-rss-aggregator)';

const parser = new Parser({
  customFields: {
    item: [
      ['link', 'links', { keepArray: true }]
    ]
  }
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, prevMeta) {
  const headers = { 'User-Agent': UA, 'Accept': 'application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8' };
  if (prevMeta && prevMeta.etag) headers['If-None-Match'] = prevMeta.etag;
  if (prevMeta && prevMeta.lastModified) headers['If-Modified-Since'] = prevMeta.lastModified;

  const delays = [0, 500, 1500];
  let lastError = null;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 304) {
        return { unchanged: true, etag: prevMeta?.etag || null, lastModified: prevMeta?.lastModified || null, contentHash: prevMeta?.contentHash || null };
      }
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const contentHash = crypto.createHash('sha1').update(xml).digest('hex');
      const etag = res.headers.get('etag') || null;
      const lastModified = res.headers.get('last-modified') || null;
      const unchanged = !!(prevMeta && prevMeta.contentHash === contentHash);
      return { unchanged, xml, contentHash, etag, lastModified };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('fetch failed');
}

function pickThumbnail(item) {
  if (Array.isArray(item.links)) {
    for (const l of item.links) {
      const a = l && l.$ ? l.$ : null;
      if (a && a.rel === 'enclosure' && typeof a.href === 'string' && (typeof a.type === 'string' && a.type.indexOf('image/') === 0)) {
        return a.href;
      }
    }
  }
  if (item.enclosure && item.enclosure.url) {
    const t = item.enclosure.type || '';
    if (t.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(item.enclosure.url)) {
      return item.enclosure.url;
    }
  }
  if (item['media:thumbnail'] && item['media:thumbnail'].$) {
    return item['media:thumbnail'].$.url || null;
  }
  return null;
}

function pickPrimaryLink(item) {
  if (typeof item.link === 'string' && item.link) return item.link;
  if (Array.isArray(item.links)) {
    for (const l of item.links) {
      const a = l && l.$ ? l.$ : null;
      if (a && (!a.rel || a.rel === 'alternate') && typeof a.href === 'string') return a.href;
    }
    for (const l of item.links) {
      const a = l && l.$ ? l.$ : null;
      if (a && typeof a.href === 'string' && a.rel !== 'enclosure') return a.href;
    }
  }
  return '';
}

export async function fetchFeed(feed, prevMeta) {
  const result = await fetchWithRetry(feed.url, prevMeta);
  if (result.unchanged) {
    return { unchanged: true, etag: result.etag, lastModified: result.lastModified, contentHash: result.contentHash };
  }

  const parsed = await parser.parseString(result.xml);
  const items = (parsed.items || [])
    .map(it => {
      const link = pickPrimaryLink(it);
      if (!link) return null;
      const rawDate = it.isoDate || it.pubDate || it.updated || new Date().toISOString();
      const dt = new Date(rawDate);
      const publishedAt = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
      return {
        id: sha1(link),
        title: sanitizeText(it.title || ''),
        link,
        source: feed.name,
        sourceId: feed.id,
        color: feed.color || '#888888',
        publishedAt,
        thumbnail: pickThumbnail(it),
        author: sanitizeText(it.creator || it.author || '')
      };
    })
    .filter(it => it && it.title.length > 0);

  return {
    unchanged: false,
    items,
    etag: result.etag,
    lastModified: result.lastModified,
    contentHash: result.contentHash
  };
}

export async function fetchAllFeeds(feeds, prevMetaByFeedId, maxItemsPerFeed = 10) {
  const enabled = feeds.filter(f => f.enabled !== false);
  const results = await Promise.allSettled(enabled.map(f => fetchFeed(f, prevMetaByFeedId[f.id])));

  const successByFeedId = {};
  const newMetaByFeedId = {};
  const failedFeedIds = [];
  const unchangedFeedIds = [];

  results.forEach((r, i) => {
    const feed = enabled[i];
    const prevMeta = prevMetaByFeedId[feed.id] || {};
    const now = new Date().toISOString();

    if (r.status === 'fulfilled') {
      const v = r.value;
      if (v.unchanged) {
        unchangedFeedIds.push(feed.id);
        newMetaByFeedId[feed.id] = {
          lastFetchedAt: now,
          lastSuccessAt: now,
          consecutiveFailures: 0,
          lastError: null,
          itemCount: prevMeta.itemCount || 0,
          etag: v.etag || null,
          lastModified: v.lastModified || null,
          contentHash: v.contentHash || null
        };
        console.log(`[UNCHANGED] ${feed.name}: content hash unchanged, reuse previous items`);
      } else {
        const items = v.items.slice(0, maxItemsPerFeed);
        successByFeedId[feed.id] = items;
        newMetaByFeedId[feed.id] = {
          lastFetchedAt: now,
          lastSuccessAt: now,
          consecutiveFailures: 0,
          lastError: null,
          itemCount: items.length,
          etag: v.etag || null,
          lastModified: v.lastModified || null,
          contentHash: v.contentHash || null
        };
        console.log(`[OK] ${feed.name}: fetched ${v.items.length}, using ${items.length}`);
      }
    } else {
      failedFeedIds.push(feed.id);
      const msg = r.reason && r.reason.message ? r.reason.message : String(r.reason);
      newMetaByFeedId[feed.id] = {
        lastFetchedAt: now,
        lastSuccessAt: prevMeta.lastSuccessAt || null,
        consecutiveFailures: (prevMeta.consecutiveFailures || 0) + 1,
        lastError: msg.slice(0, 200),
        itemCount: prevMeta.itemCount || 0,
        etag: prevMeta.etag || null,
        lastModified: prevMeta.lastModified || null,
        contentHash: prevMeta.contentHash || null
      };
      console.error(`[FAIL] ${feed.name}: ${msg}`);
    }
  });

  return { successByFeedId, newMetaByFeedId, failedFeedIds, unchangedFeedIds };
}
