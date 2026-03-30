# ClipDetail Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 529-line ClipDetail god component into 4 focused custom hooks + 1 extracted ClipHeader component, reducing ClipDetail to ~130 lines of thin orchestration with zero behaviour change.

**Architecture:** Extract each of the 5 state domains (clip metadata, branch navigation, iteration selection, view/filter, and comparison) into dedicated custom hooks. Co-locate the clip header JSX into a ClipHeader component that owns its own state via the useClipMeta hook. All existing child components are untouched — their prop interfaces are identical before and after.

**Tech Stack:** React 18, TanStack Query v5, custom hooks pattern.

---

## Orchestrator Notes

You are the builder. I am the orchestrator. **After completing each task, run the build and confirm it passes, then stop for review.** Do not proceed to the next task without confirmation.

Read each task in full before starting. The code blocks below are exact — do not paraphrase or approximate them.

**Verification command after every task:**
```bash
npm --prefix frontend run build
```
Expected output: `✓ built in Xs` with no errors. If the build fails, fix it before stopping for review.

---

## File Map

**Created:**
- `frontend/src/hooks/useClipMeta.js`
- `frontend/src/hooks/useBranchNav.js`
- `frontend/src/hooks/useIterationState.js`
- `frontend/src/hooks/useViewFilter.js`
- `frontend/src/components/clips/ClipHeader.jsx`

**Modified:**
- `frontend/src/components/clips/ClipDetail.jsx` — 529 → ~130 lines

**Unchanged:** All other files. Do not touch any file not listed above.

---

## Task 1: useClipMeta hook

**Files:**
- Create: `frontend/src/hooks/useClipMeta.js`

This hook owns all state related to clip name editing and goal/brief editing. It also fixes a latent bug: the original code mutates `clip.name` directly (`clip.name = clipNameDraft` on line 216 of ClipDetail.jsx). The fix is to call `queryClient.invalidateQueries({ queryKey: ['clips'] })` after a successful rename instead.

- [ ] **Step 1: Create frontend/src/hooks/useClipMeta.js**

```js
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useClipMeta(clip) {
  const queryClient = useQueryClient();

  // Goal / creative brief
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(clip.goal || '');
  const [goalSaving, setGoalSaving] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(clip.goal || '');

  // Clip name
  const [renamingClip, setRenamingClip] = useState(false);
  const [clipNameDraft, setClipNameDraft] = useState(clip.name);

  const handleGoalSave = async () => {
    setGoalSaving(true);
    try {
      await api.updateClip(clip.id, { goal: goalDraft });
      setCurrentGoal(goalDraft);
      setEditingGoal(false);
    } catch (err) {
      console.error('Failed to save goal:', err);
    } finally {
      setGoalSaving(false);
    }
  };

  const handleGoalCancel = () => {
    setGoalDraft(currentGoal);
    setEditingGoal(false);
  };

  const handleRenameSave = async () => {
    try {
      await api.updateClip(clip.id, { name: clipNameDraft });
      // Invalidate clips cache so EpisodeTracker list updates — fixes prop mutation bug
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      setRenamingClip(false);
    } catch (err) {
      console.error('Failed to rename clip:', err);
    }
  };

  return {
    // Goal
    currentGoal,
    editingGoal,
    goalDraft,
    goalSaving,
    startEditGoal: () => setEditingGoal(true),
    setGoalDraft,
    handleGoalSave,
    handleGoalCancel,
    // Clip name
    renamingClip,
    clipNameDraft,
    setClipNameDraft,
    startRename: () => setRenamingClip(true),
    cancelRename: () => setRenamingClip(false),
    handleRenameSave,
  };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useClipMeta.js
git commit -m "refactor(clip): extract useClipMeta hook — clip name + goal editing state"
```

**Stop. Notify orchestrator before Task 2.**

---

## Task 2: useBranchNav hook

**Files:**
- Create: `frontend/src/hooks/useBranchNav.js`

This hook owns branch selection, the SeedHQ drill navigation, and the branch modal states (manage menu + analytics modal). It encapsulates two `useEffect` hooks from the original: the drill-sync effect and the auto-select-active-branch effect.

- [ ] **Step 1: Create frontend/src/hooks/useBranchNav.js**

```js
import { useState, useEffect } from 'react';
import { useClipBranches } from './useQueries';

export function useBranchNav(clipId) {
  const { data: branches, refetch: refetchBranches } = useClipBranches(clipId);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [drillBranchId, setDrillBranchId] = useState(null);
  const [managingBranchId, setManagingBranchId] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // When drilling into a branch, sync selectedBranchId
  useEffect(() => {
    if (drillBranchId) {
      setSelectedBranchId(drillBranchId);
    }
  }, [drillBranchId]);

  // Auto-select the most recently active branch when branches load
  useEffect(() => {
    if (branches?.length > 0 && selectedBranchId === null && drillBranchId) {
      const active = branches
        .filter(b => b.status === 'active' || b.status === 'locked')
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      if (active.length > 0) {
        setSelectedBranchId(active[0].id);
      }
    }
  }, [branches]);

  /** Sets both drillBranchId and selectedBranchId in one call */
  const drillIntoBranch = (branchId) => {
    setDrillBranchId(branchId);
    setSelectedBranchId(branchId);
  };

  return {
    branches,
    refetchBranches,
    selectedBranchId,
    setSelectedBranchId,
    drillBranchId,
    setDrillBranchId,
    drillIntoBranch,
    managingBranchId,
    setManagingBranchId,
    showAnalytics,
    setShowAnalytics,
  };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useBranchNav.js
git commit -m "refactor(clip): extract useBranchNav hook — branch selection, drill navigation, modal state"
```

**Stop. Notify orchestrator before Task 3.**

---

## Task 3: useIterationState hook

**Files:**
- Create: `frontend/src/hooks/useIterationState.js`

This hook owns iteration selection, live score tracking, the unsaved-scores flag (with parent callback sync), and the derived iteration relationships (child, parent, ancestor chain). It encapsulates the reset-on-branch-change `useEffect` and the auto-select-latest `useEffect`.

- [ ] **Step 1: Create frontend/src/hooks/useIterationState.js**

```js
import { useState, useEffect } from 'react';
import { useClipIterations, useSeedScreens, useIteration } from './useQueries';

export function useIterationState(clipId, selectedBranchId, onUnsavedScoresChange) {
  const { data: iterations, isLoading: loading, refetch } = useClipIterations(clipId, selectedBranchId);
  const { data: seedScreens, refetch: refetchSeeds } = useSeedScreens(clipId);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const { data: fullSelectedIteration } = useIteration(selectedIteration?.id);
  const [liveScore, setLiveScore] = useState(null);
  const [hasUnsavedScores, setHasUnsavedScoresLocal] = useState(false);

  /** Syncs local state and notifies parent */
  const setHasUnsavedScores = (val) => {
    setHasUnsavedScoresLocal(val);
    onUnsavedScoresChange?.(val);
  };

  // Reset selected iteration when branch changes
  useEffect(() => {
    setSelectedIteration(null);
  }, [selectedBranchId]);

  // Auto-select the latest iteration when data loads
  useEffect(() => {
    if (iterations?.length && !selectedIteration) {
      const latest = iterations.reduce((max, i) =>
        (i.iteration_number || 0) > (max.iteration_number || 0) ? i : max, iterations[0]);
      setSelectedIteration(latest);
    }
  }, [iterations]);

  // Derived: child iteration (the one whose parent is the current selection)
  const childIteration = selectedIteration && iterations
    ? iterations.find(i => i.parent_iteration_id === selectedIteration.id)
    : null;

  // Derived: parent iteration (the one the current selection was derived from)
  const parentIteration = selectedIteration?.parent_iteration_id && iterations
    ? iterations.find(i => i.id === selectedIteration.parent_iteration_id)
    : null;

  // Derived: ancestor chain — walk up parent_iteration_id, max 3 + baseline
  const ancestorChain = (() => {
    if (!selectedIteration || !iterations) return [];
    const chain = [];
    let current = selectedIteration;
    while (current?.parent_iteration_id && chain.length < 3) {
      const parent = iterations.find(i => i.id === current.parent_iteration_id);
      if (!parent?.evaluation) break;
      chain.push(parent);
      current = parent;
    }
    // Add iteration #1 as baseline if not already in chain
    const first = iterations.find(i => i.iteration_number === 1);
    if (first?.evaluation && !chain.find(c => c.id === first.id)) {
      chain.push(first);
    }
    return chain;
  })();

  return {
    iterations,
    loading,
    refetch,
    seedScreens,
    refetchSeeds,
    selectedIteration,
    setSelectedIteration,
    fullSelectedIteration,
    liveScore,
    setLiveScore,
    hasUnsavedScores,
    setHasUnsavedScores,
    childIteration,
    parentIteration,
    ancestorChain,
  };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useIterationState.js
git commit -m "refactor(clip): extract useIterationState hook — iteration selection, derived lookups, score tracking"
```

**Stop. Notify orchestrator before Task 4.**

---

## Task 4: useViewFilter hook

**Files:**
- Create: `frontend/src/hooks/useViewFilter.js`

This hook owns view mode switching (lineage vs table), filter state, the `filteredIterations` memoized computation (currently 50 lines of inline logic in ClipDetail), and the comparison modal state.

- [ ] **Step 1: Create frontend/src/hooks/useViewFilter.js**

```js
import { useState, useMemo } from 'react';
import { DEFAULT_FILTERS } from '../components/clips/IterationFilter';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../constants';

export function useViewFilter(iterations) {
  const [viewMode, setViewMode] = useState('lineage');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [showComparison, setShowComparison] = useState(false);
  const [comparedIds, setComparedIds] = useState([]);
  const [comparisonPreselect, setComparisonPreselect] = useState(null);

  const sumFields = (scoreGroup, fields) => {
    if (!scoreGroup) return null;
    return fields.reduce((s, f) => s + (scoreGroup[f.key] || 0), 0);
  };

  const hasAnyScoreFilter = filters.scoreMin !== null || filters.scoreMax !== null
    || filters.identityMin !== null || filters.locationMin !== null || filters.motionMin !== null;

  const filteredIterations = useMemo(() => {
    if (!iterations) return [];
    const hasAnyFilter = Object.values(filters).some(v => v !== null);
    if (!hasAnyFilter) return iterations;

    return iterations.filter(iter => {
      const ev = iter.evaluation;
      const scores = ev?.scores;
      const isUnevaluated = !ev || !scores;

      if (isUnevaluated && hasAnyScoreFilter) return false;

      if (filters.scoreMin !== null && (isUnevaluated || (scores.grand_total ?? 0) < filters.scoreMin)) return false;
      if (filters.scoreMax !== null && (isUnevaluated || (scores.grand_total ?? 0) > filters.scoreMax)) return false;

      if (filters.identityMin !== null) {
        const total = sumFields(scores?.identity, IDENTITY_FIELDS);
        if (total === null || total < filters.identityMin) return false;
      }
      if (filters.locationMin !== null) {
        const total = sumFields(scores?.location, LOCATION_FIELDS);
        if (total === null || total < filters.locationMin) return false;
      }
      if (filters.motionMin !== null) {
        const total = sumFields(scores?.motion, MOTION_FIELDS);
        if (total === null || total < filters.motionMin) return false;
      }

      if (filters.rope !== null) {
        if ((ev?.attribution?.rope || null) !== filters.rope) return false;
      }

      if (filters.source !== null) {
        if ((ev?.scoring_source || null) !== filters.source) return false;
      }

      if (filters.tag !== null) {
        const tags = iter.tags || [];
        if (!tags.some(t => t.toLowerCase().includes(filters.tag.toLowerCase()))) return false;
      }

      return true;
    });
  }, [iterations, filters, hasAnyScoreFilter]);

  return {
    viewMode,
    setViewMode,
    filters,
    setFilters,
    filteredIterations,
    showComparison,
    setShowComparison,
    comparedIds,
    setComparedIds,
    comparisonPreselect,
    setComparisonPreselect,
  };
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useViewFilter.js
git commit -m "refactor(clip): extract useViewFilter hook — view mode, filter state, comparison state"
```

**Stop. Notify orchestrator before Task 5.**

---

## Task 5: ClipHeader component

**Files:**
- Create: `frontend/src/components/clips/ClipHeader.jsx`

Extract the clip info header block — currently ~90 lines of JSX inline in ClipDetail's `return` (lines 201–296 of ClipDetail.jsx). This component renders the back button, clip name (with rename editor), status badge, location/characters metadata, and goal/brief editor. It receives the `useClipMeta` result as `meta`.

- [ ] **Step 1: Create frontend/src/components/clips/ClipHeader.jsx**

```jsx
export default function ClipHeader({ clip, status, meta, onBack }) {
  const {
    currentGoal, editingGoal, goalDraft, goalSaving,
    startEditGoal, setGoalDraft, handleGoalSave, handleGoalCancel,
    renamingClip, clipNameDraft, setClipNameDraft,
    startRename, cancelRename, handleRenameSave,
  } = meta;

  return (
    <>
      <button
        onClick={onBack}
        className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
      >
        &larr; Back to Episode Tracker
      </button>

      <div className="border border-gray-700 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          {renamingClip ? (
            <div className="flex items-center gap-2">
              <input
                value={clipNameDraft}
                onChange={(e) => setClipNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSave();
                  if (e.key === 'Escape') cancelRename();
                }}
                autoFocus
                className="bg-surface border border-gray-600 rounded px-2 py-1 text-lg font-mono text-gray-200"
              />
              <button
                onClick={handleRenameSave}
                className="px-2 py-1 bg-accent text-black text-xs font-mono font-bold rounded"
              >
                Save
              </button>
              <button
                onClick={cancelRename}
                className="text-xs font-mono text-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h2
              className="text-lg font-mono text-gray-200 cursor-pointer hover:text-accent transition-colors"
              onClick={startRename}
              title="Click to rename"
            >
              {clip.name}
            </h2>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono ${status.color} text-black font-bold`}>
            {status.label}
          </span>
        </div>

        <div className="flex gap-4 text-xs font-mono text-gray-400">
          {clip.location && <span>Location: {clip.location}</span>}
          {clip.characters?.length > 0 && (
            <span className="flex items-center gap-1">
              Characters:{' '}
              {clip.characters.map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs font-mono">
                  {c}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Creative brief / goal */}
        <div className="mt-3">
          {editingGoal ? (
            <div className="space-y-2">
              <textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="What does 'done' look like? Action, character requirements, location, mood, must-avoid..."
                rows={3}
                autoFocus
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleGoalSave}
                  disabled={goalSaving}
                  className="px-3 py-1 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
                >
                  {goalSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleGoalCancel}
                  className="px-3 py-1 text-xs font-mono text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : currentGoal ? (
            <div className="flex items-start gap-2">
              <div className="text-xs font-mono text-gray-400 border-l-2 border-accent/30 pl-3 flex-1 whitespace-pre-wrap">
                {currentGoal}
              </div>
              <button
                onClick={startEditGoal}
                className="shrink-0 text-xs font-mono text-gray-500 hover:text-accent transition-colors"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={startEditGoal}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors italic"
            >
              Add creative brief...
            </button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/clips/ClipHeader.jsx
git commit -m "refactor(clip): extract ClipHeader component — clip name, status badge, goal/brief editor"
```

**Stop. Notify orchestrator before Task 6.**

---

## Task 6: Refactor ClipDetail to use hooks + ClipHeader

**Files:**
- Modify: `frontend/src/components/clips/ClipDetail.jsx`

Replace the entire contents of `ClipDetail.jsx` with the version below. This is a **full file replacement** — do not try to surgically edit the existing file. The new version:
- Calls the 4 hooks and wires them together
- Renders ClipHeader in place of the inline header block
- Routes all state references through `meta.*`, `nav.*`, `iters.*`, `view.*`
- Keeps `showSeedGen` as a direct `useState` (it is cross-cutting and has no single owner)
- Is identical in behaviour to the original — every callback, every prop passed to every child component is preserved

- [ ] **Step 1: Replace ClipDetail.jsx entirely**

```jsx
import { useState } from 'react';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPES } from '../../constants';
import { useClipMeta } from '../../hooks/useClipMeta';
import { useBranchNav } from '../../hooks/useBranchNav';
import { useIterationState } from '../../hooks/useIterationState';
import { useViewFilter } from '../../hooks/useViewFilter';
import { api } from '../../api';
import ClipHeader from './ClipHeader';
import IterationLineage from './IterationLineage';
import IterationTable from './IterationTable';
import IterationFilter from './IterationFilter';
import ComparisonView from './ComparisonView';
import ScoreRing from '../evaluation/ScoreRing';
import EvaluationPanel from '../evaluation/EvaluationPanel';
import SeedScreening from '../screening/SeedScreening';
import SeedHQ from './SeedHQ';
import BranchPillBar from './BranchPillBar';
import BranchManageMenu from './BranchManageMenu';
import BranchAnalytics from '../analytics/BranchAnalytics';

export default function ClipDetail({ clip, onBack, onUnsavedScoresChange: parentUnsavedCallback, onNavigateToAnalytics }) {
  const meta = useClipMeta(clip);
  const nav = useBranchNav(clip.id);
  const iters = useIterationState(clip.id, nav.selectedBranchId, parentUnsavedCallback);
  const view = useViewFilter(iters.iterations);
  const [showSeedGen, setShowSeedGen] = useState(false);

  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  const guardNavigation = (action) => {
    if (iters.hasUnsavedScores && !window.confirm('You have unsaved Vision API scores. Leave without saving?')) return;
    iters.setHasUnsavedScores(false);
    action();
  };

  return (
    <div className="space-y-4">
      <ClipHeader clip={clip} status={status} meta={meta} onBack={onBack} />

      {/* ═══════════════════════════════════════════════════
         SEED HQ — the tree view (when not drilled into a branch)
         ═══════════════════════════════════════════════════ */}
      {!nav.drillBranchId && !showSeedGen && (
        <SeedHQ
          clip={clip}
          branches={nav.branches}
          seedScreens={iters.seedScreens}
          onEnterBranch={(branchId) => {
            nav.drillIntoBranch(branchId);
            iters.setSelectedIteration(null);
          }}
          onGenerateSeeds={() => setShowSeedGen(true)}
          onRefresh={() => { nav.refetchBranches(); iters.refetchSeeds(); }}
          onManageBranch={nav.setManagingBranchId}
          onLaunchBranch={async (seed) => {
            try {
              const result = await api.selectSeed(clip.id, { seed });
              nav.refetchBranches();
              iters.refetchSeeds();
              nav.drillIntoBranch(result.iteration?.branch_id || null);
            } catch (err) {
              alert(`Launch failed: ${err.message}`);
            }
          }}
          onNavigateToAnalytics={onNavigateToAnalytics}
        />
      )}

      {/* Seed generation flow (modal-like, replaces HQ temporarily) */}
      {showSeedGen && (
        <SeedScreening
          clip={clip}
          onSeedSelected={() => {
            setShowSeedGen(false);
            iters.refetch();
            nav.refetchBranches();
            iters.refetchSeeds();
          }}
          onBack={() => setShowSeedGen(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════
         BRANCH DETAIL — drilled into a specific branch
         ═══════════════════════════════════════════════════ */}
      {nav.drillBranchId && (
        <button
          onClick={() => guardNavigation(() => { nav.setDrillBranchId(null); iters.setSelectedIteration(null); })}
          className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
        >
          &larr; Back to Seed HQ
        </button>
      )}

      {/* Branch pill bar — shown when inside a branch */}
      {nav.drillBranchId && nav.branches && nav.branches.length > 0 && (
        <BranchPillBar
          branches={nav.branches}
          selectedBranchId={nav.selectedBranchId}
          onSelect={(id) => {
            nav.drillIntoBranch(id);
            iters.setSelectedIteration(null);
          }}
          onManage={nav.setManagingBranchId}
        />
      )}

      {/* Iterations — shown when drilled into a branch */}
      {nav.drillBranchId && (
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Iteration History</h3>
              <div className="flex border border-gray-700 rounded overflow-hidden">
                <button
                  onClick={() => view.setViewMode('lineage')}
                  className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                    view.viewMode === 'lineage' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Lineage
                </button>
                <button
                  onClick={() => view.setViewMode('table')}
                  className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                    view.viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Table
                </button>
              </div>
              <button
                onClick={() => view.setShowComparison(true)}
                className="px-2 py-0.5 text-xs font-mono border border-gray-700 rounded text-gray-500 hover:text-accent hover:border-accent/30 transition-colors"
              >
                Compare
              </button>
              {nav.branches && nav.branches.length > 1 && (
                <button
                  onClick={() => nav.setShowAnalytics(true)}
                  className="px-2 py-0.5 text-xs font-mono border border-gray-700 rounded text-gray-500 hover:text-purple-400 hover:border-purple-400/30 transition-colors"
                >
                  Analytics
                </button>
              )}
            </div>
            {iters.loading ? (
              <p className="text-gray-500 text-xs font-mono">Loading...</p>
            ) : view.viewMode === 'table' ? (
              <div className="space-y-2">
                <IterationFilter filters={view.filters} onChange={view.setFilters} ropes={ROPES} />
                {iters.iterations && view.filteredIterations.length !== iters.iterations.length && (
                  <p className="text-xs font-mono text-gray-500">
                    Showing {view.filteredIterations.length} of {iters.iterations.length} iterations
                  </p>
                )}
                <IterationTable
                  iterations={view.filteredIterations}
                  selectedId={iters.selectedIteration?.id}
                  onSelect={(iter) => guardNavigation(() => iters.setSelectedIteration(iter))}
                  comparedIds={view.comparedIds}
                  onComparedChange={view.setComparedIds}
                  onCompareSelected={(ids) => {
                    view.setComparisonPreselect(ids);
                    view.setShowComparison(true);
                  }}
                />
              </div>
            ) : (
              <IterationLineage
                iterations={iters.iterations || []}
                selectedId={iters.selectedIteration?.id}
                onSelect={(iter) => guardNavigation(() => iters.setSelectedIteration(iter))}
                forkPoints={new Set((nav.branches || []).filter(b => b.source_iteration_id).map(b => b.source_iteration_id))}
                showBranchId={nav.selectedBranchId === null}
              />
            )}
          </div>
          {iters.selectedIteration && (() => {
            const savedScore = iters.selectedIteration.evaluation?.scores?.grand_total;
            const hasBeenScored = savedScore !== undefined || (iters.liveScore !== null && iters.liveScore !== 45);
            const displayScore = iters.liveScore ?? savedScore ?? 0;
            return (
              <div className="shrink-0 flex flex-col items-center">
                <ScoreRing
                  score={hasBeenScored ? displayScore : 0}
                  max={GRAND_MAX}
                  threshold={SCORE_LOCK_THRESHOLD}
                />
                {!hasBeenScored && (
                  <span className="text-xs font-mono text-gray-600 mt-1">Not scored</span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Evaluation panel for the selected iteration */}
      {nav.drillBranchId && iters.selectedIteration && iters.fullSelectedIteration && (
        <EvaluationPanel
          iteration={iters.fullSelectedIteration}
          childIteration={iters.childIteration}
          parentIteration={iters.parentIteration}
          ancestorChain={iters.ancestorChain}
          allIterations={iters.iterations || []}
          onSaved={() => { iters.refetch(); nav.refetchBranches(); }}
          onLocked={() => { iters.refetch(); nav.refetchBranches(); }}
          onGoToIteration={(iter) => iters.setSelectedIteration(iter)}
          onScoreChange={iters.setLiveScore}
          onUnsavedScoresChange={iters.setHasUnsavedScores}
          clipId={clip.id}
          clip={clip}
          isForkPoint={!!(nav.branches || []).find(b => b.source_iteration_id === iters.selectedIteration?.id)}
          onForked={(result) => {
            iters.refetch();
            nav.refetchBranches();
            nav.setSelectedBranchId(result.branch.id);
            iters.setSelectedIteration(result.iteration);
          }}
        />
      )}

      {/* Comparison modal */}
      {view.showComparison && iters.iterations && (
        <ComparisonView
          iterations={iters.iterations}
          preselect={view.comparisonPreselect}
          onClose={() => {
            view.setShowComparison(false);
            view.setComparisonPreselect(null);
          }}
        />
      )}

      {/* Branch analytics modal */}
      {nav.showAnalytics && (
        <BranchAnalytics
          clip={clip}
          onClose={() => nav.setShowAnalytics(false)}
          onFork={(result) => {
            nav.setShowAnalytics(false);
            iters.refetch();
            nav.refetchBranches();
            nav.setSelectedBranchId(result.branch.id);
            iters.setSelectedIteration(result.iteration);
          }}
        />
      )}

      {/* Branch management modal */}
      {nav.managingBranchId && (
        <BranchManageMenu
          clipId={clip.id}
          branchId={nav.managingBranchId}
          onClose={() => nav.setManagingBranchId(null)}
          onUpdated={() => {
            nav.refetchBranches();
            iters.refetch();
            nav.setManagingBranchId(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm --prefix frontend run build
```

Expected: clean build, no errors. If there are import errors, check that all 4 hooks were created in Tasks 1–4 at `frontend/src/hooks/`.

- [ ] **Step 3: Manual smoke test**

Start the dev server and verify each behaviour works identically to before:

- [ ] Open a clip → header renders (name, status badge, location, characters)
- [ ] Click clip name → rename editor appears → type new name → Enter saves → name updates in EpisodeTracker list (this was previously broken — confirm it now works)
- [ ] Click "Add creative brief..." → textarea appears → save persists goal text
- [ ] Edit saved goal → save → updates inline
- [ ] Navigate to SeedHQ → enter a branch → BranchPillBar appears
- [ ] Switch branches via pill bar → iterations reset and reload
- [ ] Select iteration → score ring + EvaluationPanel appears
- [ ] Toggle Lineage / Table view → filter controls appear in Table mode
- [ ] Click Compare → comparison modal opens
- [ ] Click Analytics (if 2+ branches) → analytics modal opens
- [ ] Click branch manage button → manage menu opens
- [ ] Navigate away with unsaved Vision API scores → guard dialog fires
- [ ] Back to Seed HQ button → SeedHQ renders again

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/clips/ClipDetail.jsx
git commit -m "refactor(clip): decompose ClipDetail god component — 529 → ~130 lines via custom hooks + ClipHeader"
```

**Stop. Notify orchestrator for final review.**

---

## Completion Checklist

- [ ] `frontend/src/hooks/useClipMeta.js` created
- [ ] `frontend/src/hooks/useBranchNav.js` created
- [ ] `frontend/src/hooks/useIterationState.js` created
- [ ] `frontend/src/hooks/useViewFilter.js` created
- [ ] `frontend/src/components/clips/ClipHeader.jsx` created
- [ ] `frontend/src/components/clips/ClipDetail.jsx` replaced (529 → ~130 lines)
- [ ] `npm --prefix frontend run build` passes cleanly
- [ ] Clip rename now invalidates `['clips']` cache instead of mutating prop directly
- [ ] All existing child components receive identical prop shapes — no child files modified

## Out of Scope

- Adding `memo`/`useCallback` performance optimisations
- Changing any child component's prop interface
- Frontend unit test infrastructure
- `last_viewed_at` branch patch-on-open (deferred to onboarding)
