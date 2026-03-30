import { useState, useEffect } from 'react';
import { useClipIterations, useSeedScreens, useIteration } from './useQueries';

export function useIterationState(clipId, selectedBranchId, onUnsavedScoresChange) {
  const { data: iterations, isLoading: loading, refetch } = useClipIterations(clipId, selectedBranchId);
  const { data: seedScreens, refetch: refetchSeeds } = useSeedScreens(clipId);
  const [selectedIteration, setSelectedIteration] = useState(null);
  const { data: fullSelectedIteration } = useIteration(selectedIteration?.id);
  const [liveScore, setLiveScore] = useState(null);
  const [hasUnsavedScoresLocal, setHasUnsavedScoresLocal] = useState(false);

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
  }, [iterations, selectedIteration]);

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
    hasUnsavedScores: hasUnsavedScoresLocal,
    setHasUnsavedScores,
    childIteration,
    parentIteration,
    ancestorChain,
  };
}
