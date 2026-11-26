import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StoryCanvas from './StoryCanvas.jsx';
import Picker, { loadDraft, saveDraft } from './Picker.jsx';
import Group from './Group.jsx';
import Admin from './Admin.jsx';
import { loadAssets, fontsReady } from './art.js';
import { DEMO_STORY } from './demo.js';
import { YEAR, rankYear, releasedIn } from './rank.js';
import { decodeStory, shareUrl } from './share.js';
import { recordCanvas, stillImage, deliverFile } from './export.js';
import { getGroup, submitPicks, playlistUrl } from './api.js';
import * as spotify from './spotify.js';
import { PlayButton, PreviewPlayer } from './Preview.jsx';

const host = () => window.location.host;
let booted = false;

async function prepare(story) {
  const [assets] = await Promise.all([loadAssets(story.tracks), fontsReady()]);
  return { story: { ...story, cta: host() }, assets };
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [busy, setBusy] = useState(true); // boot / loading assets
  const [own, setOwn] = useState(null); // the person's own story
  const [view, setView] = useState(null); // someone else's story (or the demo)
  const [picker, setPicker] = useState({ key: 0, notice: null });
  const [analyzing, setAnalyzing] = useState(false);
  const [scan, setScan] = useState({ count: 0, hits: 0, feed: [] });
  const [error, setError] = useState(null);
  const [group, setGroup] = useState({ enabled: false });

  const nav = useCallback((h) => {
    if (h === '') {
      window.history.pushState({}, '', window.location.pathname);
      setHash('');
    } else {
      window.location.hash = h;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener('hashchange', f);
    window.addEventListener('popstate', f);
    getGroup().then(setGroup);
    return () => {
      window.removeEventListener('hashchange', f);
      window.removeEventListener('popstate', f);
    };
  }, []);

  // Optional Spotify autofill: read top tracks, then drop into the picker for editing.
  const autofill = useCallback(async () => {
    setAnalyzing(true);
    const t0 = Date.now();
    let next;
    try {
      const profile = await spotify.getProfile();
      const seen = new Set();
      const byRange = await spotify.getTopTracks((_, items) => {
        setScan((prev) => {
          let { count, hits } = prev;
          const feed = [...prev.feed];
          for (const it of items) {
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            count++;
            const hit = releasedIn(it);
            if (hit) hits++;
            feed.push({ id: it.id, name: it.name, artist: it.artists?.[0]?.name, hit });
          }
          return { count, hits, feed: feed.slice(-14) };
        });
      });
      const { tracks, stats } = rankYear(byRange);
      await new Promise((r) => setTimeout(r, Math.max(0, 3000 - (Date.now() - t0))));
      next = {
        data: { name: profile.name, tracks, mode: tracks.length ? 'played' : 'picked', stats: tracks.length ? stats : null },
        notice: tracks.length ? null : `None of your top tracks came out in ${YEAR} yet. Pick by hand instead.`,
      };
    } catch (e) {
      const notice =
        e.kind === 'not_allowlisted'
          ? 'Autofill only works for Spotify accounts the site owner has added. You can still pick by hand. It takes a minute.'
          : e.kind === 'denied'
            ? null
            : `Autofill didn’t work (${e.message}). Pick by hand instead.`;
      next = { data: loadDraft(), notice };
    }
    if (next.data) saveDraft(next.data);
    setPicker((p) => ({ key: p.key + 1, notice: next.notice }));
    setAnalyzing(false);
    nav('#pick');
  }, [nav]);

  // Boot: finish an OAuth callback if there is one.
  useEffect(() => {
    if (booted) return; // StrictMode double-run guard; an OAuth code is single-use
    booted = true;
    (async () => {
      try {
        const intent = await spotify.handleCallback();
        if (intent === 'autofill') autofill();
        else if (intent === 'admin') nav('#admin');
      } catch (e) {
        if (e.kind === 'denied') nav('#pick');
        else setError(e);
      }
      setBusy(false);
    })();
  }, [autofill, nav]);

  // Load the story for viewer/demo routes.
  useEffect(() => {
    let live = true;
    (async () => {
      if (hash.startsWith('#s=')) {
        setBusy(true);
        try {
          const s = await decodeStory(hash.slice(3));
          const v = await prepare(s);
          if (live) setView({ ...v, kind: 'viewer' });
        } catch {
          if (live) nav('');
        }
        if (live) setBusy(false);
      } else if (hash === '#demo') {
        setBusy(true);
        const v = await prepare(DEMO_STORY);
        if (live) {
          setView({ ...v, kind: 'demo' });
          setBusy(false);
        }
      } else if (hash === '#story' && !own) {
        nav('#pick');
      }
    })();
    return () => (live = false);
  }, [hash, own, nav]);

  const finishPicks = async (story) => {
    setBusy(true);
    setOwn(await prepare(story));
    setBusy(false);
    nav('#story');
  };

  let body;
  if (error) body = <ErrorScreen error={error} onHome={() => { setError(null); nav(''); }} />;
  else if (analyzing) body = <Analyzing scan={scan} />;
  else if (busy) body = <div className="center"><div className="spinner" /></div>;
  else if (hash === '#pick') body = <Picker key={picker.key} initial={loadDraft()} notice={picker.notice} onDone={finishPicks} />;
  else if (hash === '#story' && own) body = <StoryScreen {...own} kind="own" group={group} nav={nav} />;
  else if ((hash.startsWith('#s=') || hash === '#demo') && view) body = <StoryScreen {...view} group={group} nav={nav} />;
  else if (hash === '#group') body = <Group onPick={() => nav('#pick')} />;
  else if (hash === '#admin') body = <Admin />;
  else body = <Landing nav={nav} group={group} />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => nav('')}>
          <span className="brand-dot" /> #Top10of{YEAR}
        </button>
        <nav className="topnav">
          {group.enabled && <button onClick={() => nav('#group')}>Group playlist</button>}
          <button onClick={() => nav('#pick')}>Pick yours</button>
        </nav>
      </header>
      {body}
    </div>
  );
}

function Landing({ nav, group }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let live = true;
    prepare(DEMO_STORY).then((v) => live && setPreview(v));
    return () => (live = false);
  }, []);

  return (
    <main className="landing">
      <section className="landing-copy">
        <p className="kicker">A collaboration of heads · Back for {YEAR}</p>
        <h1>
          #Top10<br />
          <em>of{YEAR}.</em>
        </h1>
        <p className="lede">
          The best songs released in {YEAR}, picked by all of us. Choose your ten, get an animated story to post, and
          your picks land in the group playlist with everyone else's.
        </p>
        <div className="cta-row">
          <button className="btn primary" onClick={() => nav('#pick')}>Pick your 10</button>
          <button className="btn ghost" onClick={() => nav('#demo')}>Watch a demo</button>
        </div>
        <div className="sub-links">
          {spotify.isConfigured() && (
            <button className="link-btn" onClick={() => spotify.login('autofill')}>Autofill from Spotify instead</button>
          )}
          {group.enabled && <button className="link-btn" onClick={() => nav('#group')}>See the group playlist →</button>}
        </div>
        <p className="note">No login needed. Spotify autofill is optional.</p>
      </section>
      <section className="landing-preview">
        <div className="phone">
          {preview ? <StoryCanvas story={preview.story} assets={preview.assets} className="phone-canvas" /> : <div className="spinner" />}
        </div>
      </section>
    </main>
  );
}

function Analyzing({ scan }) {
  return (
    <main className="analyzing">
      <div className="scan-head">
        <p className="kicker">Reading your year</p>
        <div className="counters">
          <div><span className="big">{scan.count}</span><label>tracks checked</label></div>
          <div><span className="big accent">{scan.hits}</span><label>released in {YEAR}</label></div>
        </div>
      </div>
      <ul className="feed">
        {scan.feed.map((f) => (
          <li key={f.id} className={f.hit ? 'hit' : ''}>
            <span className="feed-tag">{f.hit ? YEAR : '—'}</span>
            <span className="feed-name">{f.name}</span>
            <span className="feed-artist">{f.artist}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function StoryScreen({ story, assets, kind, group, nav }) {
  const player = useRef(null);
  const [rec, setRec] = useState(null);
  const [msg, setMsg] = useState('');
  const [paused, setPaused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(null);
  const [working, setWorking] = useState('');
  const [playing, setPlaying] = useState(null);
  const own = kind === 'own';
  const allIds = useMemo(() => story.tracks.every((t) => t.id), [story]);
  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3200);
  };

  const saveVideo = async () => {
    setPaused(false);
    setRec(0);
    try {
      const blob = await recordCanvas(player.current, setRec);
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const r = await deliverFile(blob, `top10of${story.year}.${ext}`);
      if (r === 'downloaded') flash(`Video saved (.${ext})`);
    } catch (e) {
      flash(e.message);
    } finally {
      setRec(null);
    }
  };

  const saveImage = async () => {
    const r = await deliverFile(await stillImage(story, assets), `top10of${story.year}.png`);
    if (r === 'downloaded') flash('Image saved');
  };

  const copyLink = async () => {
    const url = await shareUrl(story);
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied. Anyone can watch it, no login needed.');
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: `My #Top10of${story.year}`, text: `My top 10 releases of ${story.year}. Add yours to the group playlist`, url: await shareUrl(story) });
    } catch { /* cancelled */ }
  };

  const joinGroup = async () => {
    setWorking('group');
    try {
      await submitPicks(story);
      setSubmitted(true);
    } catch (e) {
      flash(e.message);
    } finally {
      setWorking('');
    }
  };

  const saveToSpotify = async () => {
    setWorking('save');
    try {
      const p = await spotify.createPlaylist(
        `${story.name ? `${story.name}’s ` : 'My '}#Top10of${story.year}`,
        `Top 10 songs released in ${story.year}.`
      );
      await spotify.addToPlaylist(p.id, story.tracks.map((t) => t.id));
      setSaved(p.url || playlistUrl(p.id));
    } catch (e) {
      flash(e.kind === 'not_allowlisted' ? 'Spotify blocked creating the playlist for this app.' : e.message);
    } finally {
      setWorking('');
    }
  };

  const who = own ? 'Your' : `${story.name || 'Someone'}’s`;

  return (
    <main className="story">
      <div className="player-wrap">
        <StoryCanvas ref={player} story={story} assets={assets} paused={paused} className="player" />
        {rec != null && (
          <div className="rec-overlay">
            <span className="rec-dot" /> Recording {Math.round(rec * 100)}%
          </div>
        )}
      </div>

      <aside className="panel">
        <p className="kicker">{own ? 'Your result' : kind === 'demo' ? 'Demo' : 'Shared with you'}</p>
        <h2>
          {who} {story.year}
          <br />
          in {story.tracks.length === 10 ? 'ten' : story.tracks.length}
        </h2>

        {own && group.enabled && allIds && (
          <div className={`group-card ${submitted ? 'done' : ''}`}>
            {submitted ? (
              <>
                <strong>You’re in the group playlist.</strong>
                <button className="link-btn" onClick={() => nav('#group')}>See everyone’s picks →</button>
              </>
            ) : (
              <>
                <strong>Add your songs to the group playlist</strong>
                <span>Your 10 go into one shared playlist with everyone else’s.</span>
                <button className="btn primary" onClick={joinGroup} disabled={working === 'group'}>
                  {working === 'group' ? 'Adding…' : 'Add mine'}
                </button>
              </>
            )}
          </div>
        )}

        {!own && (
          <div className="group-card">
            <strong>{kind === 'demo' ? 'Make your own' : `Liked ${story.name ? `${story.name}’s` : 'these'} picks?`}</strong>
            <span>Pick your 10 from {story.year} and add them to the group playlist.</span>
            <div className="cta-row">
              <button className="btn primary" onClick={() => nav('#pick')}>Make yours</button>
              {group.playlistId && (
                <a className="btn" href={playlistUrl(group.playlistId)} target="_blank" rel="noreferrer">Group playlist</a>
              )}
            </div>
          </div>
        )}

        <div className="actions">
          <button className={`btn ${own ? 'primary' : ''}`} onClick={saveVideo} disabled={rec != null}>
            {rec != null ? 'Recording…' : 'Save video'}
          </button>
          <button className="btn" onClick={saveImage} disabled={rec != null}>Save image</button>
          {kind !== 'demo' && <button className="btn" onClick={copyLink}>Copy link</button>}
          {kind !== 'demo' && navigator.share && <button className="btn" onClick={nativeShare}>Share…</button>}
          {own && spotify.hasToken() && allIds && (
            saved ? (
              <a className="btn" href={saved} target="_blank" rel="noreferrer">Open in Spotify ↗</a>
            ) : (
              <button className="btn" onClick={saveToSpotify} disabled={working === 'save'}>
                {working === 'save' ? 'Saving…' : 'Save to my Spotify'}
              </button>
            )
          )}
          {own && <button className="btn ghost" onClick={() => nav('#pick')}>Edit picks</button>}
          <button className="btn ghost" onClick={() => setPaused((p) => !p)} disabled={rec != null}>{paused ? 'Play' : 'Pause'}</button>
          <button className="btn ghost" onClick={() => player.current.restart()} disabled={rec != null}>Replay</button>
        </div>
        {msg && <p className="toast">{msg}</p>}
        <ol className="tracklist spaced">
          {story.tracks.map((t, i) => (
            <li key={i}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <span className="t">
                {t.id ? <a href={`https://open.spotify.com/track/${t.id}`} target="_blank" rel="noreferrer">{t.title}</a> : t.title}
                <small>{t.artist}</small>
              </span>
              {t.id && <PlayButton active={playing === t.id} onClick={() => setPlaying((p) => (p === t.id ? null : t.id))} />}
              {playing === t.id && <PreviewPlayer id={t.id} />}
            </li>
          ))}
        </ol>

      </aside>
    </main>
  );
}

function ErrorScreen({ error, onHome }) {
  return (
    <main className="center message">
      <p className="kicker">Something went sideways</p>
      <h2>{error?.message || 'Unexpected error.'}</h2>
      <div className="cta-row">
        <button className="btn primary" onClick={onHome}>Home</button>
      </div>
    </main>
  );
}
