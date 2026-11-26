// GET /api/search?q=... → tracks released in 2026 matching the query.
// Uses the app's own token, so searchers never log in and don't count toward
// Spotify's 5-user Development Mode cap. Results are cached in memory and at the CDN
// because every search draws from the same developer-account quota.

import { appToken, json, YEAR } from './_lib.js';
import { toCardTrack, songKey } from '../src/rank.js';

const cache = new Map();
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

  const params = new URLSearchParams({ q: `${q} year:${YEAR}`, type: 'track', limit: '10' });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    return json({ error: 'Spotify is busy, try again in a moment.' }, 429, {
      'Retry-After': res.headers.get('Retry-After') || '5',
    });
  }
  if (!res.ok) return json({ error: `Spotify search failed (${res.status}).` }, 502);

  const data = await res.json();
  const tracks = (data.tracks?.items || [])
    .filter((t) => t && String(t.album?.release_date || '').startsWith(YEAR))
    .map(toCardTrack)
    // keep the first (most relevant) copy of each song
    .filter((t, i, all) => all.findIndex((o) => songKey(o.title, o.artist) === songKey(t.title, t.artist)) === i);

  cache.set(key, { tracks, exp: Date.now() + TTL });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return json({ tracks }, 200, cacheHeaders);
}
