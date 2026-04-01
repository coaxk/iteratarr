# Prompt Intelligence v1 — Design Spec

**Date:** 2026-04-01
**Issue:** #18
**Status:** Draft

## Problem

Iteration chains accumulate prompt changes but there's no way to see which changes actually moved scores. Users scroll the chain manually correlating "what did I change" with "what improved." The data exists — it just isn't surfaced.

## What This Is

Smart inline prompt analytics that tell you which specific prompt words/phrases correlated with which field score changes, using the Five Rope attribution system as the primary signal.

## What This Is NOT

- Not a prompt editor or generator (that's the B layer, future)
- Not a cross-user recommendation engine (that's the C layer, telemetry-dependent)
- Not a new page, tab, or panel — it lives inline in existing views

## Architecture

### Data Flow

```
Iteration chain (parent → child → grandchild...)
  Each iteration has:
    - json_contents.prompt / negative_prompt (the text)
    - evaluation.scores (15-field breakdown)
    - evaluation.attribution.rope (which rope was used)
    - evaluation.attribution.next_change_json_field (what was targeted)
    - change_from_parent (summary string)
    - parent_iteration_id (chain link)
```

### Attribution Strategy

**Primary signal: Rope-based attribution (B)**
The Five Rope methodology enforces single-variable changes. When Rope 1 (prompt) was used and the prompt changed, attribute score deltas to those specific word changes. High confidence.

**Fallback: Multi-variable acknowledgement (A)**
When user overrides cause multiple simultaneous changes (e.g., prompt + guidance_scale), tag the score delta as "mixed change" with lower confidence. Still show the diff, but flag that attribution is uncertain.

**Future: Statistical correlation (C) — DEFERRED**
Aggregate phrase→score patterns across many iterations, characters, and eventually users via telemetry. Own backlog item on horizon.

### Word-Level Diff Engine

Backend utility that takes two prompt strings and returns structured diff:

```js
diffPrompts(
  "mckdhn, older australian man, standing on a balcony, looking toward camera",
  "mckdhn, older australian man, standing on a balcony, looking toward camera, natural expression, outdoor light"
)
// Returns:
// { added: ["natural expression", "outdoor light"], removed: [], unchanged_count: 10 }
```

Tokenization: split on `, ` (comma-space) for prompt phrases — prompts are comma-delimited phrase lists, not prose. This gives meaningful semantic units rather than individual words.

### Score Delta Calculation

For each iteration with a parent:
```js
{
  iteration_id,
  parent_id,
  rope_used,           // "rope_1_prompt", "rope_2a_attention", etc.
  prompt_diff: { added: [...], removed: [...] },
  negative_prompt_diff: { added: [...], removed: [...] },
  field_deltas: {      // per-field score change vs parent
    face_match: +1,
    camera_movement: 0,
    lighting_correct: -1,
    ...
  },
  grand_total_delta: +2,
  confidence: "high" | "mixed"  // high = single rope, mixed = user override
}
```

### Phrase Effectiveness Aggregation

Across a branch's chain, aggregate per-phrase stats:

```js
{
  phrase: "natural expression",
  appearances: 3,            // iterations where this phrase was present
  added_at_iteration: 4,     // when it first appeared
  avg_score_delta_on_add: +1.5,  // average grand_total change when added
  field_correlations: [      // which fields moved when this phrase appeared
    { field: "face_match", avg_delta: +1.0 },
    { field: "action_executed", avg_delta: +0.5 }
  ]
}
```

## UI Integration

### 1. Iteration Lineage / Table — Compact Tag

Below each iteration node that has prompt changes:

```
Iter #4  62/75  (+2)
  prompt: +natural expression, +outdoor light → face_match +1
```

- `text-xs font-mono` matching existing design
- Green for additions, red (score-low) for removals
- Only shows when prompt actually changed (most Rope 1 iterations)
- Collapsed by default in table view, always visible in lineage

### 2. Evaluation Panel — Prompt Delta Section

Between the score display and the attribution section. Collapsible, default open when prompt changed.

**Content:**
- Word-level diff: green highlight for added phrases, red strikethrough for removed
- Score impact: field-level deltas displayed as small +/- badges next to changed fields
- Confidence badge: "Rope 1 — high confidence" or "Mixed change — multiple variables"
- If the phrase has appeared before in the chain: "natural expression: added iter #4, avg impact +1.5"

### 3. NOT Built Yet (Future)

- Cross-clip prompt overview panel (option 2 from brainstorm — lower priority)
- Prompt recommendations / suggestions (B layer)
- Cross-user statistical correlation (C layer — telemetry dependent)

## Backend

### New: `prompt-diff.js` utility

- `diffPrompts(oldPrompt, newPrompt)` — phrase-level diff
- `computeFieldDeltas(parentEval, childEval)` — per-field score change
- `aggregatePhraseEffectiveness(chain)` — roll up phrase stats across a branch

### New endpoint: `GET /api/analytics/branch/:branchId/prompt-intelligence`

Returns the full prompt evolution for a branch:
- Per-iteration diffs + score deltas
- Phrase effectiveness aggregation
- Confidence flags

Cached with 60s staleTime (matches existing analytics pattern).

### No schema changes

All data already exists in iterations + evaluations. This is pure read-side analytics.

## Frontend

### New: `usePromptIntelligence(branchId)` hook

TanStack Query hook wrapping the new endpoint. staleTime: 60000.

### New: `PromptDiffInline.jsx` component

Compact inline diff display. Receives two prompt strings, renders green/red phrase tags.

### Modified: `IterationLineage.jsx` / `IterationTable.jsx`

Add prompt delta tag below iteration nodes. Conditional — only renders when prompt changed.

### Modified: `EvaluationPanel.jsx`

Add collapsible "Prompt Delta" row. Uses PromptDiffInline + field delta badges.

## Testing

- Unit tests for `diffPrompts()` — empty prompts, identical prompts, additions only, removals only, mixed
- Unit tests for `computeFieldDeltas()` — missing evaluations, partial scores
- Unit tests for phrase aggregation — single iteration, full chain
- Integration test: endpoint returns correct structure for a branch with 5+ iterations

## Open Questions

None — design is scoped and self-contained.
