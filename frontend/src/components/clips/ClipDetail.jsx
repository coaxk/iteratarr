import { useState, useMemo, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../../constants';
import IterationLineage from './IterationLineage';
import IterationTable from './IterationTable';
import IterationFilter, { DEFAULT_FILTERS } from './IterationFilter';
import ComparisonView from './ComparisonView';
import ScoreRing from '../evaluation/ScoreRing';
import EvaluationPanel from '../evaluation/EvaluationPanel';
import SeedScreening from '../screening/SeedScreening';
import BranchPillBar from './BranchPillBar';
import BranchManageMenu from './BranchManageMenu';

export default function ClipDetail({ clip, onBack }) {
  // Branch state
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const { data: branches, refetch: refetchBranches } = useApi(() => api.listBranches(clip.id), [clip.id]);

  // Iterations — filtered by branch when one is selected
  const { data: iterations, loading, refetch } = useApi(
    () => api.getClipIterations(clip.id, selectedBranchId),
    [clip.id, selectedBranchId]
  );
  const [selectedIteration, setSelectedIteration] = useState(null);
  const [liveScore, setLiveScore] = useState(null);
  const [clipTab, setClipTab] = useState(clip.status === 'screening' ? 'screening' : 'iterations'); // 'screening' | 'iterations' | 'trends'
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
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  // Auto-select the most recently active branch when branches load
  useEffect(() => {
    if (branches?.length > 0 && selectedBranchId === null) {
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
          <h2 className="text-lg font-mono text-gray-200">{clip.name}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono ${status.color} text-black font-bold`}>
            {status.label}
          </span>
        </div>
        <div className="flex gap-4 text-xs font-mono text-gray-400">
          {clip.location && <span>Location: {clip.location}</span>}
          {clip.characters?.length > 0 && <span>Characters: {clip.characters.join(', ')}</span>}
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

      {/* Clip-level tab bar */}
      <div className="flex border-b border-gray-700">
        {['screening', 'iterations'].map(tab => (
          <button
            key={tab}
            onClick={() => setClipTab(tab)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
              clipTab === tab
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'screening' ? 'Seed Screening' : 'Iterations'}
          </button>
        ))}
      </div>

      {/* Seed Screening tab */}
      {clipTab === 'screening' && (
        <SeedScreening
          clip={clip}
          onSeedSelected={(iteration) => {
            setClipTab('iterations');
            refetch();
            refetchBranches();
          }}
          onBack={() => setClipTab('iterations')}
        />
      )}

      {/* Branch pill bar — shown on iterations tab when branches exist */}
      {clipTab === 'iterations' && branches && branches.length > 0 && (
        <BranchPillBar
          branches={branches}
          selectedBranchId={selectedBranchId}
          onSelect={setSelectedBranchId}
          onManage={setManagingBranchId}
        />
      )}

      {/* Iterations tab — lineage/table + score ring */}
      {clipTab === 'iterations' && <div className="flex items-center gap-4">
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
                onSelect={setSelectedIteration}
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
              onSelect={setSelectedIteration}
              forkPoints={new Set((branches || []).filter(b => b.source_iteration_id).map(b => b.source_iteration_id))}
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
      {clipTab === 'iterations' && selectedIteration && (
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
          clipId={clip.id}
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
