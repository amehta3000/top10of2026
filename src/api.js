// Client for our own /api functions.

const cache = new Map();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function searchTracks(q, signal) {
  const key = q.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || 'Search failed.');
  cache.set(key, body.tracks);
  return body.tracks;
}

export async function getGroup() {
  try {
    const res = await fetch('/api/group', { cache: 'no-store' });
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false };
  }
}

function submissionId() {
  let sid = localStorage.getItem('top10.sid');
  if (!sid) {
    sid = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem('top10.sid', sid);
  }
  return sid;
}

export async function submitPicks(story) {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sid: submissionId(),
      name: story.name,
      tracks: story.tracks.map(({ id, title, artist, thumb, imageUrl }) => ({ id, title, artist, thumb: thumb || imageUrl })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || 'Could not add your picks.');
  return body;
}

export async function saveGroupPlaylist(playlistId, adminKey) {
  const res = await fetch('/api/group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify({ playlistId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || 'Could not save.');
}

export const playlistUrl = (id) => `https://open.spotify.com/playlist/${id}`;
