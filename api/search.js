// GET /api/search?q=... → tracks released in 2026 matching the query.
// Uses the app's own token, so searchers never log in and don't count toward
// Spotify's 5-user Development Mode cap. Results are cached in memory and at the CDN
// because every search draws from the same developer-account quota.

import { appToken, json, YEAR } from './_lib.js';
import { toCardTrack, songKey } from '../src/rank.js';

const cache = new Map();

/**
 * Keep 2026 releases, one entry per song. When a song exists as a single and
 * on a later album, show the earliest release (the real release date and the
 * cover people know), in the position where the song first appeared.
 */
function collapse(items) {
  const order = [];
  const best = new Map();
  for (const t of items) {
    if (!t || !String(t.album?.release_date || '').startsWith(YEAR)) continue;
    const card = toCardTrack(t);
    const k = songKey(card.title, card.artist);
    const cur = best.get(k);
    if (!cur) {
      order.push(k);
      best.set(k, card);
    } else if (card.releaseDate < cur.releaseDate) {
      best.set(k, card);
    }
  }
  return order.map((k) => best.get(k));
}
const TTL = 60 * 60 * 1000;

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 2) return json({ tracks: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };
  if (hit && hit.exp > Date.now()) return json({ tracks: hit.tracks }, 200, cacheHeaders);

  let token;
  try {
    token = await appToken();
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }

  const page = async (offset) => {
    const params = new URLSearchParams({ q: `${q} year:${YEAR}`, type: 'track', limit: '10', offset: String(offset) });
    const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw Object.assign(new Error(`Spotify search failed (${res.status}).`), { status: res.status, res });
    return (await res.json()).tracks?.items || [];
  };

  let items;
  try {
    items = await page(0);
    // Spotify caps a page at 10; after dropping other years and duplicates a page
    // can get thin, so fetch one more page only when needed.
    if (items.length === 10 && collapse(items).length < 7) items = items.concat(await page(10).catch(() => []));
  } catch (e) {
    if (e.status === 429) {
      return json({ error: 'Spotify is busy, try again in a moment.' }, 429, {
        'Retry-After': e.res?.headers.get('Retry-After') || '5',
      });
    }
    return json({ error: e.message }, 502);
  }
  const tracks = collapse(items);

  cache.set(key, { tracks, exp: Date.now() + TTL });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return json({ tracks }, 200, cacheHeaders);
}
