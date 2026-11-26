import { useEffect, useRef, useState } from 'react';
import { searchTracks } from './api.js';
import { YEAR } from './rank.js';
import * as spotify from './spotify.js';
import { PlayButton, PreviewPlayer } from './Preview.jsx';

const MAX = 10;
const MIN = 3;
const DRAFT_KEY = 'top10.draft';

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}
export function saveDraft(d) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* storage full or blocked */ }
}

/**
 * initial: { name, tracks, mode: 'picked' | 'played', stats }
 * Autofilled lists stay "most-played" only until the person edits them.
 */
export default function Picker({ initial, onDone, notice }) {
  const [name, setName] = useState(initial?.name || '');
  const [picks, setPicks] = useState(initial?.tracks || []);
  const [mode, setMode] = useState(initial?.mode || 'picked');
  const [stats, setStats] = useState(initial?.stats || null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | error | empty
  const [err, setErr] = useState('');
  const dragFrom = useRef(null);
  const [playing, setPlaying] = useState(null); // 'r:<id>' or 'p:<id>', one player at a time

  useEffect(() => saveDraft({ name, tracks: picks, mode, stats }), [name, picks, mode, stats]);

  // debounced search
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setStatus('loading');
      try {
        const tracks = await searchTracks(query, ac.signal);
        setResults(tracks);
        setStatus(tracks.length ? 'idle' : 'empty');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setErr(e.status === 501 ? 'Search isn’t set up yet (the site owner needs to add SPOTIFY_CLIENT_SECRET).' : e.message);
        setStatus('error');
      }
    }, 320);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  const edited = () => {
    setMode('picked');
    setStats(null);
  };
  const add = (t) => {
    if (picks.length >= MAX || picks.some((p) => p.id === t.id)) return;
    setPicks([...picks, t]);
    edited();
  };
  const remove = (i) => {
    setPicks(picks.filter((_, k) => k !== i));
    edited();
  };
  const move = (from, to) => {
    if (to < 0 || to >= picks.length || from === to) return;
    const next = [...picks];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setPicks(next);
    edited();
  };

  const pickedIds = new Set(picks.map((p) => p.id));
  const canFinish = picks.length >= MIN;

  return (
    <main className="picker">
      <section className="picker-search">
        <p className="kicker">Step 1 · Find your songs</p>
        <h2>Pick your ten.</h2>
        <p className="lede small">Only songs released in {YEAR} show up. Order matters: #1 gets the big moment.</p>

        {notice && <p className="note warn">{notice}</p>}

        {spotify.isConfigured() && mode !== 'played' && picks.length === 0 && (
          <button className="link-btn" onClick={() => spotify.login('autofill')}>
            Or autofill from your Spotify listening →
          </button>
        )}

        <div className="search-box">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a song or artist"
            aria-label="Search songs"
          />
          {status === 'loading' && <span className="mini-spin" />}
        </div>

        <ul className="results">
          {results.map((t) => {
            const taken = pickedIds.has(t.id);
            return (
              <li key={t.id} className="result">
                {playing === `r:${t.id}` ? (
                  <PreviewPlayer id={t.id} onEnded={() => setPlaying(null)} />
                ) : (
                  <button className="result-main" onClick={() => add(t)} disabled={taken || picks.length >= MAX}>
                    {t.thumb ? <img src={t.thumb} alt="" /> : <span className="ph" />}
                    <span className="r-text">
                      <strong>{t.title}</strong>
                      <small>{t.artist} · {t.releaseDate}</small>
                    </span>
                  </button>
                )}
                {playing !== `r:${t.id}` && <PlayButton onClick={() => setPlaying(`r:${t.id}`)} />}
                <button className="r-add" onClick={() => add(t)} disabled={taken || picks.length >= MAX} aria-label={taken ? 'Added' : 'Add'}>
                  {taken ? '✓' : '+'}
                </button>
              </li>
            );
          })}
        </ul>
        {status === 'empty' && <p className="note">No {YEAR} releases match that. Try the artist name.</p>}
        {status === 'error' && <p className="note warn">{err}</p>}
      </section>

      <section className="picker-list">
        <div className="list-head">
          <p className="kicker">Step 2 · Your ranking</p>
          <span className="count">{picks.length}/{MAX}</span>
        </div>
        {mode === 'played' && <p className="note ok">Autofilled from your listening. Edit it freely.</p>}

        <ol className="picks">
          {Array.from({ length: MAX }).map((_, i) => {
            const t = picks[i];
            if (!t) return <li key={`e${i}`} className="slot"><span className="n">{String(i + 1).padStart(2, '0')}</span><span className="slot-label">Empty</span></li>;
            return (
              <li
                key={t.id}
                draggable
                onDragStart={() => (dragFrom.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => move(dragFrom.current, i)}
                className="pick"
              >
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                {playing === `p:${t.id}` ? (
                  <PreviewPlayer id={t.id} className="span-2" onEnded={() => setPlaying(null)} />
                ) : (
                  <>
                    {t.thumb || t.imageUrl ? <img src={t.thumb || t.imageUrl} alt="" /> : <span className="ph" />}
                    <span className="r-text">
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                  </>
                )}
                <span className="pick-ctrl">
                  {t.id && playing !== `p:${t.id}` && <PlayButton onClick={() => setPlaying(`p:${t.id}`)} />}
                  <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button onClick={() => move(i, i + 1)} disabled={i === picks.length - 1} aria-label="Move down">↓</button>
                  <button onClick={() => remove(i)} aria-label="Remove">×</button>
                </span>
              </li>
            );
          })}
        </ol>

        <label className="name-field">
          <span>Your name (shows on the video)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. Sam" />
        </label>

        <button
          className="btn primary wide"
          disabled={!canFinish}
          onClick={() => onDone({ name: name.trim(), year: Number(YEAR), mode, stats, tracks: picks })}
        >
          {canFinish ? `Make my video${picks.length < MAX ? ` (${picks.length} songs)` : ''}` : `Pick at least ${MIN} songs`}
        </button>
      </section>
    </main>
  );
}
