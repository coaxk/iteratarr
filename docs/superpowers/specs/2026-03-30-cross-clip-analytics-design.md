# Cross-Clip Analytics Dashboard — Design Spec
**Date:** 2026-03-30
**Issue:** coaxk/iteratarr#16
**Status:** Approved

---

## Overview

A full-screen analytics view giving a bird's-eye view of all clips, characters, and rope strategies across the entire production. Surfaces stalling clips before they waste iterations, shows which ropes are actually working cross-clip, and celebrates locked clips.

---

## Navigation & Entry Points

- **Nav bar icon** — chart icon in the main nav bar alongside Clips, Characters, Queue. Always accessible.
- **Seed HQ shortcut** — "Analytics" button in the Seed HQ header bar for quick access while iterating.
- **Layout** — full-screen takeover (same pattern as existing Kanban/EpisodeTracker). Back button returns to previous view.

---

## Layout

Four tabs inside the full-screen view:

1. **Overview** — summary pills + all-clips table + score histogram
2. **Characters** — per-character performance table
3. **Ropes** — cross-clip rope effectiveness horizontal bar chart
4. **Stalls** — stalling clips, locked clips, healthy clips

---

## Tab Specs

### Overview

**Summary pills (top row):**
- Clips (total count)
- Iterations (total)
- Evaluated (iterations with a scored evaluation)
- Locked (clips with `locked_iteration_id` set) — green
- Stalling — red, links to Stalls tab on click

**All Clips table:**
Columns: Clip name · Character · Status · Best score (/75) · Iter count · Progress bar · Stall badge

- Progress bar width = `best_score / 65` (lock threshold), capped at 100%. Colour: green ≥65, amber ≥43, red otherwise.
- Stall badge: `⚠ plateau` (red) or `⚠ no evals` (purple) — only on actively stalling clips
- Locked clips show a green `✓ locked` badge instead
- Clips with zero iterations shown at bottom, dimmed

**Score Distribution histogram:**
- Buckets: 0–15, 15–30, 30–45, 45–60, 60–75
- Bar colour: blue (0–30), amber (30–60), green (60–75)
- Footer stats: median · mean · high · lock threshold line

---

### Characters

Table of all characters that appear on at least one clip.

Columns: Character · Clips · Total iters · Best score · Avg score · Best progress bar

- Avg score = mean grand_total across all evaluated iterations for that character (not per-clip avg)
- Characters with zero evaluated iterations shown dimmed at bottom
- Sorted by best score descending (nulls last)

---

### Ropes

Horizontal bar chart — one row per rope that has been used at least once across all clips.

Columns: Rope name · Delta bar (green = positive avg, red = negative avg) · Use count · Success rate %

- Sorted by avg delta descending
- Footer note explaining metric: "avg score delta per use · success rate = % of uses with positive delta"
- Only ropes with ≥1 attributed use shown

---

### Stalls

Three sections:

**Stalling (red border cards):**
Each card shows: clip name · character · stall type badge · description · excluded branch count (if any)

- `PLATEAU` badge (red): best score on active branches unchanged for 4+ consecutive iterations
- `NO EVALS` badge (purple): active branches have 3+ iterations with zero evaluations

**Locked ✓ (green border cards):**
- One card per locked clip — name, character, locked score, locked iter
- Never flagged for stall detection

**Progressing normally:**
- Compact list of all other active clips

**Stall logic (shown in footer note):**
- Abandoned branches excluded from all stall checks
- Locked clips (`locked_iteration_id` set) excluded from all stall checks
- "Active branches" = branches with status not in `['abandoned', 'archived']`

---

## Backend — New Endpoint

### `GET /api/analytics/overview`

Aggregates across all clips. No parameters.

**Response shape:**
```json
{
  "summary": {
    "clip_count": 9,
    "iteration_count": 100,
    "evaluated_count": 64,
    "locked_count": 0,
    "stalling_count": 2
  },
  "clips": [
    {
      "id": "...",
      "name": "Clip 1e — Mick Balcony",
      "characters": ["mckdhn"],
      "status": "in_progress",
      "locked_iteration_id": null,
      "best_score": 61,
      "iteration_count": 18,
      "evaluated_count": 14,
      "stall": { "type": "plateau", "detail": "unchanged for 4 iters", "excluded_branch_count": 2 }
    }
  ],
  "characters": [
    {
      "name": "mckdhn",
      "clip_count": 3,
      "total_iterations": 38,
      "best_score": 61,
      "avg_score": 53
    }
  ],
  "ropes": [
    {
      "rope": "rope_3_lora_multipliers",
      "label": "Rope 3 — LoRA Multipliers",
      "count": 4,
      "avg_delta": 12.0,
      "success_rate": 75
    }
  ],
  "score_distribution": {
    "buckets": [
      { "range": "0–15", "count": 3 },
      { "range": "15–30", "count": 7 },
      { "range": "30–45", "count": 14 },
      { "range": "45–60", "count": 24 },
      { "range": "60–75", "count": 16 }
    ],
    "median": 52,
    "mean": 49,
    "high": 61
  }
}
```

All data derived from existing `clips`, `branches`, `iterations`, `evaluations` collections. No new schema changes.

---

## Frontend

### New files
- `frontend/src/components/analytics/CrossClipDashboard.jsx` — full-screen container with tab state
- `frontend/src/components/analytics/OverviewTab.jsx` — summary pills + clips table + histogram
- `frontend/src/components/analytics/CharactersTab.jsx` — character performance table
- `frontend/src/components/analytics/RopesTab.jsx` — rope effectiveness bars (using Recharts `BarChart`)
- `frontend/src/components/analytics/StallsTab.jsx` — stall cards + locked + healthy sections

### Modified files
- `frontend/src/hooks/useQueries.js` — add `useOverviewAnalytics()` hook
- `frontend/src/api.js` — add `getOverviewAnalytics()`
- `frontend/src/App.jsx` — add Analytics nav icon + view routing
- `frontend/src/components/screening/SeedHQ.jsx` — add Analytics shortcut button in header

### Query config
```js
useQuery({
  queryKey: ['analytics', 'overview'],
  queryFn: () => api.getOverviewAnalytics(),
  staleTime: 60_000,   // 1 min — not real-time, fine to cache
  gcTime: 5 * 60_000,
})
```

---

## Stall Detection Logic (backend)

```
For each clip:
  if clip.locked_iteration_id is set → skip (locked)

  activeBranches = branches where status NOT IN ['abandoned', 'archived']

  PLATEAU check:
    scoredIters = iterations on activeBranches with evaluations, sorted by iteration_number desc
    if scoredIters.length >= 4:
      bestScoreOverall = max of ALL scoredIters scores
      last4Max = max of scoredIters.slice(0, 4) scores
      if last4Max <= bestScoreOverall AND last4Max == bestScoreOverall → flag PLATEAU
      // i.e. the 4 most recent scored iters have not pushed past the all-time best

  NO EVALS check:
    activeIters = iterations on activeBranches
    if activeIters.length >= 3 AND zero have evaluations → flag NO EVALS
```

---

## Out of Scope

- Per-clip drill-down from this dashboard (already exists in BranchAnalytics)
- Real-time updates (staleTime: 60s is sufficient)
- Export / CSV download
- Filtering or sorting controls (first version — add later if needed)
