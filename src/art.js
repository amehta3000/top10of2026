// Album-art loading, palette extraction, and generated fallback covers.

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// Push colors into a range that glows nicely on a near-black background.
function vivid(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb(h, Math.max(s, 0.5), Math.min(Math.max(l, 0.42), 0.62));
}

export function seededPalette(seed) {
  const r = rng(seed);
  const h = r() * 360;
  return [hslToRgb(h, 0.75, 0.55), hslToRgb((h + 40 + r() * 40) % 360, 0.7, 0.5), hslToRgb((h + 180 + r() * 60) % 360, 0.65, 0.5)];
}

export function extractPalette(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data; // throws if tainted
  const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    const w = s * (1 - Math.abs(l - 0.5) * 1.6) + 0.02;
    if (w <= 0) continue;
    const bk = buckets[Math.floor(h / 30) % 12];
    bk.w += w; bk.r += rgb[0] * w; bk.g += rgb[1] * w; bk.b += rgb[2] * w;
  }
  const top = buckets.filter((b) => b.w > 0).sort((a, b) => b.w - a.w).slice(0, 3)
    .map((b) => vivid([b.r / b.w, b.g / b.w, b.b / b.w]));
  while (top.length < 3) {
    const [h, s, l] = rgbToHsl(top[0] || [200, 80, 200]);
    top.push(hslToRgb((h + 50 * top.length) % 360, Math.max(s, 0.55), l || 0.5));
  }
  return top;
}

/** Abstract generative cover used in demo mode or when art fails to load. */
export function generateCover(seed, size = 640) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const pal = seededPalette(seed);
  const css = (p, a = 1) => `rgba(${p[0]},${p[1]},${p[2]},${a})`;

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, css(pal[0]));
  g.addColorStop(1, css(pal[1]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const style = Math.floor(r() * 3);
  ctx.globalCompositeOperation = 'overlay';
  if (style === 0) {
    // concentric rings
    const cx = size * (0.3 + r() * 0.4), cy = size * (0.3 + r() * 0.4);
    for (let i = 14; i > 0; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, (i / 14) * size * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? css(pal[2], 0.55) : 'rgba(0,0,0,0.25)';
      ctx.fill();
    }
  } else if (style === 1) {
    // stripes
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(r() * Math.PI);
    for (let i = -12; i < 12; i++) {
      ctx.fillStyle = i % 2 ? css(pal[2], 0.6) : 'rgba(255,255,255,0.15)';
      ctx.fillRect(i * size * 0.06, -size, size * 0.03 + r() * size * 0.03, size * 2);
    }
    ctx.restore();
  } else {
    // blobs
    for (let i = 0; i < 7; i++) {
      const x = r() * size, y = r() * size, rad = size * (0.15 + r() * 0.35);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, css(pal[i % 3], 0.9));
      rg.addColorStop(1, css(pal[i % 3], 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, size, size);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // tiny grain
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // keeps the canvas exportable
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadAssets(tracks) {
  return Promise.all(
    tracks.map(async (t) => {
      const seed = hash(`${t.title}|${t.artist}`);
      let img = null;
      let palette = null;
      if (t.imageUrl) {
        img = await loadImage(t.imageUrl).catch(() => null);
        if (img) {
          try { palette = extractPalette(img); } catch { img = null; }
        }
      }
      if (!img) {
        img = generateCover(seed);
        palette = seededPalette(seed);
      }
      return { img, palette, seed };
    })
  );
}

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('800 100px "Bricolage Grotesque"'),
      document.fonts.load('600 100px "Bricolage Grotesque"'),
      document.fonts.load('400 40px "JetBrains Mono"'),
      document.fonts.load('600 40px "JetBrains Mono"'),
    ]);
  } catch { /* fall back to system fonts */ }
}
