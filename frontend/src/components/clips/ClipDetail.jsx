import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';
import IterationLineage from './IterationLineage';
import ScoreRing from '../evaluation/ScoreRing';
import EvaluationPanel from '../evaluation/EvaluationPanel';

export default function ClipDetail({ clip, onBack }) {
  const { data: iterations, loading, refetch } = useApi(() => api.getClipIterations(clip.id), [clip.id]);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const [liveScore, setLiveScore] = useState(null);
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

      {/* Iteration lineage + score ring — persistent top bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Iteration History</h3>
          {loading ? (
            <p className="text-gray-500 text-xs font-mono">Loading...</p>
          ) : (
            <IterationLineage
              iterations={iterations || []}
              selectedId={selectedIteration?.id}
              onSelect={setSelectedIteration}
            />
          )}
        </div>
        {selectedIteration && (
          <div className="shrink-0">
            <ScoreRing
              score={liveScore ?? selectedIteration.evaluation?.scores?.grand_total ?? 0}
              max={GRAND_MAX}
              threshold={SCORE_LOCK_THRESHOLD}
            />
          </div>
        )}
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
