import { useState, useEffect } from 'react';
import { useIterationQueueStatus, useRenderStatus } from './useQueries';
import { api } from '../api';

/**
 * Manages render/queue status tracking for a pending iteration.
 */
export function useEvalRender(iteration) {
  const [renderSubmitted, setRenderSubmitted] = useState(false);
  const [renderProgress, setRenderProgress] = useState(null);
  const [renderStatus, setRenderStatus] = useState(null);
  const [queueAdded, setQueueAdded] = useState(false);

  const isPending = iteration.status === 'pending' || iteration.status === 'failed';

  const { data: iterQueueStatus } = useIterationQueueStatus(isPending ? iteration.id : null, {
    refetchInterval: isPending ? (renderStatus === 'rendering' || queueAdded === 'rendering' ? 10000 : queueAdded === 'queued' ? 30000 : false) : false
  });
  const { data: renderStatusData } = useRenderStatus();

  // Reset on iteration change
  useEffect(() => {
    setRenderSubmitted(false);
    setQueueAdded(false);
    setRenderStatus(null);
    setRenderProgress(null);

    // One-time HEAD check for existing video
    if (isPending && iteration.render_path) {
      fetch(`/api/video?path=${encodeURIComponent(iteration.render_path)}`, { method: 'HEAD' })
        .then(r => { if (r.ok) { setRenderStatus('complete'); api.updateIteration(iteration.id, { status: 'rendered' }).catch(() => {}); } })
        .catch(() => {});
    }
  }, [iteration.id]);

  // Sync render/queue status from TanStack Query data
  useEffect(() => {
    if (!isPending || renderStatus === 'complete') return;
    if (iterQueueStatus?.in_queue) {
      setQueueAdded(iterQueueStatus.status);
      if (iterQueueStatus.status === 'rendering') {
        setRenderStatus('rendering');
        setRenderProgress(iterQueueStatus.progress || null);
      }
    } else if (renderStatusData?.renders) {
      const normalize = p => p?.replace(/\\/g, '/');
      const myRenders = renderStatusData.renders.filter(r =>
        r.json_path && iteration.json_path && normalize(r.json_path) === normalize(iteration.json_path)
      );
      const active = myRenders.find(r => r.status === 'rendering');
      const complete = myRenders.find(r => r.status === 'complete');
      if (active) { setRenderStatus('rendering'); setRenderProgress(active.progress || null); }
      else if (complete) { setRenderStatus('complete'); setRenderProgress(null); }
    }
  }, [iterQueueStatus, renderStatusData]);

  return {
    isPending,
    renderSubmitted, setRenderSubmitted,
    renderProgress, setRenderProgress,
    renderStatus, setRenderStatus,
    queueAdded, setQueueAdded,
    iterQueueStatus,
  };
}
