import { useState, useMemo, useEffect } from 'react';
import { useClipBranches, useClipIterations, useSeedScreens, useInvalidateIterations } from '../../hooks/useQueries';
import { api } from '../../api';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../../constants';
import IterationLineage from './IterationLineage';
import IterationTable from './IterationTable';
import IterationFilter, { DEFAULT_FILTERS } from './IterationFilter';
import ComparisonView from './ComparisonView';
import ScoreRing from '../evaluation/ScoreRing';
import EvaluationPanel from '../evaluation/EvaluationPanel';
import SeedScreening from '../screening/SeedScreening';
import SeedHQ from './SeedHQ';
import BranchPillBar from './BranchPillBar';
import BranchManageMenu from './BranchManageMenu';
import BranchAnalytics from '../analytics/BranchAnalytics';

export default function ClipDetail({ clip, onBack, onUnsavedScoresChange: parentUnsavedCallback }) {
  // Branch state
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const { data: branches, refetch: refetchBranches } = useClipBranches(clip.id);

  // Iterations — filtered by branch when one is selected
  const { data: iterations, isLoading: loading, refetch } = useClipIterations(clip.id, selectedBranchId);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const [liveScore, setLiveScore] = useState(null);
  // Seed HQ navigation: null = HQ overview, branchId = drill into branch
  const [drillBranchId, setDrillBranchId] = useState(null);
  const [showSeedGen, setShowSeedGen] = useState(false);
  const { data: seedScreens, refetch: refetchSeeds } = useSeedScreens(clip.id);
  const [viewMode, setViewMode] = useState('lineage'); // 'lineage' | 'table'
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [showComparison, setShowComparison] = useState(false);
  const [comparedIds, setComparedIds] = useState([]);
  const [comparisonPreselect, setComparisonPreselect] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(clip.goal || '');
  const [goalSaving, setGoalSaving] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(clip.goal || '');
  const [managingBranchId, setManagingBranchId] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [renamingClip, setRenamingClip] = useState(false);
  const [clipNameDraft, setClipNameDraft] = useState(clip.name);
  const [hasUnsavedScores, setHasUnsavedScoresLocal] = useState(false);
  const setHasUnsavedScores = (val) => {
    setHasUnsavedScoresLocal(val);
    parentUnsavedCallback?.(val);
  };

  const guardNavigation = (action) => {
    if (hasUnsavedScores && !window.confirm('You have unsaved Vision API scores. Leave without saving?')) return;
    setHasUnsavedScores(false);
    action();
  };
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  // When drilling into a branch, sync selectedBranchId
  useEffect(() => {
    if (drillBranchId) {
      setSelectedBranchId(drillBranchId);
    }
  }, [drillBranchId]);

  // Auto-select the most recently active branch when branches load (only when already in branch view)
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

  // Compute category totals for a single iteration
  const sumFields = (scoreGroup, fields) => {
    if (!scoreGroup) return null;
    return fields.reduce((s, f) => s + (scoreGroup[f.key] || 0), 0);
  };

  // Filter iterations when in table view
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

      // Exclude unevaluated when any score filter is active
      if (isUnevaluated && hasAnyScoreFilter) return false;

      // Score range
      if (filters.scoreMin !== null && (isUnevaluated || (scores.grand_total ?? 0) < filters.scoreMin)) return false;
      if (filters.scoreMax !== null && (isUnevaluated || (scores.grand_total ?? 0) > filters.scoreMax)) return false;

      // Category minimums
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

      // Rope
      if (filters.rope !== null) {
        if ((ev?.attribution?.rope || null) !== filters.rope) return false;
      }

      // Source
      if (filters.source !== null) {
        if ((ev?.scoring_source || null) !== filters.source) return false;
      }

      // Tag
      if (filters.tag !== null) {
        const tags = iter.tags || [];
        if (!tags.some(t => t.toLowerCase().includes(filters.tag.toLowerCase()))) return false;
      }

      return true;
    });
  }, [iterations, filters, hasAnyScoreFilter]);

  // Find the child iteration (the one whose parent_iteration_id matches the selected)
  const childIteration = selectedIteration && iterations
    ? iterations.find(i => i.parent_iteration_id === selectedIteration.id)
    : null;

  // Find the parent iteration (the one this iteration was derived from)
  const parentIteration = selectedIteration?.parent_iteration_id && iterations
    ? iterations.find(i => i.id === selectedIteration.parent_iteration_id)
    : null;

  // Build ancestor chain for ghost markers — walk up parent_iteration_id, max 3 + baseline
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

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="text-xs font-mono text-gray-500 hover:text-accent transition-colors">
        &larr; Back to Episode Tracker
      </button>

      {/* Clip info header */}
      <div className="border border-gray-700 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          {renamingClip ? (
            <div className="flex items-center gap-2">
              <input
                value={clipNameDraft}
                onChange={(e) => setClipNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    api.updateClip(clip.id, { name: clipNameDraft }).then(() => { clip.name = clipNameDraft; setRenamingClip(false); }).catch(() => {});
                  }
                  if (e.key === 'Escape') setRenamingClip(false);
                }}
                autoFocus
                className="bg-surface border border-gray-600 rounded px-2 py-1 text-lg font-mono text-gray-200"
              />
              <button onClick={() => { api.updateClip(clip.id, { name: clipNameDraft }).then(() => { clip.name = clipNameDraft; setRenamingClip(false); }).catch(() => {}); }}
                className="px-2 py-1 bg-accent text-black text-xs font-mono font-bold rounded">Save</button>
              <button onClick={() => setRenamingClip(false)} className="text-xs font-mono text-gray-500">Cancel</button>
            </div>
          ) : (
            <h2 className="text-lg font-mono text-gray-200 cursor-pointer hover:text-accent transition-colors" onClick={() => setRenamingClip(true)} title="Click to rename">
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
              Characters: {clip.characters.map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs font-mono">{c}</span>
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
                onClick={() => setEditingGoal(true)}
                className="shrink-0 text-xs font-mono text-gray-500 hover:text-accent transition-colors"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingGoal(true)}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors italic"
            >
              Add creative brief...
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
         SEED HQ — the tree view (when not drilled into a branch)
         ═══════════════════════════════════════════════════ */}
      {!drillBranchId && !showSeedGen && (
        <SeedHQ
          clip={clip}
          branches={branches}
          seedScreens={seedScreens}
          onEnterBranch={(branchId) => {
            setDrillBranchId(branchId);
            setSelectedBranchId(branchId);
            setSelectedIteration(null);
          }}
          onGenerateSeeds={() => setShowSeedGen(true)}
          onRefresh={() => { refetchBranches(); refetchSeeds(); }}
          onManageBranch={setManagingBranchId}
          onLaunchBranch={async (seed) => {
            try {
              const result = await api.selectSeed(clip.id, { seed });
              refetchBranches();
              refetchSeeds();
              setDrillBranchId(result.iteration?.branch_id || null);
            } catch (err) {
              alert(`Launch failed: ${err.message}`);
            }
          }}
        />
      )}

      {/* Seed generation flow (modal-like, replaces HQ temporarily) */}
      {showSeedGen && (
        <SeedScreening
          clip={clip}
          onSeedSelected={(iteration) => {
            setShowSeedGen(false);
            refetch();
            refetchBranches();
            refetchSeeds();
          }}
          onBack={() => setShowSeedGen(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════
         BRANCH DETAIL — drilled into a specific branch
         ═══════════════════════════════════════════════════ */}
      {drillBranchId && (
        <button
          onClick={() => guardNavigation(() => { setDrillBranchId(null); setSelectedIteration(null); })}
          className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
        >
          &larr; Back to Seed HQ
        </button>
      )}

      {/* Branch pill bar — shown when inside a branch (for switching between branches) */}
      {drillBranchId && branches && branches.length > 0 && (
        <BranchPillBar
          branches={branches}
          selectedBranchId={selectedBranchId}
          onSelect={(id) => {
            setDrillBranchId(id);
            setSelectedBranchId(id);
            setSelectedIteration(null);
          }}
          onManage={setManagingBranchId}
        />
      )}

      {/* Iterations — shown when drilled into a branch */}
      {drillBranchId && <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Iteration History</h3>
            <div className="flex border border-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('lineage')}
                className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                  viewMode === 'lineage'
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Lineage
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 text-xs font-mono transition-colors ${
                  viewMode === 'table'
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Table
              </button>
            </div>
            <button
              onClick={() => setShowComparison(true)}
              className="px-2 py-0.5 text-xs font-mono border border-gray-700 rounded text-gray-500 hover:text-accent hover:border-accent/30 transition-colors"
            >
              Compare
            </button>
            {branches && branches.length > 1 && (
              <button
                onClick={() => setShowAnalytics(true)}
                className="px-2 py-0.5 text-xs font-mono border border-gray-700 rounded text-gray-500 hover:text-purple-400 hover:border-purple-400/30 transition-colors"
              >
                Analytics
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-gray-500 text-xs font-mono">Loading...</p>
          ) : viewMode === 'table' ? (
            <div className="space-y-2">
              <IterationFilter filters={filters} onChange={setFilters} ropes={ROPES} />
              {iterations && filteredIterations.length !== iterations.length && (
                <p className="text-xs font-mono text-gray-500">
                  Showing {filteredIterations.length} of {iterations.length} iterations
                </p>
              )}
              <IterationTable
                iterations={filteredIterations}
                selectedId={selectedIteration?.id}
                onSelect={(iter) => guardNavigation(() => setSelectedIteration(iter))}
                comparedIds={comparedIds}
                onComparedChange={setComparedIds}
                onCompareSelected={(ids) => {
                  setComparisonPreselect(ids);
                  setShowComparison(true);
                }}
              />
            </div>
          ) : (
            <IterationLineage
              iterations={iterations || []}
              selectedId={selectedIteration?.id}
              onSelect={(iter) => guardNavigation(() => setSelectedIteration(iter))}
              forkPoints={new Set((branches || []).filter(b => b.source_iteration_id).map(b => b.source_iteration_id))}
              showBranchId={selectedBranchId === null}
            />
          )}
        </div>
        {selectedIteration && (() => {
          const savedScore = selectedIteration.evaluation?.scores?.grand_total;
          const hasBeenScored = savedScore !== undefined || (liveScore !== null && liveScore !== 45);
          const displayScore = liveScore ?? savedScore ?? 0;
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
      </div>}

      {/* Evaluation panel for the selected iteration */}
      {drillBranchId && selectedIteration && (
        <EvaluationPanel
          iteration={selectedIteration}
          childIteration={childIteration}
          parentIteration={parentIteration}
          ancestorChain={ancestorChain}
          allIterations={iterations || []}
          onSaved={() => { refetch(); refetchBranches(); }}
          onLocked={() => { refetch(); refetchBranches(); }}
          onGoToIteration={(iter) => setSelectedIteration(iter)}
          onScoreChange={setLiveScore}
          onUnsavedScoresChange={setHasUnsavedScores}
          clipId={clip.id}
          clip={clip}
          isForkPoint={!!(branches || []).find(b => b.source_iteration_id === selectedIteration?.id)}
          onForked={(result) => {
            refetch();
            refetchBranches();
            // Auto-switch to the new branch
            setSelectedBranchId(result.branch.id);
            setSelectedIteration(result.iteration);
          }}
        />
      )}

      {/* Comparison modal */}
      {showComparison && iterations && (
        <ComparisonView
          iterations={iterations}
          preselect={comparisonPreselect}
          onClose={() => {
            setShowComparison(false);
            setComparisonPreselect(null);
          }}
        />
      )}

      {/* Branch analytics modal */}
      {showAnalytics && (
        <BranchAnalytics
          clip={clip}
          onClose={() => setShowAnalytics(false)}
          onFork={(result) => {
            setShowAnalytics(false);
            refetch();
            refetchBranches();
            setSelectedBranchId(result.branch.id);
            setSelectedIteration(result.iteration);
          }}
        />
      )}

      {/* Branch management modal */}
      {managingBranchId && (
        <BranchManageMenu
          clipId={clip.id}
          branchId={managingBranchId}
          onClose={() => setManagingBranchId(null)}
          onUpdated={() => {
            refetchBranches();
            refetch();
            setManagingBranchId(null);
          }}
        />
      )}
    </div>
  );
}
