// POST /api/submit  { sid, name, tracks: [{id,title,artist,thumb}] }
// Adds (or replaces, keyed by sid) one person's list in the group pool.

import { json, redis, storeEnabled, rateLimit } from './_lib.js';

const ID = /^[A-Za-z0-9]{22}$/;
const IMG = /^https:\/\/i\.scdn\.co\/image\/[a-f0-9]+$/i;

export async function POST(request) {
  if (!storeEnabled()) return json({ error: 'The group playlist is not set up.' }, 501);
  if (!(await rateLimit(request, 'submit', 20, 3600))) return json({ error: 'Too many submissions. Try later.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }

  const sid = String(body.sid || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(sid)) return json({ error: 'Bad request.' }, 400);

  const name = String(body.name || '').trim().slice(0, 40) || 'Anonymous';
  const tracks = (Array.isArray(body.tracks) ? body.tracks : [])
    .slice(0, 10)
    .filter((t) => ID.test(t?.id || ''))
    .map((t) => ({
      id: t.id,
      title: String(t.title || '').slice(0, 160),
      artist: String(t.artist || '').slice(0, 160),
      thumb: IMG.test(t.thumb || '') ? t.thumb : null,
    }));
  if (!tracks.length) return json({ error: 'No valid tracks.' }, 400);

  await redis('HSET', 'top10:submissions', sid, JSON.stringify({ name, tracks, at: Date.now() }));
  return json({ ok: true });
}
