# UX Evidence

Capture UX patterns from any website, note why they matter, and build a searchable UX/CRO evidence library — alone or with your team.

```
Chrome extension  ──┐
   (capture)        ├──▶  Supabase (free)  ◀──  Web app on Netlify (free)
                    │     auth · database ·       browse · search · edit · team
Local-only mode ◀───┘     screenshots
```

- **Extension** (`extension/`) — hover, click, annotate, save. Works with no account at all; sign in and it syncs.
- **Web app** (`web/`) — the big-screen library: grid, search, filters, detail, edit, delete, JSON export, team libraries with invite links and roles (owner / editor / viewer).
- **Database** (`supabase/`) — one SQL file. Row-level security means nobody can read a library they're not a member of.
- **Shared** (`shared/`) — types, search and the data-access layer used by both apps.

Everything runs on free tiers. The only paid thing in sight is Chrome's one-time $5 fee *if* you ever publish to the Web Store, which you don't need for yourself or your team.

---

## Setup (about 20 minutes, no credit card)

You will create three free accounts if you don't have them: **GitHub**, **Supabase**, **Netlify**. Do the steps in this order.

### 1 · Supabase — the backend

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**. Name it `ux-evidence`, pick a strong database password (you won't need it again), choose the region closest to you. Wait ~1 minute for it to provision.
3. Left sidebar → **SQL Editor** → **New query**. Open `supabase/migrations/0001_init.sql` from this repo, paste the whole file, click **Run**. You should see "Success. No rows returned".
4. (Nothing to do here. Supabase's default sign-in email works for both the web app and the extension. Editing email templates requires custom SMTP; see *Free-tier limits* below if you ever want that.)
5. **Project Settings → API**. Keep this tab open; you need two values from it:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ…`

   (The anon key is designed to ship to browsers. Row-level security is what protects the data. Never copy the `service_role` key anywhere.)

### 2 · GitHub — the code

1. Go to <https://github.com/new>. Name: `ux-evidence`, **Private**, no README. **Create repository**.
2. On your computer, open a terminal in the unzipped project folder and run:

   ```bash
   git init
   git add .
   git commit -m "UX Evidence Collector"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ux-evidence.git
   git push -u origin main
   ```

   (`.gitignore` already keeps `node_modules`, `dist` and `.env` files out.)

### 3 · Netlify — the web app

1. Go to <https://app.netlify.com> → sign up with GitHub.
2. **Add new site → Import an existing project → GitHub** → pick `ux-evidence`.
3. The build settings are read from `netlify.toml` automatically (`npm run build:web`, publish `web/dist`). Don't change them.
4. Before deploying, open **Add environment variables** (or later under *Site configuration → Environment variables*) and add:

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | the Project URL from step 1.5 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from step 1.5 |

5. **Deploy**. First build takes ~1 minute. You get a URL like `https://something-random.netlify.app`. Rename it under *Site configuration → Site details → Change site name* if you like.
6. Back in **Supabase → Authentication → URL Configuration**:
   - **Site URL**: your Netlify URL (e.g. `https://ux-evidence.netlify.app`)
   - **Redirect URLs**: add `https://ux-evidence.netlify.app/**`

   Without this, sign-in links point at `localhost`.
7. Open your Netlify URL, enter your email, click the link in the email. You're in; a personal library was created for you automatically.

### 4 · Chrome extension

1. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right).
2. **Load unpacked** → choose the `extension/dist` folder from the unzipped project. Pin the extension from the puzzle-piece menu.
3. Click the icon → at the bottom, **Connect to your cloud project** → paste the same Project URL and anon key → **Connect**.
4. **Sign in to sync** → your email → *Send sign-in email*. In the email, **right-click the "Sign in" link → Copy link address**, paste it into the extension → **Sign in**. (Don't click the link; it's single-use. If you've set up custom SMTP with `{{ .Token }}` in the template, a 6-digit code works too.) Anything you captured before signing in is uploaded to your personal library.

That's the whole setup. Every later `git push` redeploys the web app automatically.

---

## Daily use

| | |
| --- | --- |
| Capture an element | Extension icon → **+ Capture Evidence** → hover, click |
| Capture a region | Click-and-drag instead of clicking |
| Parent / child element | `↑` / `↓` while hovering, `Enter` to capture, `Esc` to cancel |
| Whole visible page | The ▾ next to the capture button |
| Shortcut | `⌘ ⇧ E` / `Ctrl ⇧ E` (change at `chrome://extensions/shortcuts`) |
| Save the form | `⌘ ↩` / `Ctrl ↩` — only *Observation* is required |
| Switch library | Dropdown at the bottom of the popup |
| Browse, search, edit, export | The web app |
| Invite a teammate | Web app → library → **Team** → **Create link** → send the link. They open it, sign in, done. |
| Roles | Owner manages members · Editor captures and edits · Viewer browses only |

### How sync behaves

- The extension is **local-first**: every capture lands in IndexedDB instantly, then uploads. Offline captures queue and upload later (also every 15 minutes in the background).
- Pulls are incremental; deletions propagate as tombstones. Last write wins by timestamp.
- Full-size screenshots download on demand when you open an item; thumbnails come with the sync.
- Signing out keeps the local copy readable. Disconnecting the project does too.

---

## Running locally (optional)

```bash
npm install                 # once, at the repo root (installs both apps)
cp web/.env.example web/.env   # paste the two Supabase values
npm run dev:web             # http://localhost:5173
npm run build               # builds extension/dist and web/dist
npm run typecheck
```

For local sign-in links to work, add `http://localhost:5173/**` to Supabase's Redirect URLs.

The extension can also take the Supabase values at build time (`extension/.env`) instead of being pasted into the popup; useful if you hand the built `dist/` folder to teammates pre-configured.

---

## Project layout

```
.
├── extension/                 Chrome extension (Manifest V3, React popup, vanilla content script)
│   ├── src/background/          service worker: screenshot, storage, message routing, sync
│   ├── src/capture/             in-page selection overlay + evidence form (no dependencies)
│   ├── src/popup/               library UI, account panel
│   ├── src/storage/             IndexedDB (local source of truth)
│   ├── src/sync/                Supabase client + push/pull engine
│   └── dist/                    ← load this folder in Chrome
├── web/                       React web app (Vite), deployed by Netlify
├── shared/                    types, search, Supabase data-access layer (used by both)
├── supabase/migrations/       database schema, RLS policies, triggers, RPCs
├── netlify.toml
└── package.json               npm workspaces root
```

## Verified

- Strict TypeScript, both apps; production builds clean.
- Database schema executed against real Postgres (PGlite) with a test suite covering: personal library auto-creation, library isolation between users, editor/viewer/owner permissions, invite link lifecycle (single use, expiry, unauthenticated rejection), storage path policies, soft-delete tombstones for incremental sync, leave/delete rules, `updated_at` monotonicity.
- Extension storage/sync state machine tested: local → adopted → pending → synced transitions, stale-ack protection, last-write-wins on pull, tombstones hidden from the library, library-scoped listing.
- Popup, capture overlay, in-page form, web library and team pages rendered and checked visually.

## Free-tier limits worth knowing

- **Supabase free**: 500 MB database, 1 GB file storage (≈ 3,000–10,000 captures), project pauses after 7 days without traffic (wakes on next request; nothing is lost). Built-in auth email is rate-limited to a handful per hour and its templates can't be edited — fine for a team. Plugging in a free SMTP provider (Brevo: 300/day, no domain needed) under *Authentication → SMTP Settings* lifts the limit and unlocks template editing, e.g. adding `{{ .Token }}` so the extension can use a 6-digit code instead of the pasted link.
- **Netlify free**: 100 GB bandwidth, 300 build minutes/month. The app is static; it won't come close.

## Not built (yet)

AI categorisation and analysis, full-page stitched screenshots, Figma/Notion export, realtime presence, comments. The schema and the storage seam (`shared/api.ts`, `extension/src/storage/evidenceStore.ts`) are the places those would attach.
