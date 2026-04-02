# Codex Task: Frontend Hook Unit Tests

## Mission

Write comprehensive unit tests for 5 custom React hooks in `frontend/src/hooks/`. These hooks were just extracted from a monolithic component and have **zero test coverage**. Your tests are the safety net that catches regressions.

**Output:** 5 test files in `frontend/src/hooks/__tests__/`, one per hook.

## Project Context

Iteratarr is a React 18 + Vite app that manages AI-generated video iteration loops. The evaluation workflow scores video renders against character reference photos using 15 scoring fields across 3 categories (identity, location, motion). The hooks you're testing manage the state for this evaluation workflow.

The frontend is at `C:\Projects\iteratarr\frontend\`. The backend is Express on port 3847. All API calls go through `frontend/src/api.js` which is a thin wrapper around `fetch('/api/...')`.

## Step 0: Install Test Dependencies

The frontend has **no test dependencies yet**. You must install them first:

```bash
cd C:\Projects\iteratarr\frontend
npm install -D vitest @testing-library/react @testing-library/react-hooks jsdom
```

Then create `frontend/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
});
```

Create `frontend/src/test-setup.js`:

```js
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

Add to `frontend/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Verify setup works before writing any tests:
```bash
cd C:\Projects\iteratarr\frontend && npx vitest run
```

## Constants You Need to Know

These are defined in `frontend/src/constants.js` and imported by the hooks:

```js
// 8 identity fields (max 40 points — 8 fields x 5 max)
export const IDENTITY_FIELDS = [
  { key: 'face_match', label: 'Face Match Overall' },
  { key: 'head_shape', label: 'Head Shape' },
  { key: 'jaw', label: 'Jaw Line' },
  { key: 'cheekbones', label: 'Cheekbones' },
  { key: 'eyes_brow', label: 'Eyes / Brow' },
  { key: 'skin_texture', label: 'Skin Texture / Age' },
  { key: 'hair', label: 'Hair' },
  { key: 'frame_consistency', label: 'Frame Consistency' }
];

// 4 location fields (max 20 points — 4 fields x 5 max)
export const LOCATION_FIELDS = [
  { key: 'location_correct', label: 'Location Correct' },
  { key: 'lighting_correct', label: 'Lighting Correct' },
  { key: 'wardrobe_correct', label: 'Wardrobe Correct' },
  { key: 'geometry_correct', label: 'Geometry Correct' }
];

// 3 motion fields (max 15 points — 3 fields x 5 max)
export const MOTION_FIELDS = [
  { key: 'action_executed', label: 'Action Executed' },
  { key: 'smoothness', label: 'Smoothness' },
  { key: 'camera_movement', label: 'Camera Movement' }
];

export const SCORE_LOCK_THRESHOLD = 65; // grandTotal >= 65 → canLock = true
export const GRAND_MAX = 75;            // 40 + 20 + 15
```

**Default scores:** Every field defaults to `3`. So default grandTotal = (8+4+3) * 3 = **45**.

## Mocking Strategy

### TanStack Query hooks
The hooks `useEvalRender` imports `useIterationQueueStatus` and `useRenderStatus` from `./useQueries`. Mock the entire `useQueries` module:

```js
vi.mock('../useQueries', () => ({
  useIterationQueueStatus: vi.fn(() => ({ data: null })),
  useRenderStatus: vi.fn(() => ({ data: null })),
}));
```

### API module
`useClipMeta` and `useEvalRender` import `api` from `../api`. Mock it:

```js
vi.mock('../../api', () => ({
  api: {
    updateClip: vi.fn(() => Promise.resolve({})),
    updateIteration: vi.fn(() => Promise.resolve({})),
  }
}));
```

### TanStack QueryClient (for useClipMeta)
`useClipMeta` uses `useQueryClient()`. Wrap your renderHook in a QueryClientProvider:

```js
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Usage:
const { result } = renderHook(() => useClipMeta(clip), { wrapper: createWrapper() });
```

### window.addEventListener (for beforeunload)
`useEvalScoring` adds a `beforeunload` listener when AI scores are present. Spy on it:

```js
const addSpy = vi.spyOn(window, 'addEventListener');
const removeSpy = vi.spyOn(window, 'removeEventListener');
```

### fetch (for useEvalRender HEAD check)
`useEvalRender` calls `fetch('/api/video?path=...', { method: 'HEAD' })`. Mock global fetch:

```js
global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
```

---

## Hook 1: `useEvalScoring` (`frontend/src/hooks/useEvalScoring.js`)

**File:** `frontend/src/hooks/__tests__/useEvalScoring.test.js`

**Signature:**
```js
useEvalScoring(iteration, { onScoreChange, onUnsavedScoresChange } = {})
```

**Input — `iteration` object shape:**
```js
{
  id: 'iter-001',
  evaluation: null | {
    scores: {
      identity: { face_match: 4, head_shape: 3, jaw: 3, cheekbones: 4, eyes_brow: 3, skin_texture: 4, hair: 4, frame_consistency: 5 },
      location: { location_correct: 5, lighting_correct: 4, wardrobe_correct: 4, geometry_correct: 4 },
      motion: { action_executed: 4, smoothness: 4, camera_movement: 3 }
    },
    attribution: { rope: 'rope_1_prompt_position', lowest_element: 'camera_movement' },
    qualitative_notes: 'Good likeness',
    ai_scores: null | { identity: {...}, location: {...}, motion: {...} },
    scoring_source: 'manual' | 'vision_api' | 'ai_assisted'
  }
}
```

**Return value shape:**
```js
{
  identity: { face_match: 3, ... },     // current identity scores object
  setIdentity: Function,
  location: { location_correct: 3, ... },
  setLocation: Function,
  motion: { action_executed: 3, ... },
  setMotion: Function,
  attribution: {},
  setAttribution: Function,
  notes: '',
  setNotes: Function,
  aiScores: null,
  setAiScores: Function,
  scoringSource: 'manual',
  setScoringSource: Function,
  grandTotal: 45,       // sum of all 15 field scores (each default 3 → 15*3=45)
  canLock: false,       // grandTotal >= 65
  importScores: Function,
}
```

### Tests to write:

1. **Default state for unevaluated iteration**
   - Pass iteration with `evaluation: null`
   - Assert all scores are default 3
   - Assert grandTotal === 45 (15 fields * 3)
   - Assert canLock === false
   - Assert scoringSource === 'manual'
   - Assert aiScores === null, notes === '', attribution === {}

2. **Syncs from evaluated iteration**
   - Pass iteration with full `evaluation` object (all fields set)
   - Assert identity/location/motion match the evaluation scores
   - Assert attribution, notes, scoringSource populated
   - Assert grandTotal matches the sum of provided scores

3. **Resets to defaults when iteration.id changes to unevaluated**
   - Start with evaluated iteration, verify scores loaded
   - Re-render with new iteration (different `id`, `evaluation: null`)
   - Assert all scores reset to default 3, grandTotal back to 45

4. **grandTotal calculation**
   - Render with unevaluated iteration
   - Use `act(() => result.current.setIdentity(...))` to set face_match to 5
   - Assert grandTotal increased by 2 (from 3 to 5)

5. **canLock threshold**
   - Set all identity scores to 5 (8*5=40), all location to 5 (4*5=20), all motion to 5 (3*5=15) → grandTotal 75
   - Assert canLock === true
   - Set one score to 1, making total < 65
   - Assert canLock === false

6. **onScoreChange callback fires on grandTotal change**
   - Pass `onScoreChange` mock function
   - Change a score
   - Assert onScoreChange was called with the new grandTotal

7. **importScores populates all fields**
   - Call `result.current.importScores({ scores: { identity: {...}, location: {...}, motion: {...} }, attribution: { rope: 'rope_1' }, qualitative_notes: 'AI notes', scoring_source: 'vision_api' })`
   - Assert identity/location/motion updated
   - Assert aiScores set (snapshot of imported scores)
   - Assert attribution, notes, scoringSource updated
   - Assert scoringSource === 'vision_api'

8. **onUnsavedScoresChange fires when aiScores set on unevaluated iteration**
   - Pass `onUnsavedScoresChange` mock
   - Call importScores on an unevaluated iteration
   - Assert onUnsavedScoresChange called with `true`

9. **beforeunload listener added when aiScores present and not evaluated**
   - Spy on `window.addEventListener`
   - Call importScores on unevaluated iteration
   - Assert `addEventListener` was called with `'beforeunload'`

10. **beforeunload listener NOT added when iteration is evaluated**
    - Pass iteration with evaluation
    - Assert no beforeunload listener

---

## Hook 2: `useEvalRender` (`frontend/src/hooks/useEvalRender.js`)

**File:** `frontend/src/hooks/__tests__/useEvalRender.test.js`

**Signature:**
```js
useEvalRender(iteration)
```

**Input — `iteration` object shape:**
```js
{
  id: 'iter-001',
  status: 'pending' | 'rendered' | 'evaluated' | 'failed',
  render_path: 'C:/path/to/render.mp4' | null,
  json_path: 'C:/path/to/iteration.json' | null,
}
```

**Return value:**
```js
{
  isPending: true|false,      // status === 'pending' || status === 'failed'
  renderSubmitted: false,
  setRenderSubmitted: Function,
  renderProgress: null,
  setRenderProgress: Function,
  renderStatus: null,          // null | 'checking' | 'rendering' | 'complete' | 'failed' | 'submitting'
  setRenderStatus: Function,
  queueAdded: false,           // false | 'queued' | 'rendering' | 'complete' | 'failed'
  setQueueAdded: Function,
  iterQueueStatus: undefined,  // raw data from TanStack query
}
```

**Important:** This hook calls TanStack Query hooks internally (`useIterationQueueStatus`, `useRenderStatus`). You MUST mock `../useQueries` — see mocking strategy above. Also mock `../../api` and `global.fetch`.

### Tests to write:

1. **isPending for pending iteration**
   - Pass `{ id: '1', status: 'pending' }`
   - Assert isPending === true

2. **isPending for failed iteration**
   - Pass `{ id: '1', status: 'failed' }`
   - Assert isPending === true

3. **isPending false for rendered iteration**
   - Pass `{ id: '1', status: 'rendered' }`
   - Assert isPending === false

4. **Resets state on iteration.id change**
   - Set queueAdded to 'queued' via setQueueAdded
   - Re-render with new iteration id
   - Assert queueAdded === false, renderStatus === null, renderProgress === null

5. **HEAD check fires for pending iteration with render_path**
   - Mock `global.fetch` to resolve ok
   - Pass `{ id: '1', status: 'pending', render_path: '/path/render.mp4' }`
   - Assert fetch was called with HEAD method
   - Assert renderStatus becomes 'complete' when fetch resolves ok

6. **HEAD check does NOT fire for non-pending iteration**
   - Pass `{ id: '1', status: 'rendered', render_path: '/path/render.mp4' }`
   - Assert fetch was NOT called

7. **Syncs queueAdded from iterQueueStatus**
   - Mock `useIterationQueueStatus` to return `{ data: { in_queue: true, status: 'queued' } }`
   - Assert queueAdded === 'queued'

8. **Syncs renderStatus from iterQueueStatus when rendering**
   - Mock `useIterationQueueStatus` to return `{ data: { in_queue: true, status: 'rendering', progress: { percent: 45 } } }`
   - Assert renderStatus === 'rendering', renderProgress.percent === 45

---

## Hook 3: `useEvalGenerate` (`frontend/src/hooks/useEvalGenerate.js`)

**File:** `frontend/src/hooks/__tests__/useEvalGenerate.test.js`

**Signature:**
```js
useEvalGenerate(iteration, childIteration, attribution)
```

**Input shapes:**
```js
// iteration
{ id: 'iter-001', json_contents: { prompt: 'a man walking', guidance_scale: 5.9 } }

// childIteration (null if no child exists)
{ json_contents: { prompt: 'a man running' }, json_path: '/path/iter_02.json', json_filename: 'iter_02.json' }
// or null

// attribution (from useEvalScoring)
{ next_changes: { guidance_scale: 5.5 }, next_change_json_field: 'guidance_scale', next_change_value: 5.5 }
// or {}
```

**Return value:**
```js
{
  generatedPath: null|string,
  renderPath: null|string,
  outputJson: null|object,
  generatedIterNum: null|number,
  generatedChild: null|object,
  showGenerated: false,
  setShowGenerated: Function,
  showJsonPatch: false,
  setShowJsonPatch: Function,
  jsonPatchText: '',
  jsonPatchError: null|string,
  jsonPatchPromptWarning: null|string,
  proposedNextJson: null|object,    // iteration.json_contents merged with attribution changes
  handleJsonPatchChange: Function,  // validates JSON, sets error/warning
  handleOpenJsonPatch: Function,    // opens editor, pre-fills with proposedNextJson
  getJsonOverride: Function,        // returns parsed JSON or undefined
  setGenerationResult: Function,    // sets all generation output state at once
}
```

### Tests to write:

1. **Syncs from childIteration on mount**
   - Pass childIteration with json_contents and json_path
   - Assert outputJson === childIteration.json_contents
   - Assert generatedPath === childIteration.json_path

2. **Null childIteration → null output**
   - Pass childIteration = null
   - Assert outputJson === null, generatedPath === null

3. **Resets on iteration.id change**
   - Start with childIteration
   - Re-render with new iteration.id and childIteration = null
   - Assert outputJson reset to null

4. **proposedNextJson applies next_changes from attribution**
   - Pass iteration with json_contents: `{ prompt: 'hello', guidance_scale: 5.9 }`
   - Pass attribution: `{ next_changes: { guidance_scale: 5.5 } }`
   - Assert proposedNextJson === `{ prompt: 'hello', guidance_scale: 5.5 }`

5. **proposedNextJson applies single field change from attribution**
   - Pass attribution: `{ next_change_json_field: 'guidance_scale', next_change_value: 4.0 }`
   - Assert proposedNextJson.guidance_scale === 4.0

6. **proposedNextJson null when iteration has no json_contents**
   - Pass iteration: `{ id: '1', json_contents: null }`
   - Assert proposedNextJson === null

7. **handleJsonPatchChange with valid JSON — no error**
   - Call `handleJsonPatchChange('{"prompt":"test"}')`
   - Assert jsonPatchError === null
   - Assert jsonPatchText === '{"prompt":"test"}'

8. **handleJsonPatchChange with invalid JSON — sets error**
   - Call `handleJsonPatchChange('{invalid')`
   - Assert jsonPatchError is a string (the JSON parse error message)

9. **handleJsonPatchChange detects negative quality terms in prompt**
   - Call `handleJsonPatchChange('{"prompt":"a blurry man walking"}')`
   - Assert jsonPatchPromptWarning contains 'blurry'

10. **handleJsonPatchChange no warning for clean prompt**
    - Call `handleJsonPatchChange('{"prompt":"a man walking in sunlight"}')`
    - Assert jsonPatchPromptWarning === null

11. **handleOpenJsonPatch pre-fills with proposedNextJson**
    - Set up proposedNextJson (iteration with json_contents + attribution with changes)
    - Call handleOpenJsonPatch
    - Assert showJsonPatch === true
    - Assert jsonPatchText === JSON.stringify(proposedNextJson, null, 2)

12. **getJsonOverride returns parsed JSON when valid**
    - Open json patch, set valid text
    - Assert getJsonOverride() returns the parsed object

13. **getJsonOverride returns undefined when patch has error**
    - Set invalid JSON text
    - Assert getJsonOverride() === undefined

14. **getJsonOverride returns undefined when patch not open**
    - Don't open json patch
    - Assert getJsonOverride() === undefined

15. **setGenerationResult sets all output state**
    - Call `setGenerationResult({ json_path: '/p', render_path: '/r', json_contents: { a: 1 }, iteration_number: 5 })`
    - Assert generatedPath === '/p', renderPath === '/r', outputJson === { a: 1 }, generatedIterNum === 5
    - Assert showGenerated === true

---

## Hook 4: `useEvalVideo` (`frontend/src/hooks/useEvalVideo.js`)

**File:** `frontend/src/hooks/__tests__/useEvalVideo.test.js`

**Signature:**
```js
useEvalVideo(iteration, parentIteration)
```

**Input:**
```js
// iteration
{ id: 'iter-002', render_path: '/renders/iter_02.mp4' }

// parentIteration (null if first iteration)
{ id: 'iter-001', render_path: '/renders/iter_01.mp4' }
```

**Return:**
```js
{
  currentVideoPath: '/renders/iter_02.mp4',
  setCurrentVideoPath: Function,
  previousVideoPath: '/renders/iter_01.mp4',
  setPreviousVideoPath: Function,
  comparisonVideoPath: null,
  setComparisonVideoPath: Function,
  comparisonIter: null,
  setComparisonIter: Function,
}
```

### Tests to write:

1. **Sets currentVideoPath from iteration.render_path**
   - Assert currentVideoPath === iteration.render_path

2. **Sets previousVideoPath from parentIteration.render_path**
   - Assert previousVideoPath === parentIteration.render_path

3. **Null parentIteration → null previousVideoPath**
   - Pass parentIteration = null
   - Assert previousVideoPath === null

4. **Null render_path → null currentVideoPath**
   - Pass iteration with render_path: null
   - Assert currentVideoPath === null

5. **Resets comparison state on iteration.id change**
   - Set comparisonVideoPath and comparisonIter via setters
   - Re-render with new iteration.id
   - Assert comparisonVideoPath === null, comparisonIter === null

6. **Updates paths when iteration.id changes**
   - Start with iter-001 render_path '/a.mp4'
   - Re-render with iter-002 render_path '/b.mp4'
   - Assert currentVideoPath === '/b.mp4'

---

## Hook 5: `useClipMeta` (`frontend/src/hooks/useClipMeta.js`)

**File:** `frontend/src/hooks/__tests__/useClipMeta.test.js`

**Signature:**
```js
useClipMeta(clip)
```

**Input — `clip` object shape:**
```js
{
  id: 'clip-001',
  name: 'Mick Doohan - Baseline',
  goal: 'Achieve realistic likeness of Mick in outdoor setting'
}
```

**Return value:**
```js
{
  // Goal editing
  currentGoal: 'Achieve realistic...',
  editingGoal: false,
  goalDraft: 'Achieve realistic...',
  goalSaving: false,
  goalSaved: false,
  startEditGoal: Function,      // sets editingGoal = true
  setGoalDraft: Function,       // updates draft text
  handleGoalSave: Function,     // async — calls api.updateClip, sets goalSaved
  handleGoalCancel: Function,   // reverts draft to currentGoal, exits edit mode
  // Clip rename
  currentClipName: 'Mick Doohan - Baseline',
  renamingClip: false,
  clipNameDraft: 'Mick Doohan - Baseline',
  setClipNameDraft: Function,
  startRename: Function,        // sets renamingClip = true
  cancelRename: Function,       // sets renamingClip = false
  handleRenameSave: Function,   // async — calls api.updateClip, invalidates queries
}
```

**Important:** This hook uses `useReducer` internally (not useState). It also calls `useQueryClient()` from TanStack Query, so you MUST wrap renderHook in a `QueryClientProvider` — see mocking strategy above. Mock `../../api` for the async handlers.

### Tests to write:

1. **Initial state from clip**
   - Assert currentGoal === clip.goal
   - Assert currentClipName === clip.name
   - Assert editingGoal === false, renamingClip === false

2. **startEditGoal sets editingGoal true**
   - Call startEditGoal()
   - Assert editingGoal === true

3. **setGoalDraft updates draft**
   - Call setGoalDraft('new goal text')
   - Assert goalDraft === 'new goal text'
   - Assert currentGoal unchanged (still original)

4. **handleGoalCancel reverts draft to currentGoal**
   - Start editing, change draft
   - Call handleGoalCancel()
   - Assert goalDraft === original goal
   - Assert editingGoal === false

5. **handleGoalSave success flow**
   - Mock api.updateClip to resolve
   - Start editing, change draft to 'New goal'
   - Call handleGoalSave(), await it
   - Assert goalSaving transitions: false → true → false
   - Assert currentGoal === 'New goal'
   - Assert editingGoal === false
   - Assert goalSaved === true
   - Assert api.updateClip called with (clip.id, { goal: 'New goal' })

6. **handleGoalSave error flow**
   - Mock api.updateClip to reject
   - Call handleGoalSave()
   - Assert goalSaving returns to false
   - Assert currentGoal unchanged
   - Assert goalSaved === false (never set to true)

7. **goalSaved clears after timeout**
   - After successful save, goalSaved === true
   - Use vi.advanceTimersByTime(2000) (with vi.useFakeTimers())
   - Assert goalSaved === false

8. **startRename / cancelRename**
   - Call startRename(), assert renamingClip === true
   - Call cancelRename(), assert renamingClip === false

9. **setClipNameDraft updates draft**
   - Call setClipNameDraft('New Name')
   - Assert clipNameDraft === 'New Name'

10. **handleRenameSave success flow**
    - Mock api.updateClip to resolve
    - Change draft to 'Renamed Clip'
    - Call handleRenameSave(), await it
    - Assert currentClipName === 'Renamed Clip'
    - Assert renamingClip === false
    - Assert api.updateClip called with (clip.id, { name: 'Renamed Clip' })

11. **Sync on clip.id change**
    - Start with clip { id: 'a', name: 'A', goal: 'GA' }
    - Re-render with clip { id: 'b', name: 'B', goal: 'GB' }
    - Assert currentGoal === 'GB', currentClipName === 'B'
    - Assert editingGoal === false, renamingClip === false (reset)

12. **Clip with null goal**
    - Pass clip with goal: null
    - Assert currentGoal === '', goalDraft === ''

---

## File Structure

After completion, these files should exist:

```
frontend/
  vitest.config.js                          (NEW)
  src/
    test-setup.js                           (NEW)
    hooks/
      __tests__/
        useEvalScoring.test.js              (NEW — ~10 tests)
        useEvalRender.test.js               (NEW — ~8 tests)
        useEvalGenerate.test.js             (NEW — ~15 tests)
        useEvalVideo.test.js                (NEW — ~6 tests)
        useClipMeta.test.js                 (NEW — ~12 tests)
```

## Run Command

```bash
cd C:\Projects\iteratarr\frontend && npx vitest run
```

All tests must pass. Do NOT modify any existing source files — only create new test files and config files.

## Quality Bar

- Every test should have a descriptive name that reads like a sentence
- Use `renderHook` from `@testing-library/react` (or `@testing-library/react-hooks`)
- Use `act()` for state updates
- Use `waitFor` for async operations
- Use `vi.fn()` for mocks, `vi.spyOn()` for spies
- Use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` for timer tests (goalSaved timeout)
- Do NOT test implementation details — test the public API (return values and callbacks)
- Each test file should be independently runnable
