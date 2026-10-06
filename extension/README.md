# UX Evidence Collector — Chrome extension

See the root `README.md` for full setup. Short version:

```
chrome://extensions → Developer mode → Load unpacked → this folder's dist/
```

Then in the popup: **Connect to your cloud project** (paste Supabase URL + anon key) → **Sign in to sync**. Skip both and it works purely locally.

## Architecture

```
popup ─START_CAPTURE─▶ worker ─inject content.js─▶ page
                                                   │ user selects element/region
                       worker ◀─CAPTURE_AREA(rect)─┘
                       captureVisibleTab → crop → thumbnail → IndexedDB draft
page ◀──DraftCreated(preview)── worker
 │ user fills form
 └──SAVE_EVIDENCE(draftId, fields)──▶ worker ─▶ saved locally ─▶ sync push (if signed in)
```

- **Permissions**: `activeTab`, `scripting`, `storage` (session + project config), `alarms` (background sync). No host permissions; the content script is injected only when you click capture.
- **Content script** is vanilla TypeScript in a closed shadow root — small, inert, immune to page CSS.
- **Local-first**: IndexedDB is the source of truth. `sync/` pushes `pending` rows and pulls by `updated_at`; deletions are tombstones until acknowledged.
- **Two Vite builds**: popup + worker as ES modules, content script as a single IIFE.

## Build

```bash
npm install          # at the repo root
npm run build        # in this folder, or `npm run build:extension` at the root
npm run typecheck
```

Optional `extension/.env` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` pre-configures the cloud project at build time so teammates don't have to paste it.
