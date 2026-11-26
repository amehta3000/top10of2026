import { useEffect, useRef } from 'react';

// Spotify's official embed, swapped in place of a song row while it plays.
// Uses the Spotify iFrame API so it can start playing on the same tap; if the
// browser blocks that (some mobile browsers do), the embed's own play button works.
// Logged out: 30s preview. Signed into Spotify in this browser: full track.

let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      prev?.(api);
      resolve(api);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = reject;
    document.body.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 6000);
  });
  apiPromise.catch(() => (apiPromise = null)); // allow a retry later
  return apiPromise;
}

function plainIframe(id) {
  const f = document.createElement('iframe');
  f.src = `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`;
  f.width = '100%';
  f.height = '80';
  f.frameBorder = '0';
  f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  f.title = 'Spotify player';
  return f;
}

export function PreviewPlayer({ id, className = '' }) {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current;
    let controller = null;
    let cancelled = false;
    // The API replaces this node with its iframe, so React never touches it.
    const slot = document.createElement('div');
    el.appendChild(slot);

    loadApi()
      .then((api) => {
        if (cancelled) return;
        api.createController(slot, { uri: `spotify:track:${id}`, width: '100%', height: 80 }, (c) => {
          controller = c;
          if (cancelled) return c.destroy();
          c.addListener('ready', () => {
            try { c.play(); } catch { /* blocked: user taps the embed's play */ }
          });
        });
      })
      .catch(() => {
        if (!cancelled) slot.replaceWith(plainIframe(id));
      });

    return () => {
      cancelled = true;
      try { controller?.destroy(); } catch { /* already gone */ }
      el.innerHTML = '';
    };
  }, [id]);

  return <div ref={host} className={`inline-embed ${className}`} />;
}

export function PlayButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`play-btn ${active ? 'on' : ''}`}
      onClick={onClick}
      aria-label={active ? 'Close player' : 'Play preview'}
      title={active ? 'Close player' : 'Play preview'}
    >
      {active ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
      )}
    </button>
  );
}
