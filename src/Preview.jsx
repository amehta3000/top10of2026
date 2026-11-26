// Spotify's official embed player. Works without login or API quota:
// a 30s preview when logged out, the full track if the listener is signed
// into Spotify in this browser.

export function PreviewPlayer({ id }) {
  return (
    <div className="preview">
      <iframe
        title="Spotify preview"
        src={`https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`}
        width="100%"
        height="80"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    </div>
  );
}

export function PlayButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`play-btn ${active ? 'on' : ''}`}
      onClick={onClick}
      aria-label={active ? 'Close preview' : 'Preview song'}
      title={active ? 'Close preview' : 'Preview'}
    >
      {active ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
      )}
    </button>
  );
}
