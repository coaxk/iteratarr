# Session 12 Handoff — 2026-04-01

## Session Summary

Monster session: scoring fixes, queue hardening, validation trial infrastructure, full v1 trial execution, prompt contamination root cause, Rope 2 split, and chain-aware scoring (#40) built.

## What Was Built

### Scoring Fixes
- **Vision image quality**: Removed spatial downsampling. WebP q90 at full resolution (was q80 + 2000px max resize). All contact sheets were hitting the 3.5MB threshold.
- **Vision status waste**: `checkVisionApi` was pinging Anthropic API every 5 min (8/10 tokens per ping). Now just checks key presence. Frontend `staleTime: Infinity`.
- **Rubric hardening**: `next_change_value` has explicit per-rope format rules. `qualitative_notes` marked REQUIRED.
- **Prompt contamination warning**: JSON patch editor warns when positive prompt contains negative quality terms (blurry, distorted, CGI, etc.).
- **Rope 2 split** (commit `f10ca56`): Split into Rope 2a (attention weighting → `prompt` field) and Rope 2b (negative prompt → `negative_prompt` field). Root cause: Rope 2 mapped to `prompt` but rubric told Vision it was the negative prompt rope. Vision correctly output negative terms as `next_change_value`, system applied them to the positive prompt.
- **Grand total display**: Shows number when `aiScores` is set (even if total happens to be 45).
- **Auto-score button**: Fixed nested buttons swallowing clicks (Sheet/Frames toggle was inside the button with stopPropagation). Added `!hasChild` gate.

### Queue Hardening
- **Ghost render detection**: Renders completing in <60s with no video file → marked as `failed`, not `complete`. Error message: "Ghost render: Wan2GP exited in Xs without producing a video file."
- **render_path derivation**: Queue now derives render_path from `output_filename` + Wan2GP output dir when iteration doesn't have one set.
- **Progress status race**: Progress updates now always include `status: 'rendering'` to prevent overwrite by concurrent DB writes.
- **Frame extraction timeout**: 90s AbortController on the self-fetch to `/api/frames/extract`.
- **Top-level try/catch**: `processQueue` wrapped so unhandled exceptions log and stop gracefully.
- **Failed jobs stay in Up Next**: Not in History. Visible for retry.
- **Completed items sort newest-first** in History.
- **Queue PATCH allows status/error**: For admin corrections of mismarked items.
- **`node --watch` kills queue**: CRITICAL — always use `npm start` not `npm run dev` when running queue. `--watch` restarts the server mid-render, killing the queue loop. The spawned Python process survives, holds resources, causes EADDRINUSE crash loop.
- **`frames_extracted: true`** (not false): Queue now sets true after 6-frame extraction, preventing lazy 32-frame expansion on view.
- **POST /api/iterations** now accepts `render_path` field.

### UI Fixes
- **Video freeze**: `Date.now()` cache buster in VideoPanel created new src on every render → video reload loop. Now uses stable per-path cache buster + `staleTime: Infinity` on video-exists query.
- **Failed count badges**: Clip cards and branch cards (SeedHQ) show "N failed" count.
- **Unscored count**: Excludes iterations with children + iterations on stalled/abandoned branches.

### Validation Trial (#37) — COMPLETE
- **Consistency test** (`POST /api/vision/consistency-test`): 5 scores of same render. Mick baseline: stdev 1.17, range 3 points (61-64). PASS.
- **Autopilot engine** (`routes/autopilot.js`): Unattended score→recommend→apply→render loop. Termination: target score, max iterations, or 3 consecutive regressions.
- **Mick trial**: `62→61→62→62→62→61→62→62→62→62→??→65` — SUCCESS at iter 12. Rope 1 × 100%, camera_movement stuck for 9 iters then lighting_correct switch at iter 10 may have unlocked breakthrough.
- **Belinda trial**: `54→52→54→56→59→57→58→57→58→57→57→58→57→59→57→58→59→57→57→57` — PLATEAU at 57/75 after 20 iterations. Rope 1 × 100%, wardrobe_correct × 100%.
- **Key findings**: v1 scoring is consistent and accurate. Converges slowly when target field is prompt-solvable (Belinda climbed 54→59). Plateaus when stuck on a single field+rope combination. The methodology works — the strategy needs diversification.

### Chain-Aware Scoring (#40) — BUILT, NOT YET TESTED
- **`iteration-history.js`** (new): `buildAncestorChain()`, `analyzeHistory()`, `formatHistoryForPrompt()`
- **Pattern detection**: Stuck fields (targeted 2+ times without improvement), oscillating fields, rope distribution, underused ropes, score trend
- **Prompt injection**: Adds ~450 tokens of structured history + warnings + guidance to Vision user prompt
- **Multi-target**: `top_pain_points` array in response (top 3 issues, not just single lowest)
- **Diminishing returns rule**: "If same rope+field failed 2+ times, MUST recommend different approach"
- **Backward compatible**: Non-fatal try/catch, iterations without parents get no history

### Issues Created
- **#36** (updated): Belinda LoRA/prompt contamination — root cause found (Rope 2 field mapping), fix shipped
- **#37**: Validation trial — COMPLETE, results documented
- **#38**: Kanban drag reorder bounces back — parked, low priority
- **#39**: Knowledge ledger — permanent evaluation records surviving storage cleanup
- **#40**: Chain-aware scoring — BUILT (commit `0da27b0`), needs testing
- **#41**: Autopilot as production feature — backend done, needs frontend UI

## Commits This Session
- `d0e8c3c` feat(#37): vision validation trial — autopilot engine, consistency test, scoring fixes (17 files, +1014/-132)
- `f10ca56` fix(#36): split Rope 2 into 2a (attention weighting) and 2b (negative prompt)
- `0da27b0` feat(#40): chain-aware scoring — inject iteration history into Vision prompt

## Next Session — Mission: Test Chain-Aware Scoring

### Step 1: Restart backend
```bash
cd C:/Projects/iteratarr/backend && npm start > /tmp/iteratarr-backend.log 2>&1 &
```

### Step 2: Create fresh v2 trial branches
Need new branches on the same Mick and Belinda validation trial clips using the SAME baseline JSONs and seeds. The v1 branches stay untouched for comparison.

- Mick clip: `11f79f72-df2a-463a-bd75-4a102c3d00b9`
- Belinda clip: `a4069bfe-115d-46d6-8cb7-0074928a01d1`
- Mick seed: `947486904`
- Belinda seed: `1448784758`
- Create branches named `mick-v2-chain-aware` and `belinda-v2-chain-aware`
- Create baseline iterations using the SAME JSON contents from the v1 trial iter_01 files
- Baseline JSON locations:
  - `C:/Projects/kebbin-shop/episode-01/validation-trial/mick-validation-trial/iterations/mick-validation-trial_iter_01.json`
  - `C:/Projects/kebbin-shop/episode-01/validation-trial/belinda-validation-trial/iterations/belinda-validation-trial_iter_01.json`

### Step 3: Queue baseline renders
Queue both, start queue, wait for renders.

### Step 4: Start autopilot
Same config: target 65, max 20 iterations, regression limit 3.

### Step 5: Compare
After v2 trials complete, compare:
- Did chain-aware scoring diversify rope selection? (should see rope_3, rope_4, etc.)
- Did it break the plateau faster?
- Did score trajectory show steeper improvement?
- Did the same fields get stuck?

### What to watch for
- Does the history injection cause any API errors? (token limit, malformed prompt)
- Does Vision actually follow the GUIDANCE directive? (diversify ropes)
- Does `top_pain_points` appear in responses?
- Any new bugs from the Rope 2a/2b split?

## Key Files Modified This Session
- `backend/vision-scorer.js` — rubric, image handling, consistency test, chain-aware injection
- `backend/routes/vision.js` — history loading, consistency test endpoint
- `backend/routes/queue.js` — ghost detection, render_path derivation, progress race fix, sort, frames_extracted
- `backend/routes/autopilot.js` — NEW: autopilot engine
- `backend/iteration-history.js` — NEW: ancestor chain builder + pattern analyzer
- `backend/routes/clips.js` — failed_count on clips
- `backend/routes/branches.js` — failed_count on branches
- `backend/routes/iterations.js` — render_path on POST
- `backend/server.js` — autopilot route mounting
- `frontend/src/constants.js` — Rope 2a/2b split
- `frontend/src/api.js` — autopilot + consistency test API bindings
- `frontend/src/components/evaluation/EvaluationPanel.jsx` — auto-score button fix, rope mapping, prompt warning, grand total
- `frontend/src/components/evaluation/FrameStrip.jsx` — WebP filter fix
- `frontend/src/components/evaluation/VideoDiff.jsx` — video freeze fix
- `frontend/src/components/kanban/ClipCard.jsx` — failed badge
- `frontend/src/components/clips/SeedHQ.jsx` — failed badge on branches
- `frontend/src/components/queue/QueueManager.jsx` — failed in Up Next
- `frontend/src/hooks/useQueries.js` — vision status staleTime
