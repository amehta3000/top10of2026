import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { W, H, renderFrame, buildTimeline } from './render.js';

/**
 * Plays the story in a loop. Exposes restart() and the canvas element so the
 * parent can record exactly what's on screen.
 */
const StoryCanvas = forwardRef(function StoryCanvas({ story, assets, paused = false, onTime, className }, ref) {
  const canvasRef = useRef(null);
  const startRef = useRef(performance.now());
  const pausedAt = useRef(null);
  const tl = useRef(null);

  useImperativeHandle(ref, () => ({
    canvas: () => canvasRef.current,
    restart: () => {
      startRef.current = performance.now();
      pausedAt.current = null;
    },
    total: () => tl.current?.total ?? 0,
  }));

  useEffect(() => {
    if (!story || !assets) return;
    tl.current = buildTimeline(story.tracks.length);
    const ctx = canvasRef.current.getContext('2d');
    let raf;
    const loop = (now) => {
      if (paused) {
        if (pausedAt.current == null) pausedAt.current = now;
      } else if (pausedAt.current != null) {
        startRef.current += now - pausedAt.current;
        pausedAt.current = null;
      }
      const t = ((pausedAt.current ?? now) - startRef.current) / 1000;
      const r = renderFrame(ctx, t, story, assets, tl.current);
      onTime?.(t, r.total);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [story, assets, paused, onTime]);

  return <canvas ref={canvasRef} width={W} height={H} className={className} />;
});

export default StoryCanvas;
