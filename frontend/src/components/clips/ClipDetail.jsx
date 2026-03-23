import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';
import IterationLineage from './IterationLineage';
import IterationTable from './IterationTable';
import ScoreRing from '../evaluation/ScoreRing';
import EvaluationPanel from '../evaluation/EvaluationPanel';

export default function ClipDetail({ clip, onBack }) {
  const { data: iterations, loading, refetch } = useApi(() => api.getClipIterations(clip.id), [clip.id]);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const [liveScore, setLiveScore] = useState(null);
  const [viewMode, setViewMode] = useState('lineage'); // 'lineage' | 'table'
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

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
      </div>

      {/* Iteration lineage/table + score ring — persistent top bar */}
      <div className="flex items-center gap-4">
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
          </div>
          {loading ? (
            <p className="text-gray-500 text-xs font-mono">Loading...</p>
          ) : viewMode === 'table' ? (
            <IterationTable
              iterations={iterations || []}
              selectedId={selectedIteration?.id}
              onSelect={setSelectedIteration}
            />
          ) : (
            <IterationLineage
              iterations={iterations || []}
              selectedId={selectedIteration?.id}
              onSelect={setSelectedIteration}
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
      </div>

      {/* Evaluation panel for the selected iteration */}
      {selectedIteration && (
        <EvaluationPanel
          iteration={selectedIteration}
          childIteration={childIteration}
          parentIteration={parentIteration}
          ancestorChain={ancestorChain}
          onSaved={refetch}
          onLocked={refetch}
          onGoToIteration={(iter) => setSelectedIteration(iter)}
          onScoreChange={setLiveScore}
        />
      )}
    </div>
  );
}
