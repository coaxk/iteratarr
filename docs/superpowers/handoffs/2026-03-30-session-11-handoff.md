# Session 11 Handoff — 2026-03-30

**For:** Next Claude session on Iteratarr
**Branch:** `main` (all pushed to origin)
**Last commit:** `32426a5` — chore(#17): dedupe analytics constants and normalize minor error handling
**Tests:** 113/113 passing (`cd backend && npx vitest run`)

---

## What Happened This Session

### Queue UX fixes (#27, #31, #32) + close #28
Four small banked issues shipped:

- **#27**: `QueueManager.jsx` — seed screening jobs now show completion thumbnails. Guard was `item.iteration_id &&`; widened to `(item.iteration_id || item.json_path) &&`.
- **#28**: Closed — LoRA reminder was already implemented at `SeedScreening.jsx:454`.
- **#31**: `EvaluationPanel.jsx` — tiered refetchInterval: 30s when queued, 10s when rendering, false otherwise (was flat 10s).
- **#32**: `backend/routes/queue.js` — `/iteration/:iterationId` now returns `position` (1-based index among queued items). EvaluationPanel banner shows "In queue — position N".

### Vision API prompt caching
`backend/vision-scorer.js` — added `anthropic-beta: prompt-caching-2024-07-31` header and marked `SCORING_RUBRIC` system prompt with `cache_control: { type: 'ephemeral' }`. Rubric (~700 tokens) is paid once per 5-minute rolling window. Backend logs now show `[cache write]` / `[cache hit]`. Token usage surfaced in `scoreFrames` return value (`cache_hit`, `tokens_used`).

### #17 Seed Intelligence — reviewed + fixed
Codex agent implemented #17 in a single commit (`be2bc11`). Post-review fixes (`87b9b2a`, `32426a5`):
- `GET /seeds/:seed` was loading global iterations/evaluations tables — scoped to branch-linked records only
- Hardcoded `65` threshold replaced with config-driven `score_lock_threshold`
- Frontend profile status polling now has timeout guard (no longer spins forever on server restart)
- `ROPE_LABELS` and `TRAIT_DEFINITIONS` deduped to module-level constants
- Internal `catch` paths normalised to 500 (explicit validation still 400)
- Fragile dep array in `SeedsTab` removed, compare lookup simplified to single `useMemo`

**Backend needed restart** after #17 landed — old process didn't have the new `/analytics/clips/:clipId/seed-thumbnails` route, causing blank thumbnails in SeedHQ. Fixed by killing PID and restarting.

### Board cleanup
- #34 (Batch Vision API) — closed, won't build. Prompt caching solves the cost problem; async batch API's 24h turnaround kills interactive workflow.
- #35 (DaVinci export) — moved to Phase 6
- #26 (Disk growth) — moved to Phase 5
- #33 (ClipDetail refactor) — moved to Phase 5

---

## Servers

Both running:
- **Backend:** `node server.js` on port 3847
- **Frontend:** `npx vite` on port 3848

If down: `cd backend && node server.js` + `cd frontend && npx vite --port 3848`

---

## Production State

| Clip | Best | Iters | Note |
|---|---|---|---|
| Mick — 3 new seed lines | 64/75 | 9 | Closest to lock |
| Clip 1e — Mick Balcony | 62/75 | 35 | — |
| Jack Doohan — Baseline | 62/75 | 14 | — |
| Toby Price — Baseline | 60/75 | 8 | — |
| Judd — Baseline | 60/75 | 9 | — |
| Mick Doohan — Baseline | 59/75 | 6 | — |
| Belinda — Baseline | 58/75 | 9 | **PLATEAU stall** |
| Matty — Baseline | 57/75 | 9 | — |

- 9 clips · 100 iterations · 61 evaluated · 0 locked
- Lock threshold: 65/75. Nobody locked yet.
- Queue loaded overnight — Vision API scoring session imminent (prompt caching will kick in from eval #2)

---

## Project Board State

| # | Title | Phase |
|---|---|---|
| #18 | Prompt Intelligence | **Phase 5 — next** |
| #26 | Disk Growth Strategy | Phase 5 |
| #33 | ClipDetail refactor | Phase 5 (deferred, low urgency) |
| #35 | DaVinci export workflow | Phase 6 |
| #30 | Elder Au Council Security Review | Phase 6 |
| #19 | Cloud Render Integration | Phase 6 |
| #20 | Security Audit | Phase 6 |
| #21 | First-launch Onboarding | Phase 6 |
| #22 | Pinokio Installer | Phase 6 |

---

## Next Task: #18 Prompt Intelligence

**Issue:** coaxk/iteratarr#18
**Title:** Prompt intelligence — versioning, effectiveness tracking, recommendations

Scope (from issue):
- Word-level diff across iterations to track what changed
- Prompt effectiveness tracking — which prompt changes correlate with score improvements
- Template recommendations based on what's worked

**Integration points:**
- New tab in `CrossClipDashboard` (alongside Seeds, Overview, etc.)
- New endpoint(s) in `backend/routes/analytics.js` inside `createAnalyticsRoutes`
- Follow the seeds endpoint pattern: O(1) lookups, single-pass aggregation
- `iterations.json_contents` contains the full Wan2GP config including prompt fields
- `evaluations.scores.grand_total` for correlation
- `evaluations.attribution.rope` — already identifies which rope each change was on

**Warnings:**
- Do NOT break existing analytics endpoints — 9+ tests cover them
- staleTime on analytics hooks stays at 60s minimum
- Read the `/overview` and `/seeds` implementations before writing `/prompts` — they set the aggregation pattern

---

## Key Architecture Notes (for #17 work)

### Seed Intelligence endpoints (all new this session)
- `GET /api/analytics/seeds` — cross-clip seed performance list
- `GET /api/analytics/seeds/:seed` — detail for one seed (queries only branch-linked records)
- `POST /api/analytics/seeds/:seed/personality-profile` — async Vision API job; fast-path if cached
- `GET /api/analytics/seeds/:seed/personality-profile/status` — job status polling
- `GET /api/analytics/clips/:clipId/seed-thumbnails` — batched thumbnails (replaced per-row fan-out)
- In-memory job map `seedPersonalityJobs` — process-scoped, lost on restart (by design, fallback handles it)

### SeedsTab (`frontend/src/components/analytics/SeedsTab.jsx`)
838-line component. Key hooks: `useSeedsAnalytics`, `useSeedAnalytics`, `useSeedPersonalityProfileStatus`.
Profile polling stops when `status !== 'queued' && status !== 'running'` AND has a frontend timeout guard.

### Vision API caching
`backend/vision-scorer.js` — `scoreFrames()` returns `cache_hit` bool + `tokens_used` object.
Log output: `[Vision] Score: 62/75 (contact_sheet) [cache hit]`

---

## Key Files

```
backend/
  routes/analytics.js       ← overview (340–587), seeds (590+), seed-thumbnails, personality-profile
  routes/queue.js            ← /iteration/:iterationId now returns position field
  vision-scorer.js           ← prompt caching on SCORING_RUBRIC, tokens_used in return
  routes/vision.js           ← cache hit logging in single + batch score paths
  tests/routes/analytics.test.js  ← 113 tests total

frontend/src/
  components/analytics/SeedsTab.jsx        ← new (838 lines)
  components/analytics/CrossClipDashboard.jsx  ← Seeds tab added
  components/clips/SeedHQ.jsx              ← useSeedThumbnails, profile panel
  components/queue/QueueManager.jsx        ← seed job thumbnail fix
  components/evaluation/EvaluationPanel.jsx ← tiered polling, queue position banner
  hooks/useQueries.js                       ← useSeedThumbnails, useSeedsAnalytics, useSeedAnalytics, useSeedPersonalityProfileStatus
  api.js                                    ← getSeedThumbnails, getSeedsAnalytics, getSeedAnalytics, triggerSeedProfile, getSeedProfileStatus
```
