# Cross-Clip Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen cross-clip analytics view with Overview, Characters, Ropes, and Stalls tabs — accessible from the nav bar and from Seed HQ.

**Architecture:** New `GET /api/analytics/overview` endpoint aggregates all clips/branches/iterations/evaluations into a single payload. Frontend renders it in `CrossClipDashboard.jsx` with four tab components, each consuming the single TanStack Query result (staleTime: 60s). Full-screen takeover pattern matching EpisodeTracker.

**Tech Stack:** Express (backend), React 18 + TanStack Query v5 + Recharts 3, Vitest + Supertest (backend tests), Tailwind CSS (existing theme tokens).

---

## File Map

**Create:**
- `backend/tests/routes/analytics.test.js` — overview endpoint tests
- `frontend/src/components/analytics/CrossClipDashboard.jsx` — full-screen container, tab state
- `frontend/src/components/analytics/OverviewTab.jsx` — summary pills + clips table + histogram
- `frontend/src/components/analytics/CharactersTab.jsx` — per-character performance table
- `frontend/src/components/analytics/RopesTab.jsx` — rope effectiveness horizontal bars
- `frontend/src/components/analytics/StallsTab.jsx` — stall cards + locked + healthy sections

**Modify:**
- `backend/routes/analytics.js` — add `GET /overview` route
- `backend/tests/helpers.js` — register analytics routes in test app
- `frontend/src/api.js` — add `getOverviewAnalytics()`
- `frontend/src/hooks/useQueries.js` — add `useOverviewAnalytics()`
- `frontend/src/App.jsx` — add `analytics` view to VIEWS + render CrossClipDashboard
- `frontend/src/components/clips/SeedHQ.jsx` — add Analytics shortcut button in header

---

## Task 1: Backend — failing tests for overview endpoint

**Files:**
- Create: `backend/tests/routes/analytics.test.js`
- Modify: `backend/tests/helpers.js`

- [ ] **Step 1: Register analytics routes in test helper**

Open `backend/tests/helpers.js` and add these two lines:

```js
// At the top with other imports:
import { createAnalyticsRoutes } from '../routes/analytics.js';

// In createTestApp(), after the existing app.use lines:
app.use('/api/analytics', createAnalyticsRoutes(store));
```

- [ ] **Step 2: Write the failing test file**

Create `backend/tests/routes/analytics.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Analytics API — /api/analytics/overview', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty state when no data exists', async () => {
    const res = await request.get('/api/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.summary.clip_count).toBe(0);
    expect(res.body.summary.iteration_count).toBe(0);
    expect(res.body.summary.evaluated_count).toBe(0);
    expect(res.body.summary.locked_count).toBe(0);
    expect(res.body.summary.stalling_count).toBe(0);
    expect(res.body.clips).toEqual([]);
    expect(res.body.characters).toEqual([]);
    expect(res.body.ropes).toEqual([]);
    expect(res.body.score_distribution.buckets).toHaveLength(5);
    expect(res.body.score_distribution.median).toBeNull();
  });

  it('counts clips, iterations, and evaluations correctly', async () => {
    const clip1 = await store.create('clips', { scene_id: 's1', name: 'Clip A', characters: ['mckdhn'], status: 'in_progress' });
    const clip2 = await store.create('clips', { scene_id: 's1', name: 'Clip B', characters: ['mckdhn'], status: 'in_progress' });
    const branch1 = await store.create('branches', { clip_id: clip1.id, name: 'Branch 1', seed: 12345, status: 'active' });
    const eval1 = await store.create('evaluations', { scores: { grand_total: 55, identity: { total: 30 }, location: { total: 15 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 1, evaluation_id: eval1.id });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 2 });
    await store.create('iterations', { clip_id: clip2.id, branch_id: null, iteration_number: 1 });

    const res = await request.get('/api/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.summary.clip_count).toBe(2);
    expect(res.body.summary.iteration_count).toBe(3);
    expect(res.body.summary.evaluated_count).toBe(1);
    expect(res.body.summary.locked_count).toBe(0);
  });

  it('counts locked clips correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Locked Clip', characters: [], status: 'locked', locked_iteration_id: 'iter-123' });

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.locked_count).toBe(1);
    expect(res.body.clips[0].locked_iteration_id).toBe('iter-123');
    // Locked clips are never stalling
    expect(res.body.clips[0].stall).toBeNull();
  });

  it('detects plateau stall — best score unchanged in last 4 scored iters', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Plateau Clip', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B1', seed: 111, status: 'active' });

    // 5 scored iterations: best was set at iter 1 (score 60), iters 2–5 all score ≤ 60
    const scores = [60, 58, 57, 59, 57];
    for (let i = 0; i < scores.length; i++) {
      const ev = await store.create('evaluations', {
        scores: { grand_total: scores[i], identity: { total: 30 }, location: { total: 20 }, motion: { total: scores[i] - 50 } },
        attribution: { rope: 'rope_1_prompt_position' }
      });
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i + 1, evaluation_id: ev.id });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(1);
    expect(res.body.clips[0].stall).not.toBeNull();
    expect(res.body.clips[0].stall.type).toBe('plateau');
  });

  it('detects no-evals stall — 3+ active iters with zero evaluations', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'No Evals Clip', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B1', seed: 222, status: 'active' });
    for (let i = 1; i <= 4; i++) {
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(1);
    expect(res.body.clips[0].stall.type).toBe('no_evals');
  });

  it('excludes abandoned branches from stall detection', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Clip', characters: [], status: 'in_progress' });
    // Active branch: only 2 iters (not enough for stall)
    const activeBranch = await store.create('branches', { clip_id: clip.id, name: 'Active', seed: 333, status: 'active' });
    await store.create('iterations', { clip_id: clip.id, branch_id: activeBranch.id, iteration_number: 1 });
    await store.create('iterations', { clip_id: clip.id, branch_id: activeBranch.id, iteration_number: 2 });
    // Abandoned branch: 5 iters with no evals — should NOT trigger no-evals stall
    const deadBranch = await store.create('branches', { clip_id: clip.id, name: 'Dead', seed: 444, status: 'abandoned' });
    for (let i = 1; i <= 5; i++) {
      await store.create('iterations', { clip_id: clip.id, branch_id: deadBranch.id, iteration_number: i });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(0);
    expect(res.body.clips[0].stall).toBeNull();
  });

  it('aggregates per-character data correctly', async () => {
    const clip1 = await store.create('clips', { scene_id: 's1', name: 'C1', characters: ['mckdhn'], status: 'in_progress' });
    const clip2 = await store.create('clips', { scene_id: 's1', name: 'C2', characters: ['mckdhn'], status: 'in_progress' });
    const branch1 = await store.create('branches', { clip_id: clip1.id, name: 'B1', seed: 1, status: 'active' });
    const branch2 = await store.create('branches', { clip_id: clip2.id, name: 'B2', seed: 2, status: 'active' });
    const ev1 = await store.create('evaluations', { scores: { grand_total: 50, identity: { total: 25 }, location: { total: 15 }, motion: { total: 10 } }, attribution: {} });
    const ev2 = await store.create('evaluations', { scores: { grand_total: 60, identity: { total: 30 }, location: { total: 20 }, motion: { total: 10 } }, attribution: {} });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 1, evaluation_id: ev1.id });
    await store.create('iterations', { clip_id: clip2.id, branch_id: branch2.id, iteration_number: 1, evaluation_id: ev2.id });

    const res = await request.get('/api/analytics/overview');
    const char = res.body.characters.find(c => c.name === 'mckdhn');
    expect(char).toBeDefined();
    expect(char.clip_count).toBe(2);
    expect(char.best_score).toBe(60);
    expect(char.avg_score).toBe(55);
  });

  it('aggregates rope effectiveness correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B', seed: 1, status: 'active' });
    const ev1 = await store.create('evaluations', { scores: { grand_total: 50, identity: { total: 25 }, location: { total: 15 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    const ev2 = await store.create('evaluations', { scores: { grand_total: 58, identity: { total: 30 }, location: { total: 18 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 1, evaluation_id: ev1.id });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 2, evaluation_id: ev2.id });

    const res = await request.get('/api/analytics/overview');
    const rope = res.body.ropes.find(r => r.rope === 'rope_1_prompt_position');
    expect(rope).toBeDefined();
    expect(rope.count).toBe(1); // Only 1 consecutive pair
    expect(rope.avg_delta).toBe(8); // 58 - 50 = +8
    expect(rope.success_rate).toBe(100);
  });

  it('builds score distribution buckets correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B', seed: 1, status: 'active' });
    // One score in each bucket: 10 (0-15), 20 (15-30), 40 (30-45), 50 (45-60), 70 (60-75)
    const scores = [10, 20, 40, 50, 70];
    for (let i = 0; i < scores.length; i++) {
      const ev = await store.create('evaluations', { scores: { grand_total: scores[i], identity: { total: 10 }, location: { total: 10 }, motion: { total: scores[i] - 20 } }, attribution: {} });
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i + 1, evaluation_id: ev.id });
    }

    const res = await request.get('/api/analytics/overview');
    const dist = res.body.score_distribution;
    expect(dist.buckets[0].count).toBe(1); // 0–15: score 10
    expect(dist.buckets[1].count).toBe(1); // 15–30: score 20
    expect(dist.buckets[2].count).toBe(1); // 30–45: score 40
    expect(dist.buckets[3].count).toBe(1); // 45–60: score 50
    expect(dist.buckets[4].count).toBe(1); // 60–75: score 70
    expect(dist.median).toBe(40);
    expect(dist.high).toBe(70);
  });
});
```

- [ ] **Step 3: Run tests — verify they all fail with 404**

```bash
cd C:/Projects/iteratarr/backend && npx vitest run tests/routes/analytics.test.js
```

Expected: all tests FAIL — `/api/analytics/overview` returns 404 (route not implemented yet).

- [ ] **Step 4: Commit failing tests**

```bash
cd C:/Projects/iteratarr && git add backend/tests/routes/analytics.test.js backend/tests/helpers.js && git commit -m "test: add failing tests for analytics overview endpoint"
```

---

## Task 2: Backend — implement the overview endpoint

**Files:**
- Modify: `backend/routes/analytics.js`

- [ ] **Step 1: Add the overview route to analytics.js**

Open `backend/routes/analytics.js` and add the following route BEFORE the `return router;` line at the end of `createAnalyticsRoutes`:

```js
/**
 * GET /api/analytics/overview
 *
 * Aggregates cross-clip analytics: summary counts, per-clip data with stall detection,
 * per-character performance, rope effectiveness, and score distribution histogram.
 *
 * Stall detection rules:
 * - PLATEAU: best score on active branches unchanged for last 4+ scored iterations
 * - NO_EVALS: active branches have 3+ iterations with zero evaluations
 * - Locked clips (locked_iteration_id set) are excluded from stall detection
 * - Abandoned/archived branches are excluded from stall detection
 */
router.get('/overview', async (req, res) => {
  try {
    const clips = await store.list('clips');
    const allBranches = await store.list('branches');
    const allIterations = await store.list('iterations');
    const allEvaluations = await store.list('evaluations');

    // Build lookup maps for O(1) access
    const evalById = Object.fromEntries(allEvaluations.map(e => [e.id, e]));

    // Group iterations and branches by clip_id
    const itersByClip = {};
    for (const iter of allIterations) {
      if (!itersByClip[iter.clip_id]) itersByClip[iter.clip_id] = [];
      itersByClip[iter.clip_id].push(iter);
    }
    const branchesByClip = {};
    for (const branch of allBranches) {
      if (!branchesByClip[branch.clip_id]) branchesByClip[branch.clip_id] = [];
      branchesByClip[branch.clip_id].push(branch);
    }

    // Score distribution buckets: [0-15, 15-30, 30-45, 45-60, 60-75]
    const buckets = [0, 0, 0, 0, 0];
    const allScores = [];
    let evaluatedCount = 0;
    let lockedCount = 0;
    let stallingCount = 0;

    const clipData = clips.map(clip => {
      const clipIters = itersByClip[clip.id] || [];
      const clipBranches = branchesByClip[clip.id] || [];

      // Evaluated iterations
      const evaluatedIters = clipIters.filter(i => i.evaluation_id && evalById[i.evaluation_id]);
      evaluatedCount += evaluatedIters.length;

      // Best score + histogram population
      let bestScore = null;
      for (const iter of evaluatedIters) {
        const score = evalById[iter.evaluation_id]?.scores?.grand_total;
        if (score != null) {
          allScores.push(score);
          buckets[Math.min(Math.floor(score / 15), 4)]++;
          if (bestScore === null || score > bestScore) bestScore = score;
        }
      }

      if (clip.locked_iteration_id) lockedCount++;

      // Stall detection — skip locked clips
      let stall = null;
      if (!clip.locked_iteration_id) {
        const INACTIVE = new Set(['abandoned', 'archived']);
        const activeBranches = clipBranches.filter(b => !INACTIVE.has(b.status));
        const activeBranchIds = new Set(activeBranches.map(b => b.id));
        const excludedBranchCount = clipBranches.length - activeBranches.length;

        const activeIters = clipIters.filter(i => activeBranchIds.has(i.branch_id));

        // PLATEAU: last 4 scored iters on active branches haven't improved on the prior best
        const scoredActiveIters = activeIters
          .filter(i => i.evaluation_id && evalById[i.evaluation_id]?.scores?.grand_total != null)
          .sort((a, b) => a.iteration_number - b.iteration_number);

        if (scoredActiveIters.length >= 5) {
          const last4 = scoredActiveIters.slice(-4);
          const earlier = scoredActiveIters.slice(0, -4);
          const overallBest = Math.max(...scoredActiveIters.map(i => evalById[i.evaluation_id].scores.grand_total));
          const preBest = Math.max(...earlier.map(i => evalById[i.evaluation_id].scores.grand_total));
          const last4Max = Math.max(...last4.map(i => evalById[i.evaluation_id].scores.grand_total));
          if (preBest >= last4Max) {
            stall = {
              type: 'plateau',
              detail: `best score ${overallBest} unchanged for 4+ iters`,
              excluded_branch_count: excludedBranchCount
            };
          }
        }

        // NO_EVALS: active branches have 3+ iters and zero evaluations
        if (!stall && activeIters.length >= 3) {
          const evaledCount = activeIters.filter(i => i.evaluation_id && evalById[i.evaluation_id]).length;
          if (evaledCount === 0) {
            stall = {
              type: 'no_evals',
              detail: `${activeIters.length} iterations with no evaluations`,
              excluded_branch_count: excludedBranchCount
            };
          }
        }

        if (stall) stallingCount++;
      }

      return {
        id: clip.id,
        name: clip.name,
        characters: clip.characters || [],
        status: clip.status,
        locked_iteration_id: clip.locked_iteration_id || null,
        best_score: bestScore,
        iteration_count: clipIters.length,
        evaluated_count: evaluatedIters.length,
        stall
      };
    });

    // Sort: stalling first → by best score desc → zero-iter clips last
    clipData.sort((a, b) => {
      if (a.stall && !b.stall) return -1;
      if (!a.stall && b.stall) return 1;
      if (a.best_score === null && b.best_score === null) return 0;
      if (a.best_score === null) return 1;
      if (b.best_score === null) return -1;
      return b.best_score - a.best_score;
    });

    // Per-character aggregation
    const charMap = new Map();
    for (const clip of clips) {
      for (const char of (clip.characters || [])) {
        if (!charMap.has(char)) charMap.set(char, { name: char, clip_count: 0, total_iterations: 0, best_score: null, _scores: [] });
        const entry = charMap.get(char);
        entry.clip_count++;
        const clipIters = itersByClip[clip.id] || [];
        entry.total_iterations += clipIters.length;
        for (const iter of clipIters) {
          const score = iter.evaluation_id ? evalById[iter.evaluation_id]?.scores?.grand_total : null;
          if (score != null) {
            entry._scores.push(score);
            if (entry.best_score === null || score > entry.best_score) entry.best_score = score;
          }
        }
      }
    }
    const characters = [...charMap.values()]
      .map(({ _scores, ...c }) => ({
        ...c,
        avg_score: _scores.length > 0 ? +(_scores.reduce((s, v) => s + v, 0) / _scores.length).toFixed(1) : null
      }))
      .sort((a, b) => {
        if (a.best_score === null && b.best_score === null) return 0;
        if (a.best_score === null) return 1;
        if (b.best_score === null) return -1;
        return b.best_score - a.best_score;
      });

    // Rope effectiveness — consecutive pairs within each active branch
    const ropeImpacts = {};
    for (const branch of allBranches) {
      if (['abandoned', 'archived'].includes(branch.status)) continue;
      const branchIters = (itersByClip[branch.clip_id] || [])
        .filter(i => i.branch_id === branch.id)
        .sort((a, b) => a.iteration_number - b.iteration_number);

      for (let idx = 1; idx < branchIters.length; idx++) {
        const prev = branchIters[idx - 1];
        const curr = branchIters[idx];
        const prevScore = prev.evaluation_id ? evalById[prev.evaluation_id]?.scores?.grand_total : null;
        const currScore = curr.evaluation_id ? evalById[curr.evaluation_id]?.scores?.grand_total : null;
        if (prevScore == null || currScore == null) continue;

        const rope = (curr.evaluation_id ? evalById[curr.evaluation_id]?.attribution?.rope : null) || 'unknown';
        const delta = currScore - prevScore;

        if (!ropeImpacts[rope]) ropeImpacts[rope] = { rope, count: 0, total_delta: 0, positive_count: 0 };
        ropeImpacts[rope].count++;
        ropeImpacts[rope].total_delta += delta;
        if (delta > 0) ropeImpacts[rope].positive_count++;
      }
    }

    const ROPE_LABELS = {
      rope_1_prompt_position: 'Rope 1 — Prompt Position',
      rope_2_attention_weighting: 'Rope 2 — Attention Weighting',
      rope_3_lora_multipliers: 'Rope 3 — LoRA Multipliers',
      rope_4a_cfg_high: 'Rope 4a — CFG High Noise',
      rope_4b_cfg_low: 'Rope 4b — CFG Low Noise',
      rope_5_steps_skipping: 'Rope 5 — Steps Skipping',
      rope_6_alt_prompt: 'Rope 6 — Alt Prompt',
      bonus_flow_shift: 'Bonus — flow_shift',
      bonus_nag_scale: 'Bonus — NAG_scale',
      bonus_sample_solver: 'Bonus — sample_solver',
      multiple: 'Multiple ropes',
    };

    const ropes = Object.values(ropeImpacts)
      .map(r => ({
        rope: r.rope,
        label: ROPE_LABELS[r.rope] || r.rope,
        count: r.count,
        avg_delta: r.count > 0 ? +(r.total_delta / r.count).toFixed(2) : 0,
        success_rate: r.count > 0 ? +(r.positive_count / r.count * 100).toFixed(0) : 0
      }))
      .sort((a, b) => b.avg_delta - a.avg_delta);

    // Score distribution stats
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const median = sortedScores.length > 0 ? sortedScores[Math.floor(sortedScores.length / 2)] : null;
    const mean = sortedScores.length > 0 ? +(sortedScores.reduce((s, v) => s + v, 0) / sortedScores.length).toFixed(1) : null;
    const high = sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : null;

    res.json({
      summary: {
        clip_count: clips.length,
        iteration_count: allIterations.length,
        evaluated_count: evaluatedCount,
        locked_count: lockedCount,
        stalling_count: stallingCount
      },
      clips: clipData,
      characters,
      ropes,
      score_distribution: {
        buckets: [
          { range: '0–15', count: buckets[0] },
          { range: '15–30', count: buckets[1] },
          { range: '30–45', count: buckets[2] },
          { range: '45–60', count: buckets[3] },
          { range: '60–75', count: buckets[4] }
        ],
        median,
        mean,
        high
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Run tests — verify they all pass**

```bash
cd C:/Projects/iteratarr/backend && npx vitest run tests/routes/analytics.test.js
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Run full backend suite to check for regressions**

```bash
cd C:/Projects/iteratarr/backend && npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/iteratarr && git add backend/routes/analytics.js && git commit -m "feat: add GET /api/analytics/overview endpoint with stall detection"
```

---

## Task 3: Frontend — API client + TanStack hook

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/hooks/useQueries.js`

- [ ] **Step 1: Add getOverviewAnalytics to api.js**

In `frontend/src/api.js`, find the existing analytics lines:

```js
  getBranchAnalytics: (clipId) => request(`/analytics/branches/${clipId}`),
  compareBranches: (clipId, branchId1, branchId2) =>
    request(`/analytics/branches/${clipId}/compare?branches=${branchId1},${branchId2}`),
```

Add `getOverviewAnalytics` immediately after:

```js
  getOverviewAnalytics: () => request('/analytics/overview'),
```

- [ ] **Step 2: Add useOverviewAnalytics hook to useQueries.js**

In `frontend/src/hooks/useQueries.js`, find the existing `/** Branch analytics */` section and add the new hook below `useBranchComparison`:

```js
/** Cross-clip overview analytics — used by CrossClipDashboard */
export function useOverviewAnalytics(options = {}) {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.getOverviewAnalytics(),
    staleTime: 60_000,   // 1 min — not real-time data
    gcTime: 5 * 60_000,
    ...options
  });
}
```

- [ ] **Step 3: Smoke-test the frontend dev server still starts**

```bash
cd C:/Projects/iteratarr/frontend && npx vite --port 5173
```

Expected: Vite starts with no errors. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/api.js frontend/src/hooks/useQueries.js && git commit -m "feat: add getOverviewAnalytics API client and useOverviewAnalytics hook"
```

---

## Task 4: Frontend — CrossClipDashboard container + nav wiring

**Files:**
- Create: `frontend/src/components/analytics/CrossClipDashboard.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create CrossClipDashboard.jsx**

Create `frontend/src/components/analytics/CrossClipDashboard.jsx`:

```jsx
import { useState } from 'react';
import { useOverviewAnalytics } from '../../hooks/useQueries';
import OverviewTab from './OverviewTab';
import CharactersTab from './CharactersTab';
import RopesTab from './RopesTab';
import StallsTab from './StallsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'characters', label: 'Characters' },
  { id: 'ropes', label: 'Ropes' },
  { id: 'stalls', label: 'Stalls' },
];

/**
 * CrossClipDashboard — full-screen analytics view.
 * Fetches the /api/analytics/overview payload once and passes it to tab components.
 *
 * Props:
 *   onBack() — return to previous view
 */
export default function CrossClipDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, isLoading, isError, refetch } = useOverviewAnalytics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 font-mono text-sm">Loading analytics...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm mb-2">Failed to load analytics</p>
          <button onClick={() => refetch()} className="px-3 py-1 text-xs font-mono bg-surface-overlay text-gray-400 rounded hover:text-gray-200">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stallingCount = data.summary?.stalling_count ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← back
          </button>
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Analytics</h2>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-700 mb-4 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-mono transition-colors relative ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.id === 'stalls' && stallingCount > 0 && (
              <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">
                {stallingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && <OverviewTab data={data} onSwitchToStalls={() => setActiveTab('stalls')} />}
        {activeTab === 'characters' && <CharactersTab characters={data.characters} />}
        {activeTab === 'ropes' && <RopesTab ropes={data.ropes} />}
        {activeTab === 'stalls' && <StallsTab clips={data.clips} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add analytics to VIEWS and render in App.jsx**

In `frontend/src/App.jsx`, find the VIEWS object:

```js
const VIEWS = {
  episodes: 'Episode Tracker',
  queue: 'Queue Manager',
  characters: 'Character Registry',
  templates: 'Templates',
  trends: 'Score Trends'
};
```

Replace with:

```js
const VIEWS = {
  episodes: 'Episode Tracker',
  analytics: 'Analytics',
  queue: 'Queue Manager',
  characters: 'Character Registry',
  templates: 'Templates',
  trends: 'Score Trends'
};
```

- [ ] **Step 3: Add CrossClipDashboard import and render in App.jsx**

Add the import at the top of App.jsx with the other component imports:

```js
import CrossClipDashboard from './components/analytics/CrossClipDashboard';
```

In the `AppContent` function, find the main content section and add the analytics view. Find this block:

```jsx
          {view === 'queue' && <QueueManager />}
```

Add the analytics view immediately before it:

```jsx
          {view === 'analytics' && (
            <CrossClipDashboard onBack={() => guardedNavigate(() => setView('episodes'))} />
          )}
```

- [ ] **Step 4: Verify the nav shows "Analytics" and clicking it renders the loading/dashboard state**

Start the backend and frontend dev servers, open the app. Verify "Analytics" appears in the left nav and clicking it shows either the dashboard or the loading state.

```bash
# Terminal 1
cd C:/Projects/iteratarr/backend && node server.js

# Terminal 2
cd C:/Projects/iteratarr/frontend && npx vite
```

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/analytics/CrossClipDashboard.jsx frontend/src/App.jsx && git commit -m "feat: add CrossClipDashboard container and Analytics nav entry"
```

---

## Task 5: Frontend — OverviewTab

**Files:**
- Create: `frontend/src/components/analytics/OverviewTab.jsx`

- [ ] **Step 1: Create OverviewTab.jsx**

Create `frontend/src/components/analytics/OverviewTab.jsx`:

```jsx
import { memo } from 'react';
import { SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

function progressColor(score) {
  if (score == null) return 'bg-gray-700';
  const pct = score / GRAND_MAX;
  if (pct >= SCORE_LOCK_THRESHOLD / GRAND_MAX) return 'bg-green-500';
  if (pct >= 0.57) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreColor(score) {
  if (score == null) return 'text-gray-600';
  const pct = score / GRAND_MAX;
  if (pct >= SCORE_LOCK_THRESHOLD / GRAND_MAX) return 'text-green-400';
  if (pct >= 0.57) return 'text-amber-400';
  return 'text-red-400';
}

const SummaryPill = memo(function SummaryPill({ label, value, color = 'text-gray-200', borderColor = 'border-gray-700' }) {
  return (
    <div className={`bg-surface-raised border ${borderColor} rounded-lg px-5 py-3 font-mono`}>
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
});

const StallBadge = memo(function StallBadge({ stall, lockedIterationId }) {
  if (lockedIterationId) return <span className="text-xs font-mono font-bold text-green-400">✓ locked</span>;
  if (!stall) return null;
  if (stall.type === 'plateau') return <span className="text-xs font-mono text-red-400">⚠ plateau</span>;
  if (stall.type === 'no_evals') return <span className="text-xs font-mono text-purple-400">⚠ no evals</span>;
  return null;
});

const ScoreHistogram = memo(function ScoreHistogram({ distribution }) {
  if (!distribution) return null;
  const { buckets, median, mean, high } = distribution;
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  const barColor = (range) => {
    const start = parseInt(range);
    if (start >= 60) return 'bg-green-500';
    if (start >= 30) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Score Distribution — all evaluated iterations
      </div>
      <div className="flex items-end gap-2 h-24">
        {buckets.map(bucket => (
          <div key={bucket.range} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-xs font-mono text-gray-400">{bucket.count}</span>
            <div
              className={`w-full rounded-t ${barColor(bucket.range)}`}
              style={{ height: `${Math.max((bucket.count / maxCount) * 80, bucket.count > 0 ? 4 : 0)}px` }}
            />
            <span className="text-xs font-mono text-gray-500">{bucket.range}</span>
          </div>
        ))}
      </div>
      <div className="text-xs font-mono text-gray-500 mt-2 flex gap-3 flex-wrap">
        {median != null && <span>median <span className="text-gray-300">{median}</span></span>}
        {mean != null && <span>mean <span className="text-gray-300">{mean}</span></span>}
        {high != null && <span>high <span className="text-gray-300">{high}</span></span>}
        <span>lock threshold <span className="text-green-400">{SCORE_LOCK_THRESHOLD}</span></span>
      </div>
    </div>
  );
});

/**
 * OverviewTab — summary pills, all-clips table, score distribution histogram.
 *
 * Props:
 *   data — full overview API response
 *   onSwitchToStalls() — called when user clicks the Stalling pill
 */
export default function OverviewTab({ data, onSwitchToStalls }) {
  const { summary, clips, score_distribution } = data;

  return (
    <div className="space-y-6">
      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        <SummaryPill label="Clips" value={summary.clip_count} />
        <SummaryPill label="Iterations" value={summary.iteration_count} />
        <SummaryPill label="Evaluated" value={summary.evaluated_count} />
        <SummaryPill label="Locked" value={summary.locked_count} color="text-green-400" />
        <button onClick={onSwitchToStalls} className="focus:outline-none">
          <SummaryPill
            label="Stalling"
            value={summary.stalling_count}
            color={summary.stalling_count > 0 ? 'text-red-400' : 'text-gray-600'}
            borderColor={summary.stalling_count > 0 ? 'border-red-500/40' : 'border-gray-700'}
          />
        </button>
      </div>

      {/* All clips table */}
      <div>
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">All Clips</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3">Clip</th>
                <th className="text-left py-2 px-3">Character</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-right py-2 px-3">Best</th>
                <th className="text-right py-2 px-3">Iters</th>
                <th className="text-left py-2 px-3 min-w-32">Progress</th>
                <th className="text-left py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {clips.map(clip => (
                <tr
                  key={clip.id}
                  className={`border-b border-gray-800 ${clip.iteration_count === 0 ? 'opacity-40' : ''}`}
                >
                  <td className="py-2.5 px-3 text-gray-200">{clip.name}</td>
                  <td className="py-2.5 px-3">
                    {clip.characters.length > 0
                      ? <span className="text-purple-400">{clip.characters.join(', ')}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={
                      clip.status === 'locked' ? 'text-green-400' :
                      clip.status === 'in_progress' ? 'text-amber-400' :
                      clip.status === 'evaluating' ? 'text-blue-400' :
                      'text-gray-500'
                    }>
                      {clip.status}
                    </span>
                  </td>
                  <td className={`py-2.5 px-3 text-right font-bold ${scoreColor(clip.best_score)}`}>
                    {clip.best_score != null
                      ? <>{clip.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span></>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{clip.iteration_count}</td>
                  <td className="py-2.5 px-3">
                    <div className="bg-gray-800 rounded h-1.5 w-full">
                      <div
                        className={`rounded h-1.5 ${progressColor(clip.best_score)}`}
                        style={{ width: `${Math.min((clip.best_score ?? 0) / SCORE_LOCK_THRESHOLD * 100, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <StallBadge stall={clip.stall} lockedIterationId={clip.locked_iteration_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Score histogram */}
      <ScoreHistogram distribution={score_distribution} />
    </div>
  );
}
```

- [ ] **Step 2: Verify Overview tab renders correctly in browser**

Open the app, click Analytics, confirm Overview tab shows pills, table, and histogram.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/analytics/OverviewTab.jsx && git commit -m "feat: add OverviewTab — summary pills, clips table, score histogram"
```

---

## Task 6: Frontend — CharactersTab

**Files:**
- Create: `frontend/src/components/analytics/CharactersTab.jsx`

- [ ] **Step 1: Create CharactersTab.jsx**

Create `frontend/src/components/analytics/CharactersTab.jsx`:

```jsx
import { memo } from 'react';
import { SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

/**
 * CharactersTab — per-character performance across all clips.
 *
 * Props:
 *   characters — array from overview API response
 */
const CharactersTab = memo(function CharactersTab({ characters }) {
  if (!characters || characters.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-600 font-mono text-sm">No characters found — add character tags to your clips.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Per-character performance across all clips
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left py-2 px-3">Character</th>
              <th className="text-right py-2 px-3">Clips</th>
              <th className="text-right py-2 px-3">Total Iters</th>
              <th className="text-right py-2 px-3">Best Score</th>
              <th className="text-right py-2 px-3">Avg Score</th>
              <th className="text-left py-2 px-3 min-w-40">Best Progress</th>
            </tr>
          </thead>
          <tbody>
            {characters.map(char => {
              const hasData = char.best_score != null;
              const progressPct = hasData ? Math.min((char.best_score / SCORE_LOCK_THRESHOLD) * 100, 100) : 0;
              const barColor = !hasData ? 'bg-gray-700' :
                char.best_score >= SCORE_LOCK_THRESHOLD ? 'bg-green-500' :
                char.best_score >= 43 ? 'bg-amber-500' : 'bg-red-500';

              return (
                <tr
                  key={char.name}
                  className={`border-b border-gray-800 ${!hasData ? 'opacity-40' : ''}`}
                >
                  <td className="py-2.5 px-3 text-purple-400 font-bold text-base">{char.name}</td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{char.clip_count}</td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{char.total_iterations}</td>
                  <td className="py-2.5 px-3 text-right">
                    {hasData
                      ? <span className={char.best_score >= SCORE_LOCK_THRESHOLD ? 'text-green-400 font-bold' : 'text-amber-400 font-bold'}>
                          {char.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span>
                        </span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-400">
                    {char.avg_score != null ? char.avg_score : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="bg-gray-800 rounded h-1.5 w-full">
                      <div className={`rounded h-1.5 ${barColor}`} style={{ width: `${progressPct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default CharactersTab;
```

- [ ] **Step 2: Verify Characters tab renders in browser**

Click the Characters tab, confirm character rows appear with progress bars.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/analytics/CharactersTab.jsx && git commit -m "feat: add CharactersTab — per-character performance table"
```

---

## Task 7: Frontend — RopesTab

**Files:**
- Create: `frontend/src/components/analytics/RopesTab.jsx`

- [ ] **Step 1: Create RopesTab.jsx**

Create `frontend/src/components/analytics/RopesTab.jsx`:

```jsx
import { memo } from 'react';

/**
 * RopesTab — cross-clip rope effectiveness as horizontal bar chart.
 * Each row: rope label · delta bar (green/red) · use count · success rate.
 *
 * Props:
 *   ropes — array from overview API response
 */
const RopesTab = memo(function RopesTab({ ropes }) {
  if (!ropes || ropes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-600 font-mono text-sm">No rope data yet — evaluations need attribution fields.</p>
      </div>
    );
  }

  const maxAbsDelta = Math.max(...ropes.map(r => Math.abs(r.avg_delta)), 1);

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Cross-clip rope effectiveness — avg score delta per use
      </div>
      <div className="space-y-3">
        {ropes.map(rope => {
          const isPositive = rope.avg_delta >= 0;
          const barWidth = `${(Math.abs(rope.avg_delta) / maxAbsDelta) * 100}%`;

          return (
            <div key={rope.rope} className="flex items-center gap-3 font-mono">
              <div className="w-56 shrink-0 text-sm text-gray-200 truncate" title={rope.label}>
                {rope.label}
              </div>
              <div className="flex-1 bg-gray-800 rounded h-6 relative overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded flex items-center px-2 text-xs text-white font-bold ${isPositive ? 'left-0 bg-green-600' : 'right-0 bg-red-600'}`}
                  style={{ width: barWidth, minWidth: rope.avg_delta !== 0 ? '2rem' : '0' }}
                >
                  {rope.avg_delta > 0 ? `+${rope.avg_delta}` : rope.avg_delta}
                </div>
              </div>
              <div className="w-16 text-right text-xs text-gray-500 shrink-0">{rope.count} uses</div>
              <div className={`w-14 text-right text-xs font-bold shrink-0 ${rope.success_rate >= 60 ? 'text-green-400' : rope.success_rate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {rope.success_rate}% ✓
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-xs font-mono text-gray-600">
        avg score delta per use · success rate = % of uses with a positive delta · sorted by avg delta
      </div>
    </div>
  );
});

export default RopesTab;
```

- [ ] **Step 2: Verify Ropes tab renders in browser**

Click the Ropes tab, confirm horizontal bars appear with correct colours.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/analytics/RopesTab.jsx && git commit -m "feat: add RopesTab — cross-clip rope effectiveness bars"
```

---

## Task 8: Frontend — StallsTab

**Files:**
- Create: `frontend/src/components/analytics/StallsTab.jsx`

- [ ] **Step 1: Create StallsTab.jsx**

Create `frontend/src/components/analytics/StallsTab.jsx`:

```jsx
import { memo } from 'react';
import { GRAND_MAX } from '../../constants';

const StallCard = memo(function StallCard({ clip }) {
  const isPlataeu = clip.stall?.type === 'plateau';
  return (
    <div className="border border-red-500/40 bg-surface-raised rounded-lg p-4 font-mono">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-200 text-sm font-bold">{clip.name}</span>
          {isPlataeu
            ? <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold">PLATEAU</span>
            : <span className="bg-purple-700 text-white text-xs px-2 py-0.5 rounded font-bold">NO EVALS</span>
          }
        </div>
        <span className="text-gray-500 text-xs shrink-0 ml-2">
          {clip.characters.length > 0 ? clip.characters.join(', ') : 'no character'}
        </span>
      </div>
      <div className="text-gray-400 text-sm">{clip.stall.detail}</div>
      {clip.stall.excluded_branch_count > 0 && (
        <div className="text-gray-600 text-xs mt-1">
          {clip.stall.excluded_branch_count} abandoned branch{clip.stall.excluded_branch_count !== 1 ? 'es' : ''} excluded from check
        </div>
      )}
    </div>
  );
});

const LockedCard = memo(function LockedCard({ clip }) {
  return (
    <div className="border border-green-500/30 bg-surface-raised rounded-lg px-4 py-3 font-mono flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-gray-200 text-sm">{clip.name}</span>
        <span className="bg-green-600 text-black text-xs px-2 py-0.5 rounded font-bold">LOCKED</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs">{clip.characters.join(', ')}</span>
        <span className="text-green-400 font-bold text-sm">
          {clip.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span>
        </span>
      </div>
    </div>
  );
});

/**
 * StallsTab — three sections: stalling clips, locked clips, healthy clips.
 *
 * Props:
 *   clips — array from overview API response
 */
export default function StallsTab({ clips }) {
  const stalling = clips.filter(c => c.stall && !c.locked_iteration_id);
  const locked = clips.filter(c => c.locked_iteration_id);
  const healthy = clips.filter(c => !c.stall && !c.locked_iteration_id && c.iteration_count > 0);
  const notStarted = clips.filter(c => c.iteration_count === 0);

  return (
    <div className="space-y-6">
      {/* Stalling */}
      {stalling.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Needs Intervention ({stalling.length})
          </div>
          <div className="space-y-3">
            {stalling.map(clip => <StallCard key={clip.id} clip={clip} />)}
          </div>
        </div>
      )}

      {stalling.length === 0 && (
        <div className="border border-gray-700 rounded-lg p-4 font-mono text-gray-500 text-sm text-center">
          ✓ No clips are stalling
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Locked ✓ ({locked.length})
          </div>
          <div className="space-y-2">
            {locked.map(clip => <LockedCard key={clip.id} clip={clip} />)}
          </div>
        </div>
      )}

      {/* Healthy */}
      {healthy.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Progressing Normally ({healthy.length})
          </div>
          <div className="border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-gray-400">
            {healthy.map(c => c.name).join(' · ')}
          </div>
        </div>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Not Started ({notStarted.length})
          </div>
          <div className="border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-gray-600">
            {notStarted.map(c => c.name).join(' · ')}
          </div>
        </div>
      )}

      {/* Logic note */}
      <div className="border border-gray-800 rounded-lg px-4 py-3 font-mono text-xs text-gray-600">
        Plateau = best score unchanged for 4+ scored iters on active branches ·
        No evals = active branches with 3+ iters and zero evaluations ·
        Abandoned branches and locked clips always excluded
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Stalls tab renders in browser**

Click the Stalls tab, confirm all three sections render correctly with the logic note at the bottom.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/analytics/StallsTab.jsx && git commit -m "feat: add StallsTab — stalling, locked, and healthy clip sections"
```

---

## Task 9: Frontend — SeedHQ Analytics shortcut button

**Files:**
- Modify: `frontend/src/components/clips/SeedHQ.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add onNavigateToAnalytics prop to SeedHQ**

In `frontend/src/components/clips/SeedHQ.jsx`, find the function signature (line ~338):

```js
export default function SeedHQ({ clip, branches, seedScreens, onEnterBranch, onGenerateSeeds, onRefresh, onManageBranch, onLaunchBranch }) {
```

Add `onNavigateToAnalytics` to the destructured props:

```js
export default function SeedHQ({ clip, branches, seedScreens, onEnterBranch, onGenerateSeeds, onRefresh, onManageBranch, onLaunchBranch, onNavigateToAnalytics }) {
```

- [ ] **Step 2: Add Analytics button to SeedHQ header**

Find the HQ header block (around line ~391):

```jsx
      {/* HQ header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Seed HQ</h3>
          <span className="text-xs font-mono text-gray-600">
            {totalSeeds} seed{totalSeeds !== 1 ? 's' : ''} &middot; {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} &middot; {activeBranches} active
          </span>
        </div>
        <button
          onClick={onGenerateSeeds}
          className="px-3 py-1.5 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
        >
          + Generate Seeds
        </button>
      </div>
```

Replace with:

```jsx
      {/* HQ header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Seed HQ</h3>
          <span className="text-xs font-mono text-gray-600">
            {totalSeeds} seed{totalSeeds !== 1 ? 's' : ''} &middot; {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} &middot; {activeBranches} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToAnalytics && (
            <button
              onClick={onNavigateToAnalytics}
              className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 rounded transition-colors"
              title="Open cross-clip analytics dashboard"
            >
              Analytics
            </button>
          )}
          <button
            onClick={onGenerateSeeds}
            className="px-3 py-1.5 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
          >
            + Generate Seeds
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Pass onNavigateToAnalytics from ClipDetail through to SeedHQ**

Find where `SeedHQ` is rendered inside `ClipDetail.jsx`. Search for `<SeedHQ` and add the prop:

```bash
grep -n "SeedHQ" C:/Projects/iteratarr/frontend/src/components/clips/ClipDetail.jsx
```

In `ClipDetail.jsx`, `SeedHQ` receives its props from ClipDetail. Find the `<SeedHQ` usage and add:

```jsx
onNavigateToAnalytics={onNavigateToAnalytics}
```

Then find ClipDetail's own props and add `onNavigateToAnalytics` to its destructured props:

```js
export default function ClipDetail({ clip, onBack, onUnsavedScoresChange, onNavigateToAnalytics }) {
```

- [ ] **Step 4: Pass onNavigateToAnalytics from App.jsx to ClipDetail**

In `frontend/src/App.jsx`, find where ClipDetail is rendered:

```jsx
          {view === 'episodes' && selectedClip && (
            <ClipDetail clip={selectedClip} onBack={() => guardedNavigate(() => setSelectedClip(null))} onUnsavedScoresChange={setHasUnsavedScores} />
          )}
```

Replace with:

```jsx
          {view === 'episodes' && selectedClip && (
            <ClipDetail
              clip={selectedClip}
              onBack={() => guardedNavigate(() => setSelectedClip(null))}
              onUnsavedScoresChange={setHasUnsavedScores}
              onNavigateToAnalytics={() => guardedNavigate(() => { setSelectedClip(null); setView('analytics'); })}
            />
          )}
```

- [ ] **Step 5: Verify Analytics button appears in Seed HQ and navigates correctly**

Open the app, select a clip, confirm the "Analytics" button appears next to "+ Generate Seeds" in the Seed HQ header. Click it — should navigate to the Analytics full-screen view.

- [ ] **Step 6: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/clips/SeedHQ.jsx frontend/src/components/clips/ClipDetail.jsx frontend/src/App.jsx && git commit -m "feat: add Analytics shortcut button to Seed HQ header (#16)"
```

---

## Task 10: Final verification + issue close

- [ ] **Step 1: Run full backend test suite**

```bash
cd C:/Projects/iteratarr/backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Smoke-test all four tabs in browser**

With backend + frontend running:
1. Click **Analytics** in the nav → Overview tab loads, shows summary pills, clips table, histogram
2. Click **Characters** tab → character rows with progress bars
3. Click **Ropes** tab → horizontal bars (may be empty if no attribution data in DB)
4. Click **Stalls** tab → stalling/locked/healthy sections visible
5. Open a clip → click **Analytics** button in Seed HQ header → navigates to Analytics view
6. Click "← back" in Analytics → returns to clip

- [ ] **Step 3: Update project board and close issue**

```bash
# Get the item ID for issue #16 on the board
gh project item-list 4 --owner coaxk --format json | python -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    if 'Cross-clip analytics' in item.get('title', ''):
        print(item['id'])
"

# Set to Done (replace ITEM_ID with output above)
gh project item-edit --project-id PVT_kwHOADDHj84BSmwV --id ITEM_ID --field-id PVTSSF_lAHOADDHj84BSmwVzhAFyAw --single-select-option-id c3bb8469

# Close issue
gh issue close 16 --repo coaxk/iteratarr --comment "Implemented: full-screen analytics dashboard with Overview, Characters, Ropes, and Stalls tabs. Accessible from nav bar and Seed HQ header."
```
