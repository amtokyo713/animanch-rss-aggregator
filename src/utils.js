import crypto from 'node:crypto';

export function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

export function sanitizeText(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || 0;
    const tb = Date.parse(b.publishedAt) || 0;
    return tb - ta;
  });
}
