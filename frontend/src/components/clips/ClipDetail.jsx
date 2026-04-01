import { useState, useCallback } from 'react';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPES } from '../../constants';
import { useClipMeta } from '../../hooks/useClipMeta';
import { useBranchNav } from '../../hooks/useBranchNav';
import { useIterationState } from '../../hooks/useIterationState';
import { useViewFilter } from '../../hooks/useViewFilter';
import { usePromptIntelligence } from '../../hooks/useQueries';
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
  const promptIntel = usePromptIntelligence(nav.selectedBranchId);
  const [showSeedGen, setShowSeedGen] = useState(false);

  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  const guardNavigation = useCallback((action) => {
    if (iters.hasUnsavedScores && !window.confirm('You have unsaved Vision API scores. Leave without saving?')) return;
    iters.setHasUnsavedScores(false);
    action();
  }, [iters.hasUnsavedScores, iters.setHasUnsavedScores]);

  const handleLaunchBranch = useCallback(async (seed) => {
    try {
      const result = await api.selectSeed(clip.id, { seed });
      nav.refetchBranches();
      iters.refetchSeeds();
      nav.drillIntoBranch(result.iteration?.branch_id || null);
    } catch (err) {
      alert(`Launch failed: ${err.message}`);
    }
  }, [clip.id, nav.refetchBranches, nav.drillIntoBranch, iters.refetchSeeds]);

  const handleSeedSelected = useCallback(() => {
    setShowSeedGen(false);
    iters.refetch();
    nav.refetchBranches();
    iters.refetchSeeds();
  }, [iters.refetch, nav.refetchBranches, iters.refetchSeeds]);

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
          onLaunchBranch={handleLaunchBranch}
          onNavigateToAnalytics={onNavigateToAnalytics}
        />
      )}

      {/* Seed generation flow (modal-like, replaces HQ temporarily) */}
      {showSeedGen && (
        <SeedScreening
          clip={clip}
          onSeedSelected={handleSeedSelected}
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
                  promptIntel={promptIntel.data}
                />
              </div>
            ) : (
              <IterationLineage
                iterations={iters.iterations || []}
                selectedId={iters.selectedIteration?.id}
                onSelect={(iter) => guardNavigation(() => iters.setSelectedIteration(iter))}
                forkPoints={new Set((nav.branches || []).filter(b => b.source_iteration_id).map(b => b.source_iteration_id))}
                showBranchId={nav.selectedBranchId === null}
                promptIntel={promptIntel.data}
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
