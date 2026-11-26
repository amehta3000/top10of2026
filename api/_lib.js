// Shared helpers for the serverless functions (Vercel Node runtime, Web-standard handlers).

export const YEAR = '2026';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// ---------- Spotify app token (Client Credentials) ----------
// Lets anyone search without logging in. Secret stays on the server.
let cached = null;

export async function appToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const id = process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw Object.assign(new Error('Search is not configured (missing SPOTIFY_CLIENT_SECRET).'), { status: 501 });
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw Object.assign(new Error('Spotify app auth failed.'), { status: 502 });
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

// ---------- Store: Upstash Redis over REST, or in-memory in local dev ----------
const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = (globalThis.__top10mem ||= { h: new Map(), k: new Map() });

export const storeEnabled = () => Boolean(redisUrl() && redisToken()) || process.env.DEV_MEMORY_STORE === '1';

export async function redis(...args) {
  if (redisUrl() && redisToken()) {
    const r = await fetch(redisUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  // Minimal in-memory implementation of the few commands we use (dev only).
  const [op, key, ...rest] = args;
  const hash = () => mem.h.get(key) || mem.h.set(key, new Map()).get(key);
  switch (op) {
    case 'HSET': hash().set(rest[0], rest[1]); return 1;
    case 'HGETALL': return [...hash().entries()].flat();
    case 'HDEL': return hash().delete(rest[0]) ? 1 : 0;
    case 'GET': return mem.k.get(key) ?? null;
    case 'SET': mem.k.set(key, rest[0]); return 'OK';
    case 'INCR': { const v = Number(mem.k.get(key) || 0) + 1; mem.k.set(key, v); return v; }
    case 'EXPIRE': setTimeout(() => mem.k.delete(key), Number(rest[0]) * 1000).unref?.(); return 1;
    default: throw new Error(`unsupported ${op}`);
  }
}

export const clientIp = (request) =>
  (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();

export async function rateLimit(request, bucket, max, windowSec) {
  const key = `rl:${bucket}:${clientIp(request)}`;
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n <= max;
}
