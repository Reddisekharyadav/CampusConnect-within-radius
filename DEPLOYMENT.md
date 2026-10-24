# CampusConnect — zero-cost production deployment plan

> **STATUS: UNEXECUTED — this is a plan only.** Nothing in this file has been
> deployed, no hosting account has been created, and no credentials have been
> set. The user must choose the hosting accounts (step 0) before anyone runs
> these steps. All tiers below are the providers' free tiers at the time of
> writing; free-tier limits change, so re-check them before launch.

## What "production" means here, honestly

After the `campusconnect-improvements` branch, the app is much safer than
the original main branch, but it is **not yet a finished consumer
product**:

- ✅ Token auth at register/login, ownership enforced on every mutation
- ✅ Passwords scrypt-hashed, session tokens stored only as SHA-256 hashes
- ✅ Delete account, two-way block, private reports (no auto-ban)
- ✅ Coarse ~100 m stored locations, nothing stored while invisible,
  mutual-radius discovery, banded (10 m) distances in `/nearby`
- ✅ Rate limits, strict validation, demo users quarantined
- ✅ Mobile auth wired (register/login/logout, Bearer token, Block/Report,
  Wave, sign out, delete account) — mobile no longer gets 401s on the
  protected endpoints
- ✅ Socket.IO realtime ported into `backend/server.js` behind the same
  token auth (unauthenticated sockets are rejected at handshake); legacy
  `server.ts` — which had zero auth — has been **deleted** from the repo
- ✅ Mutual interest before chat: wave → accept → match, then peer chat
  (`/messages` + Socket.IO `send_message`) is rejected for non-matches
- ✅ Client-side blur (coordinates snapped before upload, web + mobile),
  location discovery TTL (5 minutes, memory + Mongo sweeps), production
  CORS guard (refuses to start with `ALLOWED_ORIGINS=*` or unset)
- ✅ Moderation UI (web: blocks with unblock, own reports, incoming waves,
  matches + peer messages) and a Privacy & Safety page in the web app;
  production demo-seed guard is logged at startup and unit-tested
- ✅ Backup tooling: `backend/scripts/backup.sh` (mongodump) and
  `restore.sh` (mongorestore) — syntax/help verified, **never run against
  a real cluster yet** (no Atlas account exists)
- ❌ **Still open:** rate limiting is per-process, so it only holds on a
  single backend instance; there is no admin moderation queue UI (reports
  live in the database and are viewable by their reporter only); no
  uptime monitoring, no privacy policy / terms page yet; no MongoDB-backed
  verification run and no real-device mobile build yet. A real public
  launch should add those, or launch as a closed campus pilot first.

Recommended launch shape: **closed pilot** (one campus, invited users),
not an open public launch, until the items above are closed.

## Realtime, neatly

Socket.IO now lives in `backend/server.js` only. The handshake must carry
a valid session token (`auth.token`, or an `Authorization: Bearer`
header); unauthenticated sockets are rejected before joining any room.
Authenticated sockets can: send `location_update` (snapped, visible-only),
`wave` / `wave_accept` / `wave_decline`, and `send_message` (matched
users only). The server fans out `nearby_change` (banded distance, no
coordinates) to connected users within mutual radius, and `wave_received`
/ `match` / `new_message` to the right user rooms. Web clients do not
need sockets: they poll `/nearby` on an interval, which is the fallback
if sockets are unavailable.

## Architecture (all free tier)

| Piece | Suggested free host | Why |
|---|---|---|
| Web frontend (static Vite build) | Cloudflare Pages, Netlify, or Vercel (free tier) | Static hosting, free HTTPS, deploy from the GitHub branch |
| Backend (Node/Express) | Render free tier, Railway trial/free, or Fly.io free allowance | Single instance — required, because rate limiting is per-process |
| Database | MongoDB Atlas M0 (free, 512 MB) | The backend already speaks Mongoose; no code change |

Do **not** run two backend instances on the free tier: the in-memory
rate limiter and the in-memory preview store are per-process. If you
scale out later, replace `backend/lib/rateLimit.js` with a shared store
(Redis/Upstash) first.

## Step 0 — user choices needed (nothing to guess)

1. Which frontend host (Cloudflare Pages / Netlify / Vercel)?
2. Which backend host (Render / Railway / Fly.io)?
3. A MongoDB Atlas account + M0 cluster name, and a database user
   (least privilege: readWrite on the one database only).
4. The final frontend origin URL (needed for `ALLOWED_ORIGINS`).
5. Whether the AI chat is in scope for launch at all. If not, simply
   leave `OPENROUTER_API_KEY` unset — `/chat` then returns 503, which
   is the intended "not configured" behaviour, not a bug.

## Step 1 — prepare the branch (local, no deploy)

```bash
git checkout campusconnect-improvements
git status          # must be clean
cd backend && npm test        # must be 21+ tests, 0 failures
cd ../.. && npm ci && npm run lint && npm run build   # web must pass
```

## Step 2 — database (Atlas M0)

1. Create the M0 cluster, a database user, and allow network access
   from the backend host only (Atlas IP allowlist: the backend host's
   egress IPs, or 0.0.0.0/0 only as a temporary pilot shortcut — note
   it down as a security debt if you do).
2. Copy the `mongodb+srv://` connection string. It contains a password:
   put it in the backend host's secret store only, never in git.

## Step 3 — backend deploy (one instance)

Set these environment variables on the backend host — and nothing else
secret-like. There is **no auth/JWT secret** in this design (see
`backend/lib/auth.js`); do not invent one.

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `ALLOWED_ORIGINS` | The exact frontend origin, e.g. `https://campusconnect.pages.dev` |
| `OPENROUTER_API_KEY` | Only if chat is in scope; otherwise leave unset |
| `OPENROUTER_MODEL` | `openrouter/free` (or leave default) |
| `NODE_ENV` | `production` |
| `ALLOW_MEMORY_MODE` | **Unset** (so a missing DB fails loudly instead of silently losing data) |
| `ALLOW_DEMO_SEED` | **Unset** |
| `ALLOW_DEMO_SEED_PRODUCTION` | **Unset** |

Start command: `node server.js` from `backend/` (or `npm start` there).
Health check: `GET /health` must report `mode: "mongo"` and
`dbConnected: true`. If it reports `mode: "memory"` in production,
**stop** — the database is not connected.

## Step 4 — frontend deploy (static)

1. Build with `VITE_API_BASE_URL` set to the deployed backend URL.
2. Deploy the `dist/` output to the chosen static host.
3. Confirm HTTPS, then set the backend's `ALLOWED_ORIGINS` to that
   exact origin and redeploy the backend if needed.

## Step 5 — pilot smoke test (before inviting anyone)

Register → login → update location → nearby → block → unblock →
report → delete, exactly as in the local smoke test
(`/tmp/campus-smoke.mjs` pattern, against the deployed URLs, with
throwaway pilot accounts). Every step must behave as it did locally.
Also verify: unauthenticated `/update-location` returns 401, and a
second user's token cannot move the first user's profile (403).

## Step 6 — operating notes

- **Backups:** Atlas M0 has no point-in-time backup. Use the scripts in
  `backend/scripts/` (unexecuted against any real cluster so far):
  `MONGODB_URI="..." bash scripts/backup.sh` writes a timestamped
  mongodump; `MONGODB_URI="..." bash scripts/restore.sh <dump-dir>`
  restores it (add `--drop` only after typing YES at the prompt).
  Always restore to a throwaway database first and smoke-test. Run a
  backup before any schema change, and test a restore at least once
  before inviting pilot users — an untested backup is not a backup.
- **Reports:** there is no admin UI. Review reports directly in Atlas
  (read-only user) until a moderation screen is built. Never publish
  report contents.
- **Delete requests:** `DELETE /auth/me` with `{"confirm": "DELETE"}`
  is permanent and also removes that user's reports and blocks.
- **Free-tier sleeping:** Render's free tier sleeps after inactivity;
  the first request after sleep is slow. For a pilot this is acceptable;
  for a real launch, budget for a paid instance or a host without sleep.
- **Costs to watch:** OpenRouter (only if chat is enabled), Atlas M0
  storage (512 MB cap), backend host hours. Everything else in this
  plan is $0 at free-tier scale.

## What to decide after this plan

- Push `campusconnect-improvements` (PR to main, so CI runs)? Note: a
  push attempt previously failed with 403 from the GitHub App — the repo
  must be installed/selected for Muse before any push can succeed.
- Hosting account choices (step 0) — frontend host, backend host, Atlas
  cluster, final frontend origin, whether AI chat is in scope?
- Admin moderation queue UI, uptime monitoring, privacy policy / terms
  page — before or after the pilot?
