# Session 13 Handoff — 2026-04-01

## Session Summary

Cleared the backlog deck, built prompt intelligence v1, launched v2 chain-aware trials. Major productivity session — 7 tasks completed, 2 features shipped, full global backlog reviewed and prioritized.

## What Was Built

### Kanban Drag Reorder Fix (#38)
- **Root cause:** `handleDragEnd` had early return for same-column drags — only cross-column moves worked
- **Fix:** `sort_order` field on clips, `POST /clips/reorder` endpoint, optimistic same-column drag via `queryClient.setQueryData`
- **Also:** Cross-column drag now uses optimistic update with rollback on failure
- Commit: `66bbbeb`

### Type Coercion Hardening
- `WAN2GP_NUMERIC_FIELDS` set + `coerceNumericFields()` utility in `iterations.js`
- Coercion at 3 injection points: `next_changes` multi-field, user JSON overrides, safety-net before disk write
- Prevents string "8.5" overwriting number fields from Vision API or JSON editor

### Prompt Intelligence v1 (#18)
- **Backend:** `prompt-diff.js` — `diffPrompts()` (phrase-level, comma-tokenized), `computeFieldDeltas()` (15-field score deltas), `aggregatePhraseEffectiveness()` (chain aggregation)
- **Endpoint:** `GET /api/analytics/branch/:branchId/prompt-intelligence`
- **Frontend:** `PromptDiffInline.jsx` (green/red phrase tags), `usePromptIntelligence` hook (60s staleTime)
- **Integration:** Inline in IterationLineage (tags under nodes), IterationTable (Prompt Δ column), EvaluationPanel (collapsible Prompt Delta section with diff + field score impacts + confidence badge)
- **Attribution:** Rope-based confidence (high = prompt rope, mixed = non-prompt rope with prompt changes)
- 15 unit tests, design spec + implementation plan docs
- Commit: `a5f2690`

### Housekeeping
- Closed #36 (Rope 2 contamination — fixed session 12), #37 (validation trial — complete), #38 (kanban drag), #33 (ClipDetail already refactored)
- Deleted dead `useApi.js` — nothing imports it
- Confirmed negative prompt editing done (Rope 2b split resolved it)
- Disabled unnecessary plugins/MCPs for token efficiency

## v2 Chain-Aware Trials — IN PROGRESS

### Setup
- Created new clips (separate from v1 trials to avoid seed uniqueness constraint):
  - Mick v2: clip `ddfd836a`, branch `9c84272e`, seed `947486904`
  - Belinda v2: clip `25207d46`, branch `8f1023a1`, seed `1448784758`
- Same baseline JSONs as v1 trials, identical seeds
- Autopilot config: target 65/75, max 20 iterations, regression limit 3

### Status at Session End
- Mick: baseline scored 60/75, iter 2 rendering
- Belinda: baseline scored 54/75, iter 2 waiting for render
- Both autopilots running (`POST /api/autopilot/start`)
- Queue running

### v1 Baselines for Comparison
- Mick v1: `62→61→62→62→62→61→62→62→62→62→??→65` — SUCCESS at iter 12, Rope 1 × 100%
- Belinda v1: `54→52→54→56→59→57→58→57→58→57→57→58→57→59→57→58→59→57→57→57` — PLATEAU at 57/75, Rope 1 × 100%

### What to Watch
1. Does chain-aware scoring diversify rope selection? (should see Rope 2a, 3, 4, etc.)
2. Does it break the plateau faster?
3. Does `top_pain_points` appear in responses?
4. Any errors from history injection (token limit, malformed prompt)?
5. Are prompt changes showing up in the new Prompt Intelligence UI?

### CRITICAL: Backend Restart Kills Autopilot
Autopilot sessions are in-memory. If backend restarts, you must:
```bash
curl -s -X POST "http://localhost:3847/api/autopilot/start" \
  -H "Content-Type: application/json" \
  -d '{"branch_id": "9c84272e-fa19-4a75-b400-0bd6276684d2", "target_score": 65, "max_iterations": 20, "regression_limit": 3}'

curl -s -X POST "http://localhost:3847/api/autopilot/start" \
  -H "Content-Type: application/json" \
  -d '{"branch_id": "8f1023a1-cecc-48c7-aebd-0b611f74e0e1", "target_score": 65, "max_iterations": 20, "regression_limit": 3}'

curl -s -X POST "http://localhost:3847/api/queue/start"
```

## Global Backlog (Prioritized)

### Blocked by v2 Results
- #41 Autopilot frontend UI — design as generic "sessions" system (nursery concept)
- #39 Knowledge Ledger — permanent eval records
- #9 body_build scoring field — post-trial rubric change
- Prompt Intelligence visual testing

### Medium — Architecture
- #12 Wan2GP Python API (persistent model loading, ~5 min faster renders)
- Seedling Nursery / Character Registry (#25 concept)
- v3 Cross-character learning (depends on #39)
- #26 Disk growth phase 3

### Horizon
- #14 Statistical prompt correlation (C layer — telemetry dependent)
- #13 Seed intelligence
- Multi-target LoRA compiler (banked, marinating)
- LoRA shot list / training checklist (banked)
- Iteratarr public API (banked, horizon)
- #35 DaVinci export, #19 Cloud render, #30 Elder Council, #20-22 release items

### Polish Nits (Pre-Release)
See `memory/iteratarr-polish-nits.md` — goal save toast, view descriptions, seed screening dedup, LoRA name formatting, body_build field

## Commits This Session
- `66bbbeb` fix(#38): kanban drag reorder + type coercion hardening + cleanup
- `a5f2690` feat(#18): prompt intelligence v1 — phrase diffs, score correlation, inline UI

## Key Files Created/Modified
- `backend/prompt-diff.js` — NEW: diff engine + score deltas + phrase aggregation
- `backend/tests/prompt-diff.test.js` — NEW: 15 unit tests
- `backend/routes/analytics.js` — prompt intelligence endpoint
- `backend/routes/clips.js` — sort_order, reorder endpoint
- `backend/routes/iterations.js` — WAN2GP_NUMERIC_FIELDS, coerceNumericFields()
- `frontend/src/components/common/PromptDiffInline.jsx` — NEW: green/red phrase tags
- `frontend/src/components/kanban/EpisodeTracker.jsx` — same-column drag + optimistic updates
- `frontend/src/components/clips/ClipDetail.jsx` — promptIntel hook wiring
- `frontend/src/components/clips/IterationLineage.jsx` — prompt delta tags
- `frontend/src/components/clips/IterationTable.jsx` — Prompt Δ column
- `frontend/src/components/evaluation/EvaluationPanel.jsx` — Prompt Delta section
- `docs/superpowers/specs/2026-04-01-prompt-intelligence-design.md` — design spec
- `docs/superpowers/plans/2026-04-01-prompt-intelligence.md` — implementation plan

## Pre-Existing Uncommitted Changes
- `backend/routes/contactsheet.js` + `backend/routes/frames.js` — modified before this session, not committed (2 failing tests related to these)
- `iterations/` directory — untracked data files
- `docs/superpowers/handoff/2026-04-01-session-12-handoff.md` — previous session's handoff
