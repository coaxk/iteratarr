# Session 10 Handoff — 2026-03-30

**For:** Next Claude session on Iteratarr
**Branch:** `main` (all pushed to origin)
**Last commit:** `1b279ef` — fix: guard LockedCard empty characters array in StallsTab
**Tests:** 98/98 passing (`cd backend && npx vitest run`)

---

## What Happened This Session

Implemented and shipped **#16 Cross-clip Analytics Dashboard** in full. 12 commits, TDD, two-stage review per task. Issue closed.

### Servers
Both are running in background (started this session):
- **Backend:** `node server.js` on port 3847
- **Frontend:** `npx vite` on port 3848

If servers are down on next session: `cd backend && node server.js` + `cd frontend && npx vite --port 3848`

---

## Production State

From `GET /api/analytics/overview`:

| Clip | Best | Iters | Stall |
|---|---|---|---|
| Mick — 3 new seed lines | 64/75 | 9 | — |
| Clip 1e — Mick Balcony | 62/75 | 35 | — |
| Jack Doohan — Baseline | 62/75 | 14 | — |
| Toby Price — Baseline | 60/75 | 8 | — |
| Belinda — Baseline | 58/75 | 9 | **PLATEAU** |

- 9 clips · 100 iterations · 61 evaluated · 0 locked · 1 stalling
- Lock threshold: 65/75. Nobody locked yet.
- Belinda is stalling (plateau). Mick Balcony needs a push past 65.

---

## What Was Built (#16)

### Backend
- `GET /api/analytics/overview` — `backend/routes/analytics.js` lines 340–587
  - Returns: `summary`, `clips[]`, `characters[]`, `ropes[]`, `score_distribution`
  - Stall detection: PLATEAU (requires ≥5 scored iters on active branches, last 4 don't beat earlier best), NO_EVALS (≥3 active iters, zero evaluations)
  - Abandoned/archived branches excluded. Locked clips excluded entirely.
  - 9 tests in `backend/tests/routes/analytics.test.js`

### Frontend
- `frontend/src/components/analytics/` — new directory with 5 components:
  - `CrossClipDashboard.jsx` — full-screen container, single `useOverviewAnalytics()` fetch
  - `OverviewTab.jsx` — pills + all-clips table + histogram
  - `CharactersTab.jsx` — per-character performance
  - `RopesTab.jsx` — horizontal delta bars
  - `StallsTab.jsx` — stall/locked/healthy sections
- `frontend/src/hooks/useQueries.js` — `useOverviewAnalytics()`, queryKey `['analytics', 'overview']`, staleTime: 60s
- `frontend/src/api.js` — `getOverviewAnalytics()`
- `frontend/src/App.jsx` — `analytics` added to VIEWS, CrossClipDashboard renders, ClipDetail gets `onNavigateToAnalytics`
- `frontend/src/components/clips/SeedHQ.jsx` — Analytics shortcut button in HQ header
- `frontend/src/components/clips/ClipDetail.jsx` — `onNavigateToAnalytics` prop chain

---

## Project Board State

| # | Title | Stage |
|---|---|---|
| #17 | Seed Intelligence | **Current** ← next to build |
| #18 | Prompt Intelligence | Next |
| #26 | Disk Growth Strategy | Backlog |
| #30 | Elder Au Council Security Review | Backlog |
| #19 | Cloud Render Integration | Backlog |
| #20 | Security Audit | Backlog |
| #21 | First-launch Onboarding | Backlog |
| #22 | Pinokio Installer | Backlog |

---

## Next Task: #17 Seed Intelligence

**Issue:** coaxk/iteratarr#17
**Title:** Seed intelligence — variance research, personality profiling, seed library

Scope from issue body:
- Seed variance research tooling
- Seed personality profiling (automated frame analysis)
- Seed library (searchable, scored, profiled)

### Integration points for #17

**Best entry point:** New tab in CrossClipDashboard (`frontend/src/components/analytics/`) + new endpoint inside `createAnalyticsRoutes`.

**Skeleton for backend:**
```js
// In backend/routes/analytics.js, inside createAnalyticsRoutes, before return router:
router.get('/seeds', async (req, res) => { ... })
```

**Skeleton for frontend:**
```js
// In CrossClipDashboard.jsx, add to TABS:
{ id: 'seeds', label: 'Seeds' }
// Create frontend/src/components/analytics/SeedsTab.jsx
// Add useSeedException hook in useQueries.js following useOverviewAnalytics pattern
```

**Data available right now from the existing DB:**
- `iterations.branch_id` — which branch each iter is on
- `branches.seed` — seed number for the branch root
- `evaluations.scores.grand_total` — per-iteration score
- `evaluations.attribution.rope` — what changed
- Frame files at `kebbin-shop/episode-01/scene-*/clip-*/frames/iter_NN/`
- Contact sheets at `kebbin-shop/episode-01/scene-*/clip-*/contact_sheets/`

**What a seed intelligence query needs:**
- Group iterations by `branches.seed` across all clips
- Per seed: how many clips tested it, best score achieved, avg score, which clip got furthest with it
- Variance: how different are the scores across clips for the same seed value?
- Cross-clip seed library: seeds that performed consistently well regardless of clip

**Personality profiling** (automated frame analysis) likely needs Vision API — this is the expensive part. Confirm scope before building.

### Warnings
- Do NOT break `GET /api/analytics/overview` — used by the dashboard and 9 tests
- Do NOT break `GET /api/analytics/branches/:clipId` — used by per-clip BranchAnalytics view
- The `characters` field on clips is a raw string array (no FK join) — same caveat applies for any cross-clip query
- staleTime on analytics hooks should stay at 60s minimum — not real-time data
- Read the existing `/overview` implementation before writing `/seeds` — it sets the pattern for O(1) lookups and aggregation

---

## Full Remaining Task List

### Phase 5 — Analytics & Intelligence (in progress)

| # | Title | Status | Notes |
|---|---|---|---|
| #17 | Seed intelligence — variance research, personality profiling, seed library | **Current** | Next to build |
| #18 | Prompt intelligence — versioning, effectiveness tracking, recommendations | Next | Word-level diff across iters, prompt effectiveness tracking, template recommendations |

### Concepts Banked (not yet issues)

**Queue improvements:**
- Queue-aware polling timeout — FrameStrip/VideoDiff 10-min timeout doesn't account for queue wait time (currently times out if render is queued and waiting). Fix: estimate wait time from queue depth.
- Inline render progress in iteration page — shows queue position before render starts (currently only shows progress after render begins)
- Queue thumbnail on completion — first frame thumbnail in completed queue card (designed, not built)

**SeedHQ / Seed Screening:**
- LoRA reminder on seed generation — when generating seeds, remind user which LoRAs are currently configured. Prevents "why does this seed look different" confusion.
- Seed HQ cross-clip view — see which seeds have been used across multiple clips (overlaps with #17 seed library)

**ClipDetail / UX:**
- ClipDetail state explosion refactor — ClipDetail is a god component. Deferred from Session 9 performance review. Low urgency while single-user.
- EvaluationPanel refactor — also a god component. Same deferral.

**Production pipeline:**
- Export to DaVinci workflow — once clips start locking, need a clean "export locked iteration for DaVinci" flow (currently manual)
- Batch evaluate queue — score multiple iterations in one Vision API session (batching reduces cost ~60%)

### Phase 6 — Infrastructure / Release (backlog)

| # | Title | Notes |
|---|---|---|
| #26 | Disk growth strategy | ~12MB/iter, 439MB at 37 iters, CS duplicated. Plan needed pre-release. |
| #30 | Elder Au Council security review | OWASP scan, path traversal, input validation, API key handling, rate limiting |
| #19 | Cloud render — fal.ai / RunPod | fal.ai confirmed Wan2.2 + dual LoRA. "Render in Cloud" button. |
| #20 | Security audit + testing protocol | Overlaps with #30 |
| #21 | First-launch onboarding wizard | New user: configure Wan2GP path, LoRA dir, project structure |
| #22 | Pinokio 1-click installer | Public release prerequisite |

### Production Goals (Kebbin's Shop)

- Mick Balcony (Clip 1e): currently 62/75, need 65 to lock. Iter_36 next.
- Mick — 3 new seed lines: 64/75, closest to lock across all clips
- Belinda — PLATEAU stall — needs a new strategy (different rope or seed change)
- 5 baseline clips (Jack/Toby/Judd/Matty/Belinda) still need iteration work
- 14+ additional clips not yet created for Episode 1

---

## Constants Reference

```js
// frontend/src/constants.js
SCORE_LOCK_THRESHOLD = 65   // green progress bar, lock eligibility
GRAND_MAX = 75               // denominator for all score displays
```

## Key Files

```
backend/
  routes/analytics.js          ← overview endpoint lines 340–587, /branches/:clipId above
  routes/clips.js / iterations.js / branches.js / seedscreen.js
  tests/routes/analytics.test.js

frontend/src/
  components/analytics/        ← all 5 analytics components
  components/clips/SeedHQ.jsx  ← Analytics button in header
  components/clips/ClipDetail.jsx
  hooks/useQueries.js          ← all TanStack hooks incl useOverviewAnalytics (line 209)
  api.js                       ← getOverviewAnalytics at line ~130
  constants.js                 ← SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPES
  App.jsx                      ← VIEWS object, routing, guardedNavigate
```
