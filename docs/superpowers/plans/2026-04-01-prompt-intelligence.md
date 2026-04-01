# Prompt Intelligence v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface which prompt phrase changes correlated with which field score changes, inline in the iteration workflow.

**Architecture:** Backend utility (`prompt-diff.js`) does phrase-level diffing and score delta computation. New analytics endpoint aggregates per-branch. Frontend components render inline diffs in IterationLineage, IterationTable, and EvaluationPanel — no new tabs or pages.

**Tech Stack:** Express route, TanStack Query hook, React components. Pure read-side analytics — no schema changes.

---

## File Structure

**Create:**
- `backend/prompt-diff.js` — diff engine + score delta + phrase aggregation
- `backend/tests/prompt-diff.test.js` — unit tests for all utility functions
- `frontend/src/components/common/PromptDiffInline.jsx` — compact green/red phrase diff

**Modify:**
- `backend/routes/analytics.js` — add `GET /api/analytics/branch/:branchId/prompt-intelligence`
- `frontend/src/api.js` — add `promptIntelligence` binding
- `frontend/src/hooks/useQueries.js` — add `usePromptIntelligence` hook
- `frontend/src/components/clips/IterationLineage.jsx` — add prompt delta tag under iteration nodes
- `frontend/src/components/clips/IterationTable.jsx` — add prompt delta column/row
- `frontend/src/components/evaluation/EvaluationPanel.jsx` — add collapsible Prompt Delta section

---

### Task 1: Prompt Diff Engine — Core Utilities

**Files:**
- Create: `backend/prompt-diff.js`
- Create: `backend/tests/prompt-diff.test.js`

- [ ] **Step 1: Write failing tests for `diffPrompts()`**

```js
// backend/tests/prompt-diff.test.js
import { describe, it, expect } from 'vitest';
import { diffPrompts, computeFieldDeltas, aggregatePhraseEffectiveness } from '../prompt-diff.js';

describe('diffPrompts', () => {
  it('returns empty diff for identical prompts', () => {
    const result = diffPrompts('a, b, c', 'a, b, c');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toEqual(['a', 'b', 'c']);
  });

  it('detects added phrases', () => {
    const result = diffPrompts('a, b', 'a, b, c, d');
    expect(result.added).toEqual(['c', 'd']);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toEqual(['a', 'b']);
  });

  it('detects removed phrases', () => {
    const result = diffPrompts('a, b, c', 'a, c');
    expect(result.removed).toEqual(['b']);
    expect(result.added).toEqual([]);
  });

  it('detects both added and removed', () => {
    const result = diffPrompts('a, b, c', 'a, c, d');
    expect(result.added).toEqual(['d']);
    expect(result.removed).toEqual(['b']);
  });

  it('handles empty strings', () => {
    expect(diffPrompts('', '').added).toEqual([]);
    expect(diffPrompts('', 'a, b').added).toEqual(['a', 'b']);
    expect(diffPrompts('a, b', '').removed).toEqual(['a', 'b']);
  });

  it('handles null/undefined', () => {
    expect(diffPrompts(null, 'a').added).toEqual(['a']);
    expect(diffPrompts('a', undefined).removed).toEqual(['a']);
  });

  it('trims whitespace from phrases', () => {
    const result = diffPrompts('a , b,  c', 'a, b, c, d');
    expect(result.added).toEqual(['d']);
    expect(result.removed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `diffPrompts()`**

```js
// backend/prompt-diff.js

/**
 * Tokenize a prompt string into normalized phrases.
 * Prompts are comma-delimited phrase lists: "token, description, action"
 */
function tokenize(prompt) {
  if (!prompt) return [];
  return prompt.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Compute phrase-level diff between two prompt strings.
 * Returns { added: string[], removed: string[], unchanged: string[] }
 */
export function diffPrompts(oldPrompt, newPrompt) {
  const oldPhrases = tokenize(oldPrompt);
  const newPhrases = tokenize(newPrompt);
  const oldSet = new Set(oldPhrases);
  const newSet = new Set(newPhrases);

  return {
    added: newPhrases.filter(p => !oldSet.has(p)),
    removed: oldPhrases.filter(p => !newSet.has(p)),
    unchanged: newPhrases.filter(p => oldSet.has(p))
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: All diffPrompts tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/iteratarr && git add backend/prompt-diff.js backend/tests/prompt-diff.test.js
git commit -m "feat(#18): prompt diff engine — phrase-level diffing"
```

---

### Task 2: Score Delta Computation

**Files:**
- Modify: `backend/prompt-diff.js`
- Modify: `backend/tests/prompt-diff.test.js`

- [ ] **Step 1: Write failing tests for `computeFieldDeltas()`**

Add to `backend/tests/prompt-diff.test.js`:

```js
describe('computeFieldDeltas', () => {
  const parentEval = {
    scores: {
      identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 3, eyes_brow: 4, skin_texture: 3, hair: 4, frame_consistency: 4 },
      location: { location_correct: 3, lighting_correct: 4, wardrobe_correct: 3, geometry_correct: 4 },
      motion: { action_executed: 3, smoothness: 4, camera_movement: 3 },
      grand_total: 54
    }
  };

  const childEval = {
    scores: {
      identity: { face_match: 5, head_shape: 3, jaw: 4, cheekbones: 3, eyes_brow: 4, skin_texture: 3, hair: 4, frame_consistency: 4 },
      location: { location_correct: 3, lighting_correct: 4, wardrobe_correct: 4, geometry_correct: 4 },
      motion: { action_executed: 3, smoothness: 4, camera_movement: 3 },
      grand_total: 56
    }
  };

  it('computes per-field deltas', () => {
    const result = computeFieldDeltas(parentEval, childEval);
    expect(result.field_deltas.face_match).toBe(1);
    expect(result.field_deltas.wardrobe_correct).toBe(1);
    expect(result.field_deltas.camera_movement).toBe(0);
    expect(result.grand_total_delta).toBe(2);
  });

  it('returns null deltas when parent has no evaluation', () => {
    const result = computeFieldDeltas(null, childEval);
    expect(result).toBeNull();
  });

  it('returns null deltas when child has no evaluation', () => {
    const result = computeFieldDeltas(parentEval, null);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: FAIL — computeFieldDeltas not defined

- [ ] **Step 3: Implement `computeFieldDeltas()`**

Add to `backend/prompt-diff.js`:

```js
const ALL_FIELDS = [
  'face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow',
  'skin_texture', 'hair', 'frame_consistency',
  'location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct',
  'action_executed', 'smoothness', 'camera_movement'
];

const CATEGORY_MAP = {
  face_match: 'identity', head_shape: 'identity', jaw: 'identity',
  cheekbones: 'identity', eyes_brow: 'identity', skin_texture: 'identity',
  hair: 'identity', frame_consistency: 'identity',
  location_correct: 'location', lighting_correct: 'location',
  wardrobe_correct: 'location', geometry_correct: 'location',
  action_executed: 'motion', smoothness: 'motion', camera_movement: 'motion'
};

/**
 * Compute per-field score deltas between parent and child evaluations.
 * Returns { field_deltas: { [field]: number }, grand_total_delta: number } or null.
 */
export function computeFieldDeltas(parentEval, childEval) {
  if (!parentEval?.scores || !childEval?.scores) return null;

  const field_deltas = {};
  for (const field of ALL_FIELDS) {
    const cat = CATEGORY_MAP[field];
    const parentVal = parentEval.scores[cat]?.[field] ?? 0;
    const childVal = childEval.scores[cat]?.[field] ?? 0;
    field_deltas[field] = childVal - parentVal;
  }

  const parentTotal = parentEval.scores.grand_total ?? 0;
  const childTotal = childEval.scores.grand_total ?? 0;

  return { field_deltas, grand_total_delta: childTotal - parentTotal };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/iteratarr && git add backend/prompt-diff.js backend/tests/prompt-diff.test.js
git commit -m "feat(#18): score delta computation — per-field change tracking"
```

---

### Task 3: Phrase Effectiveness Aggregation

**Files:**
- Modify: `backend/prompt-diff.js`
- Modify: `backend/tests/prompt-diff.test.js`

- [ ] **Step 1: Write failing tests for `aggregatePhraseEffectiveness()`**

Add to `backend/tests/prompt-diff.test.js`:

```js
describe('aggregatePhraseEffectiveness', () => {
  const chain = [
    {
      iteration_number: 1,
      json_contents: { prompt: 'mckdhn, older man, balcony', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 3 }, location: {}, motion: {}, grand_total: 50 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: null
    },
    {
      iteration_number: 2,
      json_contents: { prompt: 'mckdhn, older man, balcony, natural expression', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 4 }, location: {}, motion: {}, grand_total: 53 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: 'iter1'
    },
    {
      iteration_number: 3,
      json_contents: { prompt: 'mckdhn, older man, balcony, natural expression, outdoor light', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 5 }, location: {}, motion: {}, grand_total: 55 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: 'iter2'
    }
  ];

  it('tracks phrase additions and score deltas', () => {
    const result = aggregatePhraseEffectiveness(chain);
    const natExp = result.phrases.find(p => p.phrase === 'natural expression');
    expect(natExp).toBeDefined();
    expect(natExp.added_at_iteration).toBe(2);
    expect(natExp.avg_score_delta_on_add).toBe(3); // 53 - 50
  });

  it('returns empty for single iteration', () => {
    const result = aggregatePhraseEffectiveness([chain[0]]);
    expect(result.phrases).toEqual([]);
  });

  it('flags confidence based on rope', () => {
    const result = aggregatePhraseEffectiveness(chain);
    expect(result.iterations[1].confidence).toBe('high'); // rope_1 = prompt rope
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: FAIL — aggregatePhraseEffectiveness not defined

- [ ] **Step 3: Implement `aggregatePhraseEffectiveness()`**

Add to `backend/prompt-diff.js`:

```js
const PROMPT_ROPES = new Set([
  'rope_1', 'rope_1_prompt_position',
  'rope_2a_attention_weighting',
  'rope_2b_negative_prompt',
  'rope_6_alt_prompt'
]);

/**
 * Aggregate prompt phrase effectiveness across an iteration chain.
 * Chain must be sorted by iteration_number ascending.
 *
 * Returns {
 *   iterations: [{ iteration_number, prompt_diff, negative_diff, field_deltas, grand_total_delta, confidence }],
 *   phrases: [{ phrase, field: 'prompt'|'negative_prompt', added_at_iteration, avg_score_delta_on_add, field_correlations }]
 * }
 */
export function aggregatePhraseEffectiveness(chain) {
  const iterations = [];
  const phraseMap = new Map(); // phrase -> { field, added_at, deltas: [], field_deltas_on_add: [] }

  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1];
    const child = chain[i];

    const promptDiff = diffPrompts(
      parent.json_contents?.prompt,
      child.json_contents?.prompt
    );
    const negativeDiff = diffPrompts(
      parent.json_contents?.negative_prompt,
      child.json_contents?.negative_prompt
    );

    const scoreDelta = computeFieldDeltas(parent.evaluation, child.evaluation);
    const rope = child.evaluation?.attribution?.rope;
    const isPromptRope = PROMPT_ROPES.has(rope);
    const hasPromptChange = promptDiff.added.length > 0 || promptDiff.removed.length > 0 ||
                            negativeDiff.added.length > 0 || negativeDiff.removed.length > 0;

    // Confidence: high if only a prompt rope was used, mixed if other variables changed too
    let confidence = 'high';
    if (!isPromptRope && hasPromptChange) confidence = 'mixed';
    if (!hasPromptChange) confidence = 'no_prompt_change';

    iterations.push({
      iteration_number: child.iteration_number,
      iteration_id: child.id,
      prompt_diff: promptDiff,
      negative_diff: negativeDiff,
      field_deltas: scoreDelta?.field_deltas || null,
      grand_total_delta: scoreDelta?.grand_total_delta ?? null,
      rope,
      confidence
    });

    // Track phrase additions
    const trackPhrases = (diff, field) => {
      for (const phrase of diff.added) {
        if (!phraseMap.has(`${field}:${phrase}`)) {
          phraseMap.set(`${field}:${phrase}`, {
            phrase,
            field,
            added_at_iteration: child.iteration_number,
            score_delta_on_add: scoreDelta?.grand_total_delta ?? 0,
            field_deltas_on_add: scoreDelta?.field_deltas || {}
          });
        }
      }
    };
    trackPhrases(promptDiff, 'prompt');
    trackPhrases(negativeDiff, 'negative_prompt');
  }

  // Build phrase summaries with field correlations
  const phrases = [];
  for (const [, data] of phraseMap) {
    const correlations = [];
    for (const [field, delta] of Object.entries(data.field_deltas_on_add)) {
      if (delta !== 0) correlations.push({ field, delta });
    }
    correlations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    phrases.push({
      phrase: data.phrase,
      field: data.field,
      added_at_iteration: data.added_at_iteration,
      avg_score_delta_on_add: data.score_delta_on_add,
      field_correlations: correlations.slice(0, 5) // top 5
    });
  }

  phrases.sort((a, b) => Math.abs(b.avg_score_delta_on_add) - Math.abs(a.avg_score_delta_on_add));

  return { iterations, phrases };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run tests/prompt-diff.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/iteratarr && git add backend/prompt-diff.js backend/tests/prompt-diff.test.js
git commit -m "feat(#18): phrase effectiveness aggregation — track which words moved scores"
```

---

### Task 4: Backend Analytics Endpoint

**Files:**
- Modify: `backend/routes/analytics.js`

- [ ] **Step 1: Add prompt intelligence endpoint**

Add to the end of `createAnalyticsRoutes()`, before `return router`:

```js
  /**
   * GET /api/analytics/branch/:branchId/prompt-intelligence
   * Returns prompt evolution + phrase effectiveness for a branch.
   */
  router.get('/branch/:branchId/prompt-intelligence', async (req, res) => {
    try {
      const { aggregatePhraseEffectiveness } = await import('../prompt-diff.js');
      const iterations = await store.list('iterations', i => i.branch_id === req.params.branchId);
      iterations.sort((a, b) => (a.iteration_number || 0) - (b.iteration_number || 0));

      // Enrich with evaluations
      for (const iter of iterations) {
        if (iter.evaluation_id) {
          try { iter.evaluation = await store.get('evaluations', iter.evaluation_id); } catch {}
        }
        // Need json_contents for prompt diffing
        if (!iter.json_contents) {
          try {
            const full = await store.get('iterations', iter.id);
            iter.json_contents = full.json_contents;
          } catch {}
        }
      }

      const result = aggregatePhraseEffectiveness(iterations);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Add import at top of analytics.js**

No additional import needed — using dynamic `import()` inline to avoid circular dependencies.

- [ ] **Step 3: Test endpoint manually**

Run: `curl -s http://localhost:3847/api/analytics/branch/8ef316ae-1950-4894-8c27-b60dc7d33b35/prompt-intelligence | python -c "import sys,json; d=json.load(sys.stdin); print(f'iterations: {len(d[\"iterations\"])}, phrases: {len(d[\"phrases\"])}')"`

Expected: `iterations: N, phrases: M` (non-zero for a branch with prompt changes)

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/iteratarr && git add backend/routes/analytics.js
git commit -m "feat(#18): prompt intelligence endpoint — GET /api/analytics/branch/:branchId/prompt-intelligence"
```

---

### Task 5: Frontend API Binding + Hook

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/hooks/useQueries.js`

- [ ] **Step 1: Add API binding**

In `frontend/src/api.js`, add after the existing analytics bindings (around line 134):

```js
  promptIntelligence: (branchId) => request(`/analytics/branch/${branchId}/prompt-intelligence`),
```

- [ ] **Step 2: Add TanStack Query hook**

In `frontend/src/hooks/useQueries.js`, add after `useSeedPersonalityProfileStatus`:

```js
/** Prompt intelligence for a branch — phrase diffs + score correlations */
export function usePromptIntelligence(branchId, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'prompt-intelligence', branchId],
    queryFn: () => api.promptIntelligence(branchId),
    staleTime: 60000,
    enabled: !!branchId,
    ...options
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/api.js frontend/src/hooks/useQueries.js
git commit -m "feat(#18): prompt intelligence hook + API binding"
```

---

### Task 6: PromptDiffInline Component

**Files:**
- Create: `frontend/src/components/common/PromptDiffInline.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/common/PromptDiffInline.jsx

/**
 * Compact inline prompt diff — green for added phrases, red for removed.
 * Designed for text-xs font-mono inline display in iteration nodes.
 */
export default function PromptDiffInline({ diff, maxPhrases = 3 }) {
  if (!diff) return null;
  const { added, removed } = diff;
  if (added.length === 0 && removed.length === 0) return null;

  const items = [
    ...removed.slice(0, maxPhrases).map(p => ({ type: 'removed', phrase: p })),
    ...added.slice(0, maxPhrases).map(p => ({ type: 'added', phrase: p }))
  ];
  const overflow = (added.length + removed.length) - (maxPhrases * 2);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((item, i) => (
        <span
          key={`${item.type}-${i}`}
          className={`text-[10px] font-mono px-1 rounded ${
            item.type === 'added'
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-score-low line-through'
          }`}
        >
          {item.type === 'added' ? '+' : '-'}{item.phrase}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] font-mono text-gray-600">+{overflow} more</span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/common/PromptDiffInline.jsx
git commit -m "feat(#18): PromptDiffInline component — green/red phrase tags"
```

---

### Task 7: Integrate Into IterationLineage

**Files:**
- Modify: `frontend/src/components/clips/IterationLineage.jsx`

- [ ] **Step 1: Add prompt delta tag to lineage nodes**

Import the component and accept prompt intelligence data as a prop:

At top of file, add:
```jsx
import PromptDiffInline from '../common/PromptDiffInline';
```

Update the export to accept prompt intelligence:
```jsx
export default function IterationLineage({ iterations, selectedId, onSelect, forkPoints = new Set(), showBranchId = false, promptIntel }) {
```

Inside the iteration node button (after the score display, around line 87), add:

```jsx
                {/* Prompt delta tag */}
                {promptIntel?.iterations && (() => {
                  const pi = promptIntel.iterations.find(p => p.iteration_number === iter.iteration_number);
                  if (!pi || pi.confidence === 'no_prompt_change') return null;
                  const hasDiff = pi.prompt_diff?.added?.length > 0 || pi.prompt_diff?.removed?.length > 0;
                  if (!hasDiff) return null;
                  return (
                    <div className="mt-0.5">
                      <PromptDiffInline diff={pi.prompt_diff} maxPhrases={2} />
                      {pi.grand_total_delta !== null && pi.grand_total_delta !== 0 && (
                        <span className={`text-[10px] font-mono ml-1 ${pi.grand_total_delta > 0 ? 'text-green-400' : 'text-score-low'}`}>
                          {pi.grand_total_delta > 0 ? '+' : ''}{pi.grand_total_delta}
                        </span>
                      )}
                    </div>
                  );
                })()}
```

- [ ] **Step 2: Pass promptIntel from ClipDetail**

In `frontend/src/components/clips/ClipDetail.jsx`, import the hook and pass it:

Add import:
```jsx
import { usePromptIntelligence } from '../../hooks/useQueries';
```

Inside the component, after existing hooks:
```jsx
const promptIntel = usePromptIntelligence(nav.selectedBranchId);
```

Pass to IterationLineage (find the existing `<IterationLineage` JSX):
```jsx
<IterationLineage
  iterations={iters.iterations || []}
  selectedId={iters.selectedIteration?.id}
  onSelect={(iter) => guardNavigation(() => iters.setSelectedIteration(iter))}
  forkPoints={new Set((nav.branches || []).filter(b => b.source_iteration_id).map(b => b.source_iteration_id))}
  showBranchId={nav.selectedBranchId === null}
  promptIntel={promptIntel.data}
/>
```

- [ ] **Step 3: Verify visually**

Open a branch with prompt changes in the browser. Lineage nodes should show green/red phrase tags with score deltas under the score number.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/clips/IterationLineage.jsx frontend/src/components/clips/ClipDetail.jsx
git commit -m "feat(#18): prompt diff tags in iteration lineage view"
```

---

### Task 8: Integrate Into IterationTable

**Files:**
- Modify: `frontend/src/components/clips/IterationTable.jsx`

- [ ] **Step 1: Accept promptIntel prop and add column**

Update export signature:
```jsx
export default function IterationTable({ iterations, selectedId, onSelect, comparedIds = [], onComparedChange, onCompareSelected, promptIntel }) {
```

Import PromptDiffInline at top:
```jsx
import PromptDiffInline from '../common/PromptDiffInline';
```

In the row rendering section, after the existing rope column cell, add a prompt delta cell. Find the `<td>` for rope (around line 186) and add after it:

```jsx
                <td className="px-2 py-1.5">
                  {(() => {
                    const pi = promptIntel?.iterations?.find(p => p.iteration_number === row.iteration_number);
                    if (!pi || pi.confidence === 'no_prompt_change') return <span className="text-gray-700">—</span>;
                    return <PromptDiffInline diff={pi.prompt_diff} maxPhrases={2} />;
                  })()}
                </td>
```

Add the column header. In the COLUMNS array (line 43), add after `rope`:
```js
  { key: 'prompt_delta', label: 'Prompt Δ', width: 'w-32' },
```

- [ ] **Step 2: Pass promptIntel from ClipDetail**

In `ClipDetail.jsx`, find the `<IterationTable` JSX and add the prop:
```jsx
promptIntel={promptIntel.data}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/clips/IterationTable.jsx frontend/src/components/clips/ClipDetail.jsx
git commit -m "feat(#18): prompt delta column in iteration table"
```

---

### Task 9: Prompt Delta Section in EvaluationPanel

**Files:**
- Modify: `frontend/src/components/evaluation/EvaluationPanel.jsx`

- [ ] **Step 1: Add collapsible Prompt Delta section**

This is the richest display — shows full word-level diff, field-level score impacts, and confidence.

Import at top:
```jsx
import PromptDiffInline from '../common/PromptDiffInline';
```

Add a new section in the EvaluationPanel JSX. Find where the existing attribution/scoring section begins and add BEFORE it a Prompt Delta row. The exact insertion point will be after the score ring / header area and before the scoring sliders.

Create a self-contained block:

```jsx
{/* Prompt Delta — shows what changed in prompt and which scores moved */}
{parentIteration?.evaluation && iteration.evaluation && (() => {
  const { diffPrompts, computeFieldDeltas } = (() => {
    // Inline diff since we already have both iterations loaded
    const tokenize = (p) => (p || '').split(',').map(s => s.trim()).filter(Boolean);
    const diff = (oldP, newP) => {
      const oldSet = new Set(tokenize(oldP));
      const newSet = new Set(tokenize(newP));
      return {
        added: tokenize(newP).filter(p => !oldSet.has(p)),
        removed: tokenize(oldP).filter(p => !newSet.has(p))
      };
    };
    return { diffPrompts: diff, computeFieldDeltas: null };
  })();

  const promptDiff = diffPrompts(
    parentIteration.json_contents?.prompt,
    iteration.json_contents?.prompt
  );
  const negDiff = diffPrompts(
    parentIteration.json_contents?.negative_prompt,
    iteration.json_contents?.negative_prompt
  );

  const hasChange = promptDiff.added.length > 0 || promptDiff.removed.length > 0 ||
                    negDiff.added.length > 0 || negDiff.removed.length > 0;
  if (!hasChange) return null;

  // Compute field deltas
  const ALL_FIELDS = ['face_match','head_shape','jaw','cheekbones','eyes_brow','skin_texture','hair','frame_consistency','location_correct','lighting_correct','wardrobe_correct','geometry_correct','action_executed','smoothness','camera_movement'];
  const CAT_MAP = { face_match:'identity',head_shape:'identity',jaw:'identity',cheekbones:'identity',eyes_brow:'identity',skin_texture:'identity',hair:'identity',frame_consistency:'identity',location_correct:'location',lighting_correct:'location',wardrobe_correct:'location',geometry_correct:'location',action_executed:'motion',smoothness:'motion',camera_movement:'motion' };

  const pScores = parentIteration.evaluation.scores;
  const cScores = iteration.evaluation.scores;
  const movedFields = ALL_FIELDS
    .map(f => ({ field: f, delta: (cScores[CAT_MAP[f]]?.[f] ?? 0) - (pScores[CAT_MAP[f]]?.[f] ?? 0) }))
    .filter(d => d.delta !== 0);

  const rope = iteration.evaluation?.attribution?.rope;
  const isPromptRope = ['rope_1','rope_1_prompt_position','rope_2a_attention_weighting','rope_2b_negative_prompt','rope_6_alt_prompt'].includes(rope);
  const confidence = isPromptRope ? 'high' : 'mixed';

  return (
    <details className="border border-gray-700 rounded px-3 py-2" open>
      <summary className="text-xs font-mono text-gray-400 cursor-pointer hover:text-gray-300">
        Prompt Delta
        <span className={`ml-2 text-[10px] px-1.5 rounded ${confidence === 'high' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
          {confidence === 'high' ? 'high confidence' : 'mixed change'}
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        {(promptDiff.added.length > 0 || promptDiff.removed.length > 0) && (
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">prompt</span>
            <div className="mt-0.5"><PromptDiffInline diff={promptDiff} maxPhrases={10} /></div>
          </div>
        )}
        {(negDiff.added.length > 0 || negDiff.removed.length > 0) && (
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">negative prompt</span>
            <div className="mt-0.5"><PromptDiffInline diff={negDiff} maxPhrases={10} /></div>
          </div>
        )}
        {movedFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-mono text-gray-500 uppercase">score impact</span>
            {movedFields.map(({ field, delta }) => (
              <span key={field} className={`text-[10px] font-mono px-1 rounded ${delta > 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-score-low'}`}>
                {field.replace('_', ' ')}: {delta > 0 ? '+' : ''}{delta}
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
})()}
```

- [ ] **Step 2: Find exact insertion point**

The Prompt Delta section should go after the iteration header/score area and before the scoring grid. Read EvaluationPanel.jsx to find the right spot — look for the section divider between the header and the "Scoring" area. Insert the block there.

- [ ] **Step 3: Verify visually**

Open a scored iteration that has a parent with prompt changes. The "Prompt Delta" section should appear as a collapsible `<details>` element showing green/red phrase diffs and field score impacts.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/iteratarr && git add frontend/src/components/evaluation/EvaluationPanel.jsx
git commit -m "feat(#18): prompt delta section in evaluation panel — inline diff + score impact"
```

---

### Task 10: Final Verification + Cleanup

**Files:** None new

- [ ] **Step 1: Run all backend tests**

Run: `cd C:/Projects/iteratarr/backend && npx vitest run`
Expected: All tests pass including new prompt-diff tests

- [ ] **Step 2: Run frontend build**

Run: `cd C:/Projects/iteratarr && npm --prefix frontend run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Manual smoke test**

1. Open Iteratarr at localhost:3848
2. Navigate to a clip with iterations that have prompt changes
3. Verify lineage view shows green/red phrase tags with score deltas
4. Verify table view has Prompt Δ column
5. Verify evaluation panel shows collapsible Prompt Delta section with diffs + field impacts + confidence badge
6. Verify baseline iterations (no parent) show no prompt delta
7. Verify iterations where only non-prompt fields changed show "no_prompt_change" (hidden)

- [ ] **Step 4: Final commit**

```bash
cd C:/Projects/iteratarr && git add -A
git commit -m "feat(#18): prompt intelligence v1 — phrase diffs, score correlation, inline UI"
```
