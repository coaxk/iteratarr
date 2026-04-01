import { useState, useEffect } from 'react';

/**
 * Manages video path state for the VideoDiff comparison panel.
 */
export function useEvalVideo(iteration, parentIteration) {
  const [currentVideoPath, setCurrentVideoPath] = useState(null);
  const [previousVideoPath, setPreviousVideoPath] = useState(null);
  const [comparisonVideoPath, setComparisonVideoPath] = useState(null);
  const [comparisonIter, setComparisonIter] = useState(null);

  useEffect(() => {
    setCurrentVideoPath(iteration.render_path || null);
    setPreviousVideoPath(parentIteration?.render_path || null);
    setComparisonVideoPath(null);
    setComparisonIter(null);
  }, [iteration.id]);

  return {
    currentVideoPath, setCurrentVideoPath,
    previousVideoPath, setPreviousVideoPath,
    comparisonVideoPath, setComparisonVideoPath,
    comparisonIter, setComparisonIter,
  };
}
