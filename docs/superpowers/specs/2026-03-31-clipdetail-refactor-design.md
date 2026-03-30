# ClipDetail Refactor — Design Spec
**Issue:** coaxk/iteratarr#33
**Date:** 2026-03-31
**Phase:** 5

---

## Problem

`ClipDetail.jsx` is 529 lines. Lines 1–198 are entirely state setup and derived logic — 20 `useState` hooks, 4 `useEffect` hooks, 1 `useMemo`, and several inline handlers — before a single JSX element is rendered. This creates:

- **Cognitive load:** The file is hard to navigate. Adding features means scrolling through unrelated state to find what you need.
- **Re-render surface:** All 20 state variables live at the same component level. An update to `renamingClip` triggers re-evaluation of `filteredIterations` useMemo and re-renders everything below.
- **Fragile foundation:** Upcoming features (Prompt Intelligence, onboarding integration) need to hook into this component. The current shape makes that harder than it should be.
- **Latent bug:** Line 216 directly mutates `clip.name` (a prop). This bypasses React's data flow.

---

## Core Philosophy

Extract state domains into focused custom hooks. Co-locate the one block of JSX with genuinely local state (the clip header). Zero breaking changes to child components — their prop interfaces are untouched.

---

## 1. File Map

### New files

| File | Responsibility |
|---|---|
| `frontend/src/hooks/useClipMeta.js` | Clip name editing + goal/brief editing state and handlers |
| `frontend/src/hooks/useBranchNav.js` | Branch selection, drill navigation, branch modal state |
| `frontend/src/hooks/useIterationState.js` | Iteration selection, live score, unsaved scores tracking, parent/child/ancestor lookups |
| `frontend/src/hooks/useViewFilter.js` | View mode, filters, filteredIterations, comparison state |
| `frontend/src/components/clips/ClipHeader.jsx` | Clip info header block — name, status badge, goal/brief, rename inline editor |

### Modified files

| File | Change |
|---|---|
| `frontend/src/components/clips/ClipDetail.jsx` | 529 → ~130 lines. Calls 4 hooks, renders ClipHeader + existing children, wires callbacks. |

### Unchanged files

All 9 existing components in `frontend/src/components/clips/` and all child components in other directories. No prop interface changes.

---

## 2. Hook Interfaces

### `useClipMeta(clip)`

Manages the clip name and goal/brief editing lifecycle.

```js
const {
  // Goal/brief
  currentGoal,       // string — saved goal
  editingGoal,       // boolean
  goalDraft,         // string — in-flight edit value
  goalSaving,        // boolean
  startEditGoal,     // () => void
  setGoalDraft,      // (val: string) => void
  handleGoalSave,    // async () => void — calls api.updateClip, updates currentGoal
  handleGoalCancel,  // () => void

  // Clip name
  renamingClip,      // boolean
  clipNameDraft,     // string
  setClipNameDraft,  // (val: string) => void
  startRename,       // () => void
  cancelRename,      // () => void
  handleRenameSave,  // async () => void — calls api.updateClip, invalidates ['clips']
} = useClipMeta(clip);
```

**Bug fix:** `handleRenameSave` calls `queryClient.invalidateQueries({ queryKey: ['clips'] })` instead of mutating `clip.name` directly.

---

### `useBranchNav(clipId)`

Manages branch selection and navigation state.

```js
const {
  branches,           // Branch[] from useClipBranches
  refetchBranches,    // () => void
  selectedBranchId,   // string | null
  setSelectedBranchId,// (id: string | null) => void
  drillBranchId,      // string | null — set when drilling from SeedHQ
  drillIntoBranch,    // (id: string) => void — sets drillBranchId + selectedBranchId
  managingBranchId,   // string | null
  setManagingBranchId,// (id: string | null) => void
  showAnalytics,      // boolean
  setShowAnalytics,   // (v: boolean) => void
} = useBranchNav(clipId);
```

Encapsulates the drill-sync `useEffect` (drillBranchId → selectedBranchId) and the auto-select-active-branch `useEffect`.

---

### `useIterationState(clipId, selectedBranchId, onUnsavedScoresChange)`

Manages iteration selection and derived iteration relationships.

```js
const {
  iterations,             // Iteration[] from useClipIterations
  loading,                // boolean
  refetch,                // () => void
  seedScreens,            // SeedScreen[] from useSeedScreens
  refetchSeeds,           // () => void
  selectedIteration,      // Iteration | null
  setSelectedIteration,   // (iter: Iteration | null) => void
  fullSelectedIteration,  // Iteration | null — from useIteration (with json_contents)
  liveScore,              // number | null
  setLiveScore,           // (score: number | null) => void
  hasUnsavedScores,       // boolean
  setHasUnsavedScores,    // (val: boolean) => void — syncs local + calls onUnsavedScoresChange
  childIteration,         // Iteration | null — derived
  parentIteration,        // Iteration | null — derived
  ancestorChain,          // Iteration[] — derived, max 3 + baseline
} = useIterationState(clipId, selectedBranchId, onUnsavedScoresChange);
```

Encapsulates: reset-on-branch-change `useEffect`, auto-select-latest `useEffect`, `childIteration`/`parentIteration` lookups, `ancestorChain` walk.

---

### `useViewFilter(iterations)`

Manages the iteration list view and comparison state.

```js
const {
  viewMode,              // 'lineage' | 'table'
  setViewMode,           // (mode: string) => void
  filters,               // FilterState
  setFilters,            // (f: FilterState) => void
  filteredIterations,    // Iteration[] — memoized
  showComparison,        // boolean
  setShowComparison,     // (v: boolean) => void
  comparedIds,           // string[]
  setComparedIds,        // (ids: string[]) => void
  comparisonPreselect,   // string[] | null
  setComparisonPreselect,// (ids: string[] | null) => void
} = useViewFilter(iterations);
```

Encapsulates the `filteredIterations` `useMemo` (currently lines 119–168) and `hasAnyScoreFilter` derived boolean.

---

## 3. ClipHeader Component

Extracts the clip info header block (currently ~80 lines of inline JSX in ClipDetail's return, lines ~206–290).

```jsx
<ClipHeader
  clip={clip}
  status={status}
  meta={meta}           // useClipMeta result
  onBack={onBack}
/>
```

Owns: clip name display + inline rename editor, status badge, goal/brief display + inline edit. No data fetching — all state is provided via the `meta` object.

---

## 4. ClipDetail After Refactor

```jsx
export default function ClipDetail({ clip, onBack, onUnsavedScoresChange, onNavigateToAnalytics }) {
  const meta = useClipMeta(clip);
  const nav = useBranchNav(clip.id);
  const iters = useIterationState(clip.id, nav.selectedBranchId, onUnsavedScoresChange);
  const view = useViewFilter(iters.iterations);
  const [showSeedGen, setShowSeedGen] = useState(false); // stays here — cross-cutting

  const guardNavigation = (action) => {
    if (iters.hasUnsavedScores && !window.confirm('...')) return;
    iters.setHasUnsavedScores(false);
    action();
  };

  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  return (
    <div className="space-y-4">
      <ClipHeader clip={clip} status={status} meta={meta} onBack={onBack} />
      {/* ... existing conditional renders using nav.*, iters.*, view.* ... */}
    </div>
  );
}
```

Target: ~130 lines. All existing child components receive the same prop shapes they receive today — no changes to `EvaluationPanel`, `BranchPillBar`, `IterationTable`, etc.

---

## 5. Bug Fix

**Location:** Current `ClipDetail.jsx` line 216

**Problem:** `clip.name = clipNameDraft` directly mutates a prop object. Bypasses React data flow — the name shown in the parent `EpisodeTracker` list won't update.

**Fix:** In `useClipMeta.handleRenameSave`:
```js
await api.updateClip(clip.id, { name: clipNameDraft });
queryClient.invalidateQueries({ queryKey: ['clips'] });  // replaces prop mutation
cancelRename();
```

---

## 6. Testing

This is a pure structural refactor — zero behaviour change.

**Verification gate:** `npm --prefix frontend run build` must pass (catches broken imports, missing exports, type errors).

**Manual smoke checklist:**
- Open a clip → header renders correctly
- Rename clip → name updates everywhere (EpisodeTracker list + header)
- Edit goal → saves and persists
- Select a branch → iterations load, selected iteration resets
- Drill from SeedHQ → branch selection syncs
- Apply filters → filtered list updates
- Select comparison → comparison modal opens with correct iterations
- Evaluate an iteration → scores save, navigation works
- Navigate away with unsaved scores → guard dialog fires

**Backend:** 126 tests unaffected — this is a frontend-only change.

**No new unit tests required.** The hooks contain no business logic that isn't already covered by the existing integration path through the UI. Frontend unit test infrastructure (Vitest + React Testing Library) is not set up; adding it is out of scope for this refactor.

---

## 7. Out of Scope

- Adding memo/useCallback optimisations (can be a follow-up once the structure is clean)
- Changing any child component's prop interface
- Frontend unit test infrastructure
- `last_viewed_at` branch patch-on-open (tracked separately, deferred to onboarding)
