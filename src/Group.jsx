import { useEffect, useState } from 'react';
import { getGroup, playlistUrl } from './api.js';
import { PlayButton, PreviewPlayer } from './Preview.jsx';
import { YEAR, songKey } from './rank.js';

// Earlier editions, linked from the group page.
const PREVIOUS = { name: '#Top10of2021', url: 'https://open.spotify.com/playlist/1uTx4wNLG6ZEeU6V4AafZb' };

/** Everyone's lists + a "most picked" tally. */
export function tally(submissions) {
  const m = new Map();
  for (const s of submissions) {
    s.tracks.forEach((t, i) => {
      const key = songKey(t.title, t.artist); // count single + album versions as one song
      const e = m.get(key) || { ...t, count: 0, points: 0, by: [] };
      e.count++;
      e.points += 10 - i;
      e.by.push(s.name);
      m.set(key, e);
    });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.points - a.points);
}

export default function Group({ onPick }) {
  const [g, setG] = useState(null);
  const [playing, setPlaying] = useState(null);
  const toggle = (key) => setPlaying((cur) => (cur === key ? null : key));
  useEffect(() => {
    getGroup().then(setG);
  }, []);

  if (!g) return <div className="center"><div className="spinner" /></div>;
  if (!g.enabled) {
    return (
      <main className="center message">
        <p className="kicker">Group playlist</p>
        <h2>The group playlist isn’t switched on for this site.</h2>
        <button className="btn" onClick={onPick}>Pick your 10 anyway</button>
      </main>
    );
  }

  const top = tally(g.submissions).slice(0, 15);
  const shared = top.filter((t) => t.count > 1);

  return (
    <main className="group">
      <header className="group-head">
        <div>
          <p className="kicker">{g.submissions.length} {g.submissions.length === 1 ? 'list' : 'lists'} so far</p>
          <h2>#Top10of{YEAR}</h2>
          <p className="lede small">Groove-seeking nerds highlighting their top 10 favorite releases of {YEAR}.</p>
          <p className="note">
            Previous edition:{' '}
            <a href={PREVIOUS.url} target="_blank" rel="noreferrer">{PREVIOUS.name}</a>
          </p>
        </div>
        <div className="cta-row">
          {g.playlistId && (
            <a className="btn primary" href={playlistUrl(g.playlistId)} target="_blank" rel="noreferrer">
              Open the playlist in Spotify
            </a>
          )}
          <button className="btn" onClick={onPick}>Add your 10</button>
        </div>
      </header>

      {shared.length > 0 && (
        <section className="group-section">
          <p className="kicker">Picked by more than one person</p>
          <ol className="tally">
            {shared.map((t) => (
              <li key={t.id}>
                {playing === `t:${t.id}` ? (
                  <PreviewPlayer id={t.id} className="span-2" />
                ) : (
                  <>
                    {t.thumb ? <img src={t.thumb} alt="" /> : <span className="ph" />}
                    <span className="r-text">
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                  </>
                )}
                <span className="votes" title={t.by.join(', ')}>×{t.count}</span>
                <PlayButton active={playing === `t:${t.id}`} onClick={() => toggle(`t:${t.id}`)} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="group-grid">
        {[...g.submissions].reverse().map((s, k) => (
          <article key={k} className="person">
            <h3>{s.name}</h3>
            <ol>
              {s.tracks.map((t, i) => (
                <li key={t.id}>
                  <span className="n">{String(i + 1).padStart(2, '0')}</span>
                  {playing === `${k}:${t.id}` ? (
                    <PreviewPlayer id={t.id} className="row-2" />
                  ) : (
                    <>
                      <a href={`https://open.spotify.com/track/${t.id}`} target="_blank" rel="noreferrer">{t.title}</a>
                      <small>{t.artist}</small>
                    </>
                  )}
                  <PlayButton active={playing === `${k}:${t.id}`} onClick={() => toggle(`${k}:${t.id}`)} />
                </li>
              ))}
            </ol>
          </article>
        ))}
        {g.submissions.length === 0 && <p className="note">No lists yet. Be the first.</p>}
      </section>
    </main>
  );
}
