# Branch Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Iteratarr from a single linear iteration chain per clip to a branch-per-seed architecture where each seed gets its own independent iteration chain with cross-branch analytics.

**Architecture:** Add a `branches` collection between clips and iterations. Every iteration belongs to a branch. Every branch belongs to a clip and is identified by its seed. Seed screening creates potential branches; "Select" activates them. Multiple branches can be active simultaneously. The clip locks when any branch hits the lock threshold.

**Tech Stack:** SQLite (better-sqlite3), React 18, Express, existing Iteratarr codebase.

---

## Scope: Three Plans

This is split into three independent, sequentially-dependent plans:

- **Plan A (this document): Data Model + API + Migration** — backend only, fully testable
- **Plan B: Branch UI + Navigation** — frontend, depends on Plan A
- **Plan C: Cross-Branch Features** — comparison, charts, carry-forward, depends on A+B

---

## Plan A: Data Model + API + Migration

### Data Model

**New collection: `branches`**

```json
{
  "id": "uuid",
  "clip_id": "uuid",
  "seed": 544083690,
  "name": "seed-544083690",
  "status": "screening | active | stalled | locked | abandoned | superseded",
  "created_from": "screening | manual | fork",
  "source_branch_id": null,
  "source_iteration_id": null,
  "base_settings": { },
  "best_score": null,
  "best_iteration_id": null,
  "iteration_count": 0,
  "created_at": "ISO",
  "updated_at": "ISO",
  "locked_at": null
}
```

**Modified: iterations** — Add `branch_id` field. `parent_iteration_id` still works within a branch but never crosses branches.

**Modified: seed_screens** — Add `branch_id` field (null until branch is created from this screen).

**Branch statuses:**
- `screening` — seed screened but not selected for iteration
- `active` — iteration loop in progress
- `stalled` — user manually marks when progress plateaus
- `locked` — hit 65/75, production-ready
- `abandoned` — user gave up on this seed
- `superseded` — another branch locked first, this one is historical

### File Structure

```
backend/
  routes/
    branches.js           — NEW: CRUD + status management for branches
  store/
    validators.js         — MODIFY: add BRANCH_STATUSES, validateBranch
  routes/
    iterations.js         — MODIFY: require branch_id on create, filter by branch
    seedscreen.js         — MODIFY: select-seed creates branch, not just iter_01
  migrations/
    001-add-branches.js   — NEW: migration script for existing data
```

### API Endpoints

```
GET    /api/clips/:clipId/branches          — list all branches for a clip
POST   /api/clips/:clipId/branches          — create branch (manual or from screening)
GET    /api/clips/:clipId/branches/:id      — get branch with iteration summary
PATCH  /api/clips/:clipId/branches/:id      — update status, name
DELETE /api/clips/:clipId/branches/:id       — delete branch (only if no iterations)

GET    /api/branches/:id/iterations          — list iterations for a branch
```

**Modified endpoints:**
- `POST /api/iterations` — now requires `branch_id` (not just `clip_id`)
- `POST /api/iterations/:id/next` — new iteration inherits parent's `branch_id`
- `POST /api/iterations/:id/lock` — marks branch as locked, other branches as superseded
- `POST /api/clips/:clipId/select-seed` — creates branch + iter_01
- `GET /api/clips/:clipId/iterations` — accepts optional `?branch_id=` filter

### Migration (Task 1)

For existing data (the Mick Balcony clip with 20+ iterations):
1. Create a default branch `seed-767053159` for the clip
2. Assign all existing iterations to this branch
3. If iterations with different seeds exist, create separate branches and reassign

### Tasks

---

### Task 1: Branch validators and data model

**Files:**
- Modify: `backend/store/validators.js`
- Test: `backend/tests/validators.test.js`

- [ ] **Step 1: Add BRANCH_STATUSES and validateBranch to validators**

```js
export const BRANCH_STATUSES = ['screening', 'active', 'stalled', 'locked', 'abandoned', 'superseded'];

export function validateBranch(data) {
  require(data, 'clip_id', 'clip_id');
  require(data, 'seed', 'seed');
  if (data.status && !BRANCH_STATUSES.includes(data.status)) {
    throw new Error(`Invalid branch status: ${data.status}`);
  }
}
```

- [ ] **Step 2: Write tests for validateBranch**

```js
it('validates a branch', () => {
  expect(() => validateBranch({ clip_id: 'c1', seed: 123 })).not.toThrow();
  expect(() => validateBranch({ clip_id: 'c1' })).toThrow('seed is required');
  expect(() => validateBranch({ clip_id: 'c1', seed: 123, status: 'invalid' })).toThrow();
});
```

- [ ] **Step 3: Run tests**

Run: `cd /c/Projects/iteratarr/backend && npm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: branch validators and status definitions"
```

---

### Task 2: Branch CRUD routes

**Files:**
- Create: `backend/routes/branches.js`
- Modify: `backend/server.js` (mount routes)
- Modify: `backend/tests/helpers.js` (add branch routes to test app)
- Create: `backend/tests/routes/branches.test.js`

- [ ] **Step 1: Write branch route tests**

```js
describe('Branches API', () => {
  it('POST creates a branch', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'active' });
    const res = await request.post(`/api/clips/${clip.id}/branches`).send({
      seed: 544083690, name: 'seed-544'
    });
    expect(res.status).toBe(201);
    expect(res.body.seed).toBe(544083690);
    expect(res.body.status).toBe('active');
    expect(res.body.clip_id).toBe(clip.id);
  });

  it('GET lists branches for a clip', async () => { ... });
  it('PATCH updates branch status', async () => { ... });
  it('DELETE removes empty branch', async () => { ... });
  it('DELETE rejects branch with iterations', async () => { ... });
  it('GET /branches/:id includes iteration summary', async () => { ... });
});
```

- [ ] **Step 2: Implement branch routes**

Standard CRUD following existing route patterns (projects.js, clips.js).
`DELETE` checks for existing iterations and rejects if any exist.
`GET /:id` enriches with iteration count and best score.

- [ ] **Step 3: Mount in server.js and test helper**

- [ ] **Step 4: Run tests — ALL PASS**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: branch CRUD API routes"
```

---

### Task 3: Wire iterations to branches

**Files:**
- Modify: `backend/routes/iterations.js`
- Modify: `backend/tests/routes/iterations.test.js`

- [ ] **Step 1: Add branch_id to iteration creation**

In `POST /api/iterations`, accept `branch_id`. If provided, validate the branch exists and belongs to the clip. Store on the iteration record.

- [ ] **Step 2: Propagate branch_id in /next**

In `POST /api/iterations/:id/next`, inherit `branch_id` from the parent iteration.

- [ ] **Step 3: Filter iterations by branch**

In `GET /api/clips/:clipId/iterations`, accept optional `?branch_id=` query param. If present, filter iterations to only that branch.

- [ ] **Step 4: Update lock to set branch status**

In `POST /api/iterations/:id/lock`:
- Set the iteration's branch status to `locked`
- Set all other branches for the same clip to `superseded`
- Existing clip status update remains

- [ ] **Step 5: Update tests — test branch filtering and lock cascade**

- [ ] **Step 6: Run tests — ALL PASS**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: wire iterations to branches — create, propagate, filter, lock cascade"
```

---

### Task 4: Update seed screening to create branches

**Files:**
- Modify: `backend/routes/seedscreen.js`
- Modify: `backend/tests/routes/seedscreen.test.js`

- [ ] **Step 1: Update select-seed to create a branch**

In `POST /api/clips/:clipId/select-seed`:
- Create a branch record with the selected seed
- Create iter_01 with the branch_id
- Mark the seed_screen record with the branch_id
- Set clip status to "in_progress"

- [ ] **Step 2: Allow seed_screen records to link to branches**

Add `branch_id` to seed_screen records when a branch is created from them.

- [ ] **Step 3: Support multiple seed selections**

Currently `select-seed` transitions the clip to in_progress. With branches, selecting additional seeds should create new branches without changing clip status (it's already in_progress after the first selection).

- [ ] **Step 4: Update tests**

- [ ] **Step 5: Run tests — ALL PASS**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: seed screening creates branches on seed selection"
```

---

### Task 5: Migration for existing data

**Files:**
- Create: `backend/migrations/001-add-branches.js`

- [ ] **Step 1: Write migration script**

```js
// Run: node migrations/001-add-branches.js
// 1. List all clips
// 2. For each clip, list iterations
// 3. Group iterations by seed_used
// 4. Create a branch for each unique seed
// 5. Assign branch_id to each iteration
// 6. If clip has evaluated iterations, set best branch to 'active'
```

- [ ] **Step 2: Run migration against live data**

- [ ] **Step 3: Verify: all iterations have branch_id, branches exist for each seed**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: migration — create branches for existing iteration data"
```

---

## Plan B: Branch UI + Navigation (separate document)

### Key Components

- Branch selector pill bar in clip detail
- Filter iterations by selected branch
- Branch status badges (active, stalled, locked, abandoned)
- Branch management (rename, mark stalled/abandoned)
- Seed screening → "Start Branch" instead of "Select"
- Multiple branch selection for comparison

### Navigation Update

```
Clip Detail tabs:
  [SEED SCREENING]  [BRANCHES]

Branches tab:
  Branch pill bar: [seed-767 (61/75) ▼] [seed-544 (58/75)] [+]
  Below: Lineage/Table toggle + evaluation panel (filtered to selected branch)
```

---

## Plan C: Cross-Branch Features (separate document)

### Features

1. **Cross-branch comparison** — compare iterations from different branches
2. **Multi-branch score trends** — overlay lines per branch, different colours
3. **Cross-branch rope effectiveness** — aggregate or per-branch
4. **Settings carry-forward** — inherit from any branch's iteration when creating new branch
5. **Branch-level analytics** — "which seed produced the best results fastest"
6. **Lock cascade** — lock one branch, supersede others

---

## GPU Status Panel (Independent — can ship alongside any plan)

Not part of branch architecture but requested:

```
WAN2GP ━━━━━━━━━━━━━━━
● Connected
━━━━━━━━━━━━━━━━━━━━━
CURRENT: seed-screen_283941567
Progress: ████████░░ 78%
Step 23/30 · 5.2 s/step
ETA: ~36s
━━━━━━━━━━━━━━━━━━━━━
QUEUE: 4 remaining
Next: seed-screen_451839716
━━━━━━━━━━━━━━━━━━━━━
COMPLETED: 2 · Avg: 847s
```

Requires:
- Parse Wan2GP stdout in real-time (bridge already captures stdout)
- WebSocket or SSE from backend to frontend for live progress
- nvidia-smi polling for GPU temp/utilization/VRAM
- Dedicated sidebar panel component
