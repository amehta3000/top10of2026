import { useEffect, useState } from 'react';
import { getGroup, playlistUrl, saveGroupPlaylist } from './api.js';
import { YEAR, songKey } from './rank.js';
import * as spotify from './spotify.js';

/**
 * Owner-only page (#admin). Only the owner's Spotify account writes to the
 * group playlist, so friends never need API access.
 */
/** "Groove-seeking nerds’ top 10 favorite releases of 2026: Ameet, Robin +4 more. Add yours: site.com" (300-char cap). */
export function contributorLine(names, host) {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const head = `Groove-seeking nerds’ top 10 favorite releases of ${YEAR}: `;
  const tail = `. Add yours: ${host}`;
  let shown = uniq.length;
  const build = (k) => head + uniq.slice(0, k).join(', ') + (uniq.length > k ? ` +${uniq.length - k} more` : '') + tail;
  while (shown > 0 && build(shown).length > 300) shown--;
  return uniq.length ? build(shown) : `Collaborative playlist of groove-seeking nerds highlighting their top 10 favorite releases of ${YEAR}${tail}`;
}

export default function Admin() {
  const [g, setG] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('top10.adminKey') || '');
  const [manualId, setManualId] = useState('');
  const authed = spotify.hasToken();
  const say = (m) => setLog((l) => [...l, m]);

  const refresh = () => getGroup().then(setG);
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => localStorage.setItem('top10.adminKey', adminKey), [adminKey]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say(`⚠ ${e.message}${e.kind === 'not_allowlisted' ? ' (403: Spotify blocked this playlist write. See the README.)' : ''}`);
    } finally {
      setBusy(false);
    }
  };

  const savePlaylistId = (id) =>
    run(async () => {
      await saveGroupPlaylist(id, adminKey);
      say(`Saved playlist ${id} as the group playlist.`);
      await refresh();
    });

  const create = () =>
    run(async () => {
      const p = await spotify.createPlaylist(`#Top10of${YEAR}: A Collaboration of Heads - Best of ${YEAR} Releases`, `Collaborative playlist of groove-seeking nerds highlighting their top 10 favorite releases of ${YEAR}.`, true);
      say(`Created playlist ${p.id}.`);
      await saveGroupPlaylist(p.id, adminKey);
      say('Saved it as the group playlist.');
      await refresh();
    });

  const sync = () =>
    run(async () => {
      const fresh = await getGroup();
      setG(fresh);
      const wanted = [];
      const seen = new Set();
      for (const s of fresh.submissions) for (const t of s.tracks) { const k = songKey(t.title, t.artist); if (!seen.has(k)) { seen.add(k); wanted.push(t.id); } }
      say(`${fresh.submissions.length} lists → ${wanted.length} unique songs.`);
      const have = await spotify.playlistTrackIds(fresh.playlistId);
      const missing = wanted.filter((id) => !have.has(id));
      if (missing.length) {
        await spotify.addToPlaylist(fresh.playlistId, missing);
        say(`Added ${missing.length} songs. ✓`);
      } else {
        say('No new songs.');
      }
      // Songs all show as added by the owner, so credit the heads in the description.
      const desc = contributorLine(fresh.submissions.map((s) => s.name), window.location.host);
      try {
        await spotify.updatePlaylist(fresh.playlistId, { description: desc });
        say('Updated the description with everyone’s names.');
      } catch (e) {
        say(`Couldn’t update the description (${e.message}).`);
      }
    });

  if (!g) return <div className="center"><div className="spinner" /></div>;

  return (
    <main className="admin">
      <p className="kicker">Owner tools</p>
      <h2>Group playlist</h2>

      {!g.enabled && <p className="note warn">Storage isn’t configured. Add Upstash Redis (see README).</p>}

      <ol className="admin-steps">
        <li>
          <h3>1 · Sign in as the playlist owner</h3>
          {authed ? <p className="note ok">Signed in.</p> : (
            <button className="btn primary" onClick={() => spotify.login('admin')} disabled={!spotify.isConfigured()}>Sign in with Spotify</button>
          )}
        </li>

        <li>
          <h3>2 · Choose the playlist</h3>
          <label className="name-field">
            <span>Admin key (the ADMIN_KEY env var)</span>
            <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          </label>
          {g.playlistId ? (
            <p className="note ok">
              Using <a href={playlistUrl(g.playlistId)} target="_blank" rel="noreferrer">{g.playlistId}</a>
            </p>
          ) : (
            <p className="note">No group playlist yet.</p>
          )}
          <div className="cta-row">
            <button className="btn" onClick={create} disabled={!authed || !adminKey || busy}>Create a new one</button>
            <input className="inline-input" placeholder="…or paste a playlist link" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            <button
              className="btn ghost"
              disabled={!adminKey || busy || !manualId}
              onClick={() => savePlaylistId((manualId.match(/playlist\/([A-Za-z0-9]{22})/) || [])[1] || manualId.trim())}
            >
              Use it
            </button>
          </div>
        </li>

        <li>
          <h3>3 · Sync submissions</h3>
          <p className="note">{g.submissions?.length ?? 0} lists submitted. Sync adds any songs not already in the playlist.</p>
          <button className="btn primary" onClick={sync} disabled={!authed || !g.playlistId || busy}>
            {busy ? 'Working…' : 'Sync now'}
          </button>
        </li>
      </ol>

      {log.length > 0 && <pre className="log">{log.join('\n')}</pre>}
    </main>
  );
}
