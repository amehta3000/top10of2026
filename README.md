# #Top10of2026: A Collaboration of Heads

The return of the yearly collaborative playlist ([2021 edition](https://open.spotify.com/playlist/1uTx4wNLG6ZEeU6V4AafZb)), now with animated stories.

Pick your ten favorite songs released in 2026 and get an animated 9:16 story to post. Share a link anyone can watch. Every list goes into one group playlist.

**The flow:** you post your link → a friend watches your animation → "Make yours" → they search and pick 10 (no login) → they get their own video and link → "Add mine" puts their list in the group pool → you sync the pool into one Spotify playlist.

Spotify login is optional. Up to 5 accounts you allowlist can autofill their list from listening history, then edit it.

## Why it's built this way

Spotify Development Mode apps are capped at **5 users**, and unlimited access needs ~250k MAU. So nothing in the main flow makes a friend log in:

| Step | Who talks to Spotify | Counts toward the 5-user cap? |
| --- | --- | --- |
| Search & pick | The server, using the app's own token | No |
| Watch / share / video | Nobody | No |
| Add to group pool | Nobody (stored in Redis) | No |
| Sync pool → playlist | **You**, logged in on `#admin` | Just you |
| Optional autofill / "Save to my Spotify" | That person | Yes |

All searches share one usage quota on your developer account, so results are cached in memory and at the CDN. That's fine for friends; going viral would hit the limit.

## Setup

### 1. Spotify app
https://developer.spotify.com/dashboard → Create app → Web API.
- Redirect URIs: `http://127.0.0.1:5173/` and `https://YOUR-DOMAIN/`
- Copy the **Client ID** and **Client Secret**
- User Management: add your own account (and up to 4 friends if you want autofill)

### 2. Local dev
```bash
cp .env.example .env    # fill in the values below
npm install
npm run dev             # http://127.0.0.1:5173/
```
`npm run dev` also runs the `/api` functions, with an in-memory store, so the whole flow works locally with no database.

### 3. Deploy to Vercel
1. Import the repo (Vite is auto-detected; `/api` becomes serverless functions).
2. Storage → add **Upstash Redis** from the Marketplace (free tier is plenty). It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` for you.
3. Environment variables:

| Var | Value |
| --- | --- |
| `VITE_SPOTIFY_CLIENT_ID` | Client ID |
| `SPOTIFY_CLIENT_SECRET` | Client Secret (server only, never prefix with VITE_) |
| `ADMIN_KEY` | Any long random string; guards setting the playlist |
| `GROUP_PLAYLIST_ID` | Optional; or set it from `#admin` |

4. Add `https://YOUR-DOMAIN/` as a Redirect URI in Spotify.

### 4. Run the group playlist
Open `https://YOUR-DOMAIN/#admin`:
1. Sign in with Spotify (your account).
2. Enter your admin key → **Create a new one** (or paste an existing playlist link).
3. **Sync now** whenever you like. It adds any submitted songs not already in the playlist and rewrites the playlist description to credit everyone (songs added via sync all show as added by you, so this keeps the "collaboration" visible).

## Routes
`/` landing · `#pick` picker · `#story` your result · `#s=…` shared result · `#group` everyone's lists + most-picked · `#admin` owner tools · `#demo` sample

## Caveats
- **Playlist writes from Development Mode apps:** the official endpoint is `POST /playlists/{id}/items`, but some developers report 403s since the March 2026 changes. Test **Sync** with your account first. If it fails, everything else still works, and `#group` still shows all the lists.
- Sync is manual (a button). Automating it would mean storing your refresh token server-side. Doable, but not worth it at friends scale.
- Submissions are open to anyone with the site link. They're rate-limited and only accept valid Spotify track IDs. A friend can resubmit; their entry is replaced.

## Files
| File | What it does |
| --- | --- |
| `api/search.js` | 2026-only song search with the app token, cached |
| `api/submit.js` · `api/group.js` | Group pool (Upstash Redis REST; memory in dev) |
| `api/_lib.js` | Token, store, rate limit helpers |
| `src/Picker.jsx` | Search, add, reorder, draft autosave |
| `src/Group.jsx` · `src/Admin.jsx` | Group page; owner sync |
| `src/render.js` | Canvas animation (`renderFrame(ctx, t, story, assets)`) |
| `src/export.js` · `src/share.js` | Video/PNG export; share links |
| `src/spotify.js` · `src/rank.js` | Optional login, autofill ranking, playlist calls |

Change `YEAR` in `src/rank.js` and `api/_lib.js` to reuse this next year.
