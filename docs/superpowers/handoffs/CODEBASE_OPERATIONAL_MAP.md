# Iteratarr Codebase Operational Map

Last updated: 2026-03-31

## 1) Product Flow (Roots → Leaves)

Canonical workflow:
1. Character created in Character Registry
2. Seed screening / seed branching
3. Iteration loop (evaluate → attribute rope → generate next)
4. Lock winning iteration
5. Promote proven settings/seeds back to character-level defaults
6. Queue/production rollout

The app allows skipping ahead, but data model assumes scientific iteration discipline.

## 2) Runtime Topology

Backend entry: [server.js](C:/Projects/iteratarr/backend/server.js)  
Store: [store/index.js](C:/Projects/iteratarr/backend/store/index.js) (JSON blobs in SQLite)

Primary backend route domains:
- `/api/clips`, `/api/iterations`, `/api/characters`
- `/api/clips/:clipId/branches` + `/api/branches/:id/iterations`
- `/api/clips/:clipId/seed-screen`
- `/api/analytics/*`
- `/api/vision/*`
- `/api/queue/*`
- `/api/frames/*`, `/api/contactsheet/*`
- `/api/storage/*`

Frontend app shell: [App.jsx](C:/Projects/iteratarr/frontend/src/App.jsx)  
Shared server-state hooks: [useQueries.js](C:/Projects/iteratarr/frontend/src/hooks/useQueries.js)

## 3) Data/Domain Invariants

Critical invariants to preserve:
- One-variable-at-a-time iteration methodology
- Seed lock per branch (no mid-chain seed drift)
- Evaluated history is append-only (fork forward, don’t rewrite)
- Rope attribution remains first-class (`evaluation.attribution.*`)
- Character write-back (`proven_settings`, `best_iteration_id`) is strategic for roots-first architecture

Current statuses:
- Clip statuses in [validators.js](C:/Projects/iteratarr/backend/store/validators.js): `not_started, screening, in_progress, evaluating, locked, in_queue, archived`
- Branch statuses: `screening, active, stalled, locked, abandoned, superseded`

## 4) Performance Architecture (Current)

Query layer is centralized in [useQueries.js](C:/Projects/iteratarr/frontend/src/hooks/useQueries.js):
- Shared `queryKey`s prevent duplicate fetches
- Tiered polling by activity state (active vs idle)
- Analytics hooks cache 60s+ where real-time isn’t required

Current pattern to preserve:
- Prefer TanStack Query hooks over ad-hoc `setInterval`
- Invalidate narrowly (`['analytics','seed',id]`, `['analytics','seeds']`, etc.)
- Keep expensive aggregation server-side

## 5) Media/Storage Pipeline (Post #26)

Disk growth strategy now active:
- New frames extract to WebP (`frame_###.webp`)
- Vision + analytics support both WebP and legacy PNG where needed
- Queue extracts 6 preview frames immediately, full 32 extracted lazily on view
- Branch transition to `locked`/`abandoned` purges frame files (contact sheets preserved)
- Storage API + Storage page available for reclaim workflows

Key files:
- [frames.js](C:/Projects/iteratarr/backend/routes/frames.js)
- [queue.js](C:/Projects/iteratarr/backend/routes/queue.js)
- [branches.js](C:/Projects/iteratarr/backend/routes/branches.js)
- [storage.js](C:/Projects/iteratarr/backend/routes/storage.js)
- [FrameStrip.jsx](C:/Projects/iteratarr/frontend/src/components/evaluation/FrameStrip.jsx)
- [StoragePage.jsx](C:/Projects/iteratarr/frontend/src/components/storage/StoragePage.jsx)

## 6) Analytics/Intelligence Surfaces

Cross-clip and seed intelligence entry points:
- [analytics.js](C:/Projects/iteratarr/backend/routes/analytics.js)
- [CrossClipDashboard.jsx](C:/Projects/iteratarr/frontend/src/components/analytics/CrossClipDashboard.jsx)
- [SeedsTab.jsx](C:/Projects/iteratarr/frontend/src/components/analytics/SeedsTab.jsx)

Scope boundaries:
- #16: retrospective cross-clip reporting
- #17: seed behavior intelligence
- #18: prompt diff/effectiveness intelligence

## 7) Known Sharp Edges

- `clips.characters` still string-based (not FK); analytics joins rely on name/trigger conventions.
- Some long-lived local edits may exist outside active feature scopes; always stage explicitly.
- Process-scoped in-memory async job maps (e.g., seed profile jobs) reset on backend restart.

## 8) High-Signal Commands

Backend full regression:
```powershell
cd C:\Projects\iteratarr\backend
npx vitest run
```

Frontend build validation:
```powershell
cd C:\Projects\iteratarr
npm --prefix frontend run build
```

## 9) Collaboration Contract (Session-to-Session)

For every feature session:
1. Read latest handoff in `docs/superpowers/handoff*`
2. Verify current branch + dirty files before edits
3. Maintain explicit “done / left” tracker
4. End with a handoff doc + pushed commits
5. Never assume memory persistence across sessions; write context into docs

