// Turn Spotify's three "top tracks" windows into a single year ranking,
// keeping only tracks whose album release date falls in the target year.
//
// long_term  ≈ last ~12 months  → best proxy for "the year", weighted highest
// medium_term ≈ last ~6 months
// short_term  ≈ last ~4 weeks   → small tiebreaker for what's hot right now

export const YEAR = 2026;
const WEIGHTS = { long_term: 3, medium_term: 2, short_term: 1 };

export const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/\s*[([](feat|ft|with)\.?[^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+(radio edit|single version|explicit|clean)$/i, '')
    .trim();

export function releasedIn(track, year = YEAR) {
  return String(track?.album?.release_date || '').startsWith(String(year));
}

export function rankYear(byRange, year = YEAR, limit = 10) {
  const entries = new Map();
  const seen = new Set();

  for (const [range, items] of Object.entries(byRange)) {
    const w = WEIGHTS[range] ?? 1;
    const n = Math.max(items.length, 1);
    items.forEach((t, i) => {
      if (!t) return;
      seen.add(t.id);
      if (!releasedIn(t, year)) return;
      // Same song can appear as a single and an album cut with different IDs: merge them.
      const key = `${normalize(t.name)}|${t.artists?.[0]?.id ?? ''}`;
      const points = w * (1 - i / (n + 1)) * 100;
      const e = entries.get(key);
      if (e) e.score += points;
      else entries.set(key, { track: t, score: points });
    });
  }

  const ranked = [...entries.values()].sort((a, b) => b.score - a.score);
  const matchedIds = new Set();
  for (const items of Object.values(byRange)) items.forEach((t) => releasedIn(t, year) && matchedIds.add(t.id));

  return {
    tracks: ranked.slice(0, limit).map(({ track }) => toCardTrack(track)),
    stats: { scanned: seen.size, matched: matchedIds.size },
  };
}

/** Same song released as a single and on an album has different IDs; this key matches them. */
export const songKey = (title, artist) => `${normalize(title || '')}|${String(artist || '').toLowerCase().split(',')[0].trim()}`;

export function toCardTrack(t) {
  const imgs = [...(t.album?.images || [])].sort((a, b) => (b.width || 0) - (a.width || 0));
  const thumb = [...imgs].reverse().find((i) => (i.width || 0) >= 64) || imgs[imgs.length - 1];
  return {
    id: t.id,
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).slice(0, 2).join(', '),
    imageUrl: imgs[0]?.url || null,
    thumb: thumb?.url || null,
    releaseDate: t.album?.release_date || String(YEAR),
  };
}
