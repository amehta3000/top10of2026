// Deterministic canvas renderer: renderFrame(ctx, t, story, assets) draws the
// frame at time t (seconds). The same function drives on-screen playback,
// video recording, and the still image export.

import { rng } from './art.js';

export const W = 1080;
export const H = 1920;
const FD = '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif';
const FM = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const INK = '#f4f1ea';

// ---------- timing ----------
const INTRO = 2.6;
const PER = 1.25;
const NUMBER_ONE = 3.0;
const OUTRO = 5.0;

export function buildTimeline(n) {
  const segs = [];
  let t = 0;
  segs.push({ type: 'intro', start: t, dur: INTRO });
  t += INTRO;
  for (let i = n - 1; i >= 0; i--) {
    const dur = i === 0 ? NUMBER_ONE : PER;
    segs.push({ type: 'track', index: i, start: t, dur });
    t += dur;
  }
  segs.push({ type: 'outro', start: t, dur: OUTRO });
  t += OUTRO;
  return { segs, total: t };
}

// ---------- math helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const span = (u, a, b) => clamp((u - a) / (b - a));
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const inCubic = (t) => t * t * t;
const outExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const outBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------- text helpers ----------
function fitFont(ctx, text, weight, family, maxSize, minSize, maxW) {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

function wrap(ctx, text, maxW, maxLines) {
  const tokens = [];
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(word).width <= maxW) tokens.push(word);
    else tokens.push(...Array.from(word)); // CJK / very long words: break by character
  }
  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const sep = line && !/^[　-鿿가-힯]$/.test(tok) ? ' ' : '';
    const test = line + sep + tok;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else {
      lines.push(line);
      line = tok;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(ctx, lines.slice(maxLines - 1).join(' '), maxW);
    return kept;
  }
  return lines;
}

function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-');
  if (!m) return y;
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(m) - 1];
  return d ? `${Number(d)} ${mon} ${y}` : `${mon} ${y}`;
}

// ---------- shared layers ----------
let grain = null;
function grainPattern(ctx) {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grain = ctx.createPattern(c, 'repeat');
  return grain;
}

function drawBackground(ctx, t, pal, energy = 0) {
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, W, H);
  const blobs = [
    [pal[0], W * 0.15 + Math.sin(t * 0.5) * 180, H * 0.22 + Math.cos(t * 0.37) * 220, 980],
    [pal[1], W * 0.92 + Math.cos(t * 0.42) * 200, H * 0.58 + Math.sin(t * 0.33) * 260, 1080],
    [pal[2], W * 0.35 + Math.sin(t * 0.29 + 2) * 240, H * 1.0 + Math.cos(t * 0.51) * 140, 900],
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const [c, x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + energy * 0.15));
    g.addColorStop(0, rgba(c, 0.5 + energy * 0.15));
    g.addColorStop(0.55, rgba(c, 0.14));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx, t) {
  ctx.save();
  ctx.globalAlpha = 0.055;
  const f = Math.floor(t * 24);
  ctx.translate((f * 73) % 256, (f * 151) % 256);
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(-256, -256, W + 512, H + 512);
  ctx.restore();
}

function drawProgress(ctx, n, activeIdx, local) {
  const m = 56, gap = 10, y = 64;
  const w = (W - m * 2 - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const x = m + k * (w + gap);
    ctx.fillStyle = 'rgba(244,241,234,0.22)';
    ctx.fillRect(x, y, w, 6);
    const fill = k < activeIdx ? 1 : k === activeIdx ? local : 0;
    if (fill > 0) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, w * fill, 6);
    }
  }
}

function drawFooter(ctx, story, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = INK;
  ctx.font = `600 26px ${FM}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(`#Top10of${story.year}`, 56, H - 70);
  ctx.textAlign = 'right';
  ctx.fillText(story.name ? `@${story.name}`.toUpperCase().slice(0, 28) : '', W - 56, H - 70);
  ctx.restore();
}

function drawCover(ctx, img, x, y, size, radius = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

function drawVinyl(ctx, cx, cy, r, rot, label) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0d0f';
  ctx.fill();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.42 + i * 0.022), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + (i % 3) * 0.015})`;
    ctx.stroke();
  }
  // sheen
  const sh = ctx.createConicGradient(0, 0, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(0.12, 'rgba(255,255,255,0.10)');
  sh.addColorStop(0.25, 'rgba(255,255,255,0)');
  sh.addColorStop(0.62, 'rgba(255,255,255,0.07)');
  sh.addColorStop(0.75, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = rgba(label);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.restore();
}

// ---------- palette over time ----------
const NEUTRAL = [[120, 92, 255], [255, 84, 140], [40, 200, 180]];

function paletteAt(t, tl, assets) {
  const palFor = (s) => (s.type === 'track' ? assets[s.index].palette : NEUTRAL);
  for (let i = 0; i < tl.segs.length; i++) {
    const s = tl.segs[i];
    if (t < s.start + s.dur || i === tl.segs.length - 1) {
      const cur = palFor(s);
      const prev = i > 0 ? palFor(tl.segs[i - 1]) : cur;
      const k = outCubic(span(t - s.start, 0, 0.5));
      return cur.map((c, j) => mixC(prev[j], c, k));
    }
  }
  return NEUTRAL;
}

// ---------- scenes ----------
function drawIntro(ctx, u, dur, story) {
  const out = inCubic(span(u, dur - 0.35, dur));
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(0, -out * 140);
  ctx.textBaseline = 'alphabetic';

  // kicker
  const k = outCubic(span(u, 0.05, 0.5));
  ctx.globalAlpha = (1 - out) * k;
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${FM}`;
  ctx.textAlign = 'center';
  ctx.fillText(story.name ? `${story.name.toUpperCase()}'S` : 'MY', W / 2, 640 + (1 - k) * 30);

  // big year, digits rise one by one
  const digits = String(story.year).split('');
  ctx.font = `800 400px ${FD}`;
  const widths = digits.map((d) => ctx.measureText(d).width);
  const total = widths.reduce((a, b) => a + b, 0) - 30 * (digits.length - 1);
  let x = W / 2 - total / 2;
  digits.forEach((d, i) => {
    const p = outExpo(span(u, 0.15 + i * 0.09, 0.85 + i * 0.09));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 20, 640, widths[i] + 40, 400);
    ctx.clip();
    ctx.globalAlpha = 1 - out;
    ctx.textAlign = 'left';
    const y = 1000 + (1 - p) * 380;
    if (i % 2 === 0) {
      ctx.fillStyle = INK;
      ctx.fillText(d, x, y);
    } else {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(d, x, y);
    }
    ctx.restore();
    x += widths[i] - 30;
  });

  // sub
  const s = outCubic(span(u, 0.9, 1.4));
  ctx.globalAlpha = (1 - out) * s;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 92px ${FD}`;
  ctx.fillText(`in ${story.tracks.length === 10 ? 'ten' : story.tracks.length}`, W / 2, 1140 + (1 - s) * 40);
  ctx.font = `400 30px ${FM}`;
  ctx.globalAlpha = (1 - out) * outCubic(span(u, 1.2, 1.7)) * 0.8;
  ctx.fillText(story.mode === 'played' ? 'MOST-PLAYED SONGS RELEASED THIS YEAR' : 'FAVORITE SONGS RELEASED THIS YEAR', W / 2, 1230);
  ctx.restore();
}

function drawTrack(ctx, u, dur, story, i, asset, t) {
  const track = story.tracks[i];
  const rank = i + 1;
  const isOne = rank === 1;
  const pal = asset.palette;
  const out = inCubic(span(u, dur - 0.24, dur));
  const inA = outExpo(span(u, 0, 0.55));

  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(0, -out * 160);
  ctx.textBaseline = 'alphabetic';

  // --- rank numeral ---
  const num = String(rank).padStart(2, '0');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 120, W, 470);
  ctx.clip();
  ctx.font = `800 ${isOne ? 500 : 460}px ${FD}`;
  ctx.textAlign = 'left';
  const ny = 560 + (1 - inA) * 420;
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(num, 40, ny);
  const ng = ctx.createLinearGradient(0, ny - 380, 0, ny);
  ng.addColorStop(0, rgba(pal[0], 0.95));
  ng.addColorStop(1, rgba(pal[1], 0.15));
  ctx.fillStyle = ng;
  ctx.fillText(num, 40, ny);
  ctx.restore();

  // label beside the numeral
  const lab = outCubic(span(u, 0.2, 0.6));
  ctx.save();
  ctx.globalAlpha = (1 - out) * lab;
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `600 28px ${FM}`;
  ctx.fillText(isOne ? 'SONG OF' : 'NO.', W - 56, 250);
  ctx.fillText(isOne ? `THE YEAR` : `${rank} OF ${story.tracks.length}`, W - 56, 292);
  ctx.restore();

  // --- vinyl + cover ---
  const size = 700;
  const ax = (W - size) / 2 - 70;
  const ay = 630;
  const vin = outCubic(span(u, 0.15, 0.75));
  drawVinyl(ctx, ax + size / 2 + 60 + vin * 210, ay + size / 2, size * 0.48, t * 2.4, pal[0]);

  const pop = isOne ? outBack(span(u, 0.05, 0.6)) : outCubic(span(u, 0.05, 0.55));
  const sc = lerp(0.82, 1, pop);
  ctx.save();
  ctx.translate(ax + size / 2, ay + size / 2);
  ctx.rotate((1 - pop) * -0.08);
  ctx.scale(sc, sc);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, 18);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  drawCover(ctx, asset.img, -size / 2, -size / 2, size);
  if (isOne) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.lineWidth = 6;
    ctx.strokeStyle = rgba(pal[0], 0.55 + pulse * 0.4);
    ctx.beginPath();
    ctx.roundRect(-size / 2 - 14, -size / 2 - 14, size + 28, size + 28, 28);
    ctx.stroke();
  }
  ctx.restore();

  // --- particles for #1 ---
  if (isOne) drawBurst(ctx, u, ax + size / 2, ay + size / 2, pal);

  // --- title / artist ---
  const tx = 56;
  const tw = W - 112;
  const ti = outCubic(span(u, 0.25, 0.7));
  ctx.save();
  ctx.globalAlpha = (1 - out) * ti;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `800 84px ${FD}`;
  let lines = wrap(ctx, track.title, tw, 2);
  if (lines.length === 2) {
    ctx.font = `800 72px ${FD}`;
    lines = wrap(ctx, track.title, tw, 2);
  }
  const lh = lines.length === 2 ? 78 : 0;
  let y = 1460 + (1 - ti) * 40;
  lines.forEach((ln, k) => ctx.fillText(ln, tx, y + k * lh));
  y += lh * (lines.length - 1) + 72;
  ctx.globalAlpha = (1 - out) * outCubic(span(u, 0.35, 0.8)) * 0.78;
  ctx.font = `600 48px ${FD}`;
  ctx.fillText(ellipsize(ctx, track.artist, tw), tx, y);
  ctx.globalAlpha = (1 - out) * outCubic(span(u, 0.45, 0.9)) * 0.6;
  ctx.font = `400 26px ${FM}`;
  ctx.fillText(`RELEASED ${fmtDate(track.releaseDate)}`, tx, y + 62);
  ctx.restore();

  ctx.restore();
}

function drawBurst(ctx, u, cx, cy, pal) {
  const p = span(u, 0.25, 2.6);
  if (p <= 0 || p >= 1) return;
  const r = rng(2026);
  ctx.save();
  for (let k = 0; k < 140; k++) {
    const ang = r() * Math.PI * 2;
    const spd = 380 + r() * 900;
    const size = 8 + r() * 18;
    const spin = (r() - 0.5) * 12;
    const c = pal[k % 3];
    const tt = p * 2.4;
    const x = cx + Math.cos(ang) * spd * outCubic(p);
    const y = cy + Math.sin(ang) * spd * outCubic(p) + 260 * tt * tt * 0.35;
    ctx.globalAlpha = (1 - p) * 0.95;
    ctx.fillStyle = k % 5 === 0 ? INK : rgba(c);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin * p);
    ctx.fillRect(-size / 2, -size / 4, size, size / 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawOutro(ctx, u, dur, story, assets) {
  const fadeOut = span(u, dur - 0.3, dur); // smooth loop back to intro
  ctx.save();
  ctx.globalAlpha = 1 - fadeOut;
  ctx.textBaseline = 'alphabetic';

  const h = outCubic(span(u, 0, 0.5));
  ctx.globalAlpha = (1 - fadeOut) * h;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `600 30px ${FM}`;
  ctx.fillText(story.name ? `${story.name.toUpperCase()}'S` : 'MY', 56, 170);
  ctx.font = `800 120px ${FD}`;
  ctx.fillText(`${story.year} in ${story.tracks.length === 10 ? 'ten' : story.tracks.length}`, 50, 290 + (1 - h) * 30);

  const n = story.tracks.length;
  const rowH = n > 8 ? 124 : 140;
  const thumb = rowH - 22;
  const top = 360;
  story.tracks.forEach((tr, i) => {
    const p = outExpo(span(u, 0.25 + i * 0.07, 0.9 + i * 0.07));
    const y = top + i * rowH;
    ctx.save();
    ctx.globalAlpha = (1 - fadeOut) * p;
    ctx.translate((1 - p) * 120, 0);
    ctx.fillStyle = i === 0 ? rgba(assets[0].palette[0]) : INK;
    ctx.font = `600 34px ${FM}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1).padStart(2, '0'), 56, y + thumb / 2 + 12);
    drawCover(ctx, assets[i].img, 140, y, thumb, 10);
    const lx = 140 + thumb + 28;
    const maxW = W - lx - 56;
    ctx.fillStyle = INK;
    ctx.font = `800 44px ${FD}`;
    ctx.fillText(ellipsize(ctx, tr.title, maxW), lx, y + thumb / 2 - 4);
    ctx.globalAlpha *= 0.65;
    ctx.font = `600 32px ${FD}`;
    ctx.fillText(ellipsize(ctx, tr.artist, maxW), lx, y + thumb / 2 + 40);
    ctx.restore();
  });

  const st = outCubic(span(u, 1.2, 1.7));
  ctx.globalAlpha = (1 - fadeOut) * st;
  const sy = top + n * rowH + 70;
  if (story.stats?.scanned) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `400 28px ${FM}`;
    const pct = Math.round((story.stats.matched / story.stats.scanned) * 100);
    ctx.fillText(`${pct}% OF MY TOP ${story.stats.scanned} TRACKS CAME OUT IN ${story.year}`, 56, Math.min(sy, H - 190));
  }
  ctx.globalAlpha = (1 - fadeOut) * st * 0.75;
  ctx.fillStyle = INK;
  ctx.font = `600 28px ${FM}`;
  ctx.textAlign = 'left';
  ctx.fillText(`#Top10of${story.year}`, 56, H - 70);
  if (story.cta) {
    ctx.font = `600 28px ${FM}`;
    ctx.textAlign = 'right';
    ctx.fillText(`ADD YOURS → ${story.cta.toUpperCase()}`, W - 56, H - 70);
  }
  ctx.restore();
}

// ---------- entry ----------
export function renderFrame(ctx, t, story, assets, tl = buildTimeline(story.tracks.length)) {
  t = ((t % tl.total) + tl.total) % tl.total;
  const pal = paletteAt(t, tl, assets);
  const seg = tl.segs.find((s) => t < s.start + s.dur) || tl.segs[tl.segs.length - 1];
  const u = t - seg.start;
  const energy = seg.type === 'track' && seg.index === 0 ? 0.5 + 0.5 * Math.sin(t * 5) : 0;

  drawBackground(ctx, t, pal, energy);

  if (seg.type === 'intro') {
    drawIntro(ctx, u, seg.dur, story);
    drawFooter(ctx, story, 0.0);
  } else if (seg.type === 'track') {
    const n = story.tracks.length;
    drawProgress(ctx, n, n - 1 - seg.index, clamp(u / seg.dur));
    drawTrack(ctx, u, seg.dur, story, seg.index, assets[seg.index], t);
    drawFooter(ctx, story);
  } else {
    drawOutro(ctx, u, seg.dur, story, assets);
  }
  drawGrain(ctx, t);
  return { t, total: tl.total };
}

/** Time at which the summary card is fully built — used for the still image. */
export function stillTime(n) {
  const tl = buildTimeline(n);
  return tl.segs[tl.segs.length - 1].start + 2.6;
}
