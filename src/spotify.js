// Spotify Authorization Code + PKCE, entirely client-side (no secret, no server).
// Implicit grant was removed by Spotify in Nov 2025, so PKCE is the only option for a SPA.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/`;
const TOKEN_KEY = 'top10.token';

// What the person was doing when they logged in decides the scopes we ask for.
const SCOPES = {
  autofill: 'user-top-read playlist-modify-private',
  admin: 'user-top-read playlist-modify-public playlist-modify-private',
};

export const isConfigured = () => Boolean(CLIENT_ID);

export class SpotifyError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'not_allowlisted' | 'quota' | 'auth' | 'network' | 'denied'
  }
}

function b64url(bytes) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(n = 64) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(new Uint8Array(buf));
}

export async function login(intent = 'autofill') {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem('top10.verifier', verifier);
  sessionStorage.setItem('top10.state', state);
  sessionStorage.setItem('top10.intent', intent);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES[intent] || SCOPES.autofill,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await sha256(verifier),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/** If the URL is a Spotify callback, finishes login and returns the intent ('autofill' | 'admin'); else null. */
export async function handleCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  // Clean the URL right away so a refresh doesn't replay the code.
  window.history.replaceState({}, '', url.pathname + url.hash);

  if (error) throw new SpotifyError('denied', 'Spotify access was not granted.');

  const state = url.searchParams.get('state');
  if (state !== sessionStorage.getItem('top10.state')) {
    throw new SpotifyError('auth', 'Login state mismatch. Please try again.');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: sessionStorage.getItem('top10.verifier') || '',
    }),
  });
  if (!res.ok) throw new SpotifyError('auth', 'Could not finish signing in with Spotify.');
  const json = await res.json();
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token: json.access_token, exp: Date.now() + json.expires_in * 1000 - 30_000 })
  );
  sessionStorage.removeItem('top10.verifier');
  sessionStorage.removeItem('top10.state');
  return sessionStorage.getItem('top10.intent') || 'autofill';
}

export function hasToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    return t && t.exp > Date.now();
  } catch {
    return false;
  }
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function token() {
  const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
  if (!t || t.exp < Date.now()) throw new SpotifyError('auth', 'Your Spotify session expired.');
  return t.token;
}

async function api(pathOrUrl, opts = {}, retried = false) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.spotify.com/v1${pathOrUrl}`;
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { Authorization: `Bearer ${token()}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (e instanceof SpotifyError) throw e;
    throw new SpotifyError('network', 'Network error talking to Spotify.');
  }
  if (res.ok) {
    const text = await res.text(); // some writes return an empty body
    return text ? JSON.parse(text) : null;
  }

  if (res.status === 401) {
    logout();
    throw new SpotifyError('auth', 'Your Spotify session expired.');
  }
  if (res.status === 403) {
    // Development Mode apps return 403 for users not on the app's allowlist.
    throw new SpotifyError('not_allowlisted', 'This Spotify account is not enabled for this app yet.');
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    if (body?.error?.reason === 'QUOTA_EXCEEDED') {
      throw new SpotifyError('quota', 'This app hit its Spotify usage quota. Try again later.');
    }
    if (!retried) {
      const wait = Math.min(Number(res.headers.get('Retry-After') || 2), 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return api(pathOrUrl, opts, true);
    }
  }
  throw new SpotifyError('network', `Spotify returned ${res.status}.`);
}

export async function getProfile() {
  const me = await api('/me');
  return { name: me.display_name || me.id };
}

// ---------- playlists ----------
export async function createPlaylist(name, description, isPublic = false) {
  const p = await api('/me/playlists', { method: 'POST', body: { name, description, public: isPublic } });
  return { id: p.id, url: p.external_urls?.spotify };
}

export async function updatePlaylist(playlistId, details) {
  await api(`/playlists/${playlistId}`, { method: 'PUT', body: details });
}

export async function playlistTrackIds(playlistId) {
  const ids = new Set();
  let next = `/playlists/${playlistId}/items?limit=50`;
  while (next) {
    const page = await api(next);
    for (const it of page.items || []) {
      const t = it.item || it.track; // field was renamed track → item in Feb 2026
      if (t?.id) ids.add(t.id);
    }
    next = page.next;
  }
  return ids;
}

export async function addToPlaylist(playlistId, trackIds) {
  for (let i = 0; i < trackIds.length; i += 100) {
    await api(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: { uris: trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`) },
    });
  }
}

export const RANGES =['long_term', 'medium_term', 'short_term'];

/**
 * Pulls the user's top tracks for each time range (up to ~100 per range).
 * onBatch(range, items) is called as each page arrives so the UI can animate.
 */
export async function getTopTracks(onBatch) {
  const out = {};
  for (const range of RANGES) {
    out[range] = [];
    let next = `/me/top/tracks?time_range=${range}&limit=50`;
    let pages = 0;
    while (next && pages < 2) {
      let page;
      try {
        page = await api(next);
      } catch (e) {
        if (pages > 0 && e.kind === 'network') break; // second page is best-effort
        throw e;
      }
      out[range].push(...page.items);
      onBatch?.(range, page.items);
      next = page.next;
      pages++;
    }
  }
  return out;
}
