// Share links carry the whole result in the URL hash (deflate + base64url),
// so anyone can open and watch it without logging in, and no server or DB is needed.

const IMG_PREFIX = 'https://i.scdn.co/image/';

function toB64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeStory(story) {
  const compact = {
    v: 1,
    m: story.mode === 'played' ? 'p' : 'k',
    n: story.name || '',
    y: story.year,
    s: story.stats ? [story.stats.scanned, story.stats.matched] : null,
    t: story.tracks.map((t) => [
      t.title,
      t.artist,
      t.imageUrl?.startsWith(IMG_PREFIX) ? t.imageUrl.slice(IMG_PREFIX.length) : '',
      t.releaseDate,
      t.id || '',
    ]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  return toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeStory(str) {
  const bytes = await pipe(fromB64url(str), new DecompressionStream('deflate-raw'));
  const c = JSON.parse(new TextDecoder().decode(bytes));
  if (c.v !== 1 || !Array.isArray(c.t)) throw new Error('bad payload');
  return {
    mode: c.m === 'p' ? 'played' : 'picked',
    name: String(c.n || '').slice(0, 40),
    year: Number(c.y) || 2026,
    stats: c.s ? { scanned: Number(c.s[0]), matched: Number(c.s[1]) } : null,
    tracks: c.t.slice(0, 10).map(([title, artist, img, releaseDate, id]) => ({
      title: String(title).slice(0, 200),
      artist: String(artist).slice(0, 200),
      imageUrl: /^[a-f0-9]{20,64}$/i.test(img || '') ? IMG_PREFIX + img : null,
      releaseDate: String(releaseDate || ''),
      id: /^[A-Za-z0-9]{10,30}$/.test(id || '') ? id : '',
    })),
  };
}

export async function shareUrl(story) {
  return `${window.location.origin}${window.location.pathname}#s=${await encodeStory(story)}`;
}
