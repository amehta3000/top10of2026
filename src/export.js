import { W, H, renderFrame, stillTime } from './render.js';

export function pickVideoType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

/** Records one full loop of the on-screen canvas. */
export function recordCanvas(player, onProgress) {
  return new Promise((resolve, reject) => {
    const mimeType = pickVideoType();
    const canvas = player.canvas();
    if (!mimeType || !canvas.captureStream) return reject(new Error('Video export is not supported in this browser.'));
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    };
    rec.onerror = (e) => reject(e.error || new Error('Recording failed'));

    const total = player.total() - 0.3; // drop the final fade so the clip ends on the summary
    player.restart();
    rec.start(500);
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      onProgress?.(Math.min(t / total, 1));
      if (t >= total) rec.stop();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function stillImage(story, assets) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  renderFrame(c.getContext('2d'), stillTime(story.tracks.length), story, assets);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Uses the native share sheet on phones (straight to IG/TikTok/Messages), download elsewhere. */
export async function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My #Top10of2026' });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
