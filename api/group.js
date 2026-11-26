// GET  /api/group → { enabled, playlistId, submissions: [{name, tracks, at}] }
// POST /api/group { playlistId } with header x-admin-key: ADMIN_KEY → saves the group playlist id

import { json, redis, storeEnabled } from './_lib.js';

export async function GET() {
  if (!storeEnabled()) return json({ enabled: false });
  const flat = (await redis('HGETALL', 'top10:submissions')) || [];
  const submissions = [];
  for (let i = 1; i < flat.length; i += 2) {
    try {
      submissions.push(JSON.parse(flat[i]));
    } catch { /* skip corrupt entry */ }
  }
  submissions.sort((a, b) => a.at - b.at);
  const playlistId = process.env.GROUP_PLAYLIST_ID || (await redis('GET', 'top10:playlist')) || null;
  return json({ enabled: true, playlistId, submissions }, 200, { 'Cache-Control': 'no-store' });
}

export async function POST(request) {
  if (!storeEnabled()) return json({ error: 'Store not configured.' }, 501);
  const key = process.env.ADMIN_KEY;
  if (!key || request.headers.get('x-admin-key') !== key) return json({ error: 'Wrong admin key.' }, 401);
  const { playlistId } = await request.json().catch(() => ({}));
  if (!/^[A-Za-z0-9]{22}$/.test(playlistId || '')) return json({ error: 'Bad playlist id.' }, 400);
  await redis('SET', 'top10:playlist', playlistId);
  return json({ ok: true });
}
