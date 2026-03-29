import { useRenderStatus } from '../../hooks/useQueries';

/**
 * RenderStatus — compact sidebar widget showing Wan2GP connection and render queue.
 * Uses TanStack Query — 10s when active, 60s when idle. No manual polling.
 */
export default function RenderStatus() {
  const { data: status, isError } = useRenderStatus();

  // Offline state
  if (isError || !status) {
    return (
      <div className="px-3 py-2 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
          <span className="w-2 h-2 rounded-full bg-score-low flex-shrink-0" />
          <span>Wan2GP: Offline</span>
        </div>
      </div>
    );
  }

  const { available, queue, renders } = status;

  if (!available) {
    return (
      <div className="px-3 py-2 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
          <span className="w-2 h-2 rounded-full bg-score-low flex-shrink-0" />
          <span>Wan2GP: Offline</span>
        </div>
      </div>
    );
  }

  const activeRenders = renders?.filter(r => r.status === 'rendering') || [];
  if (activeRenders.length > 0) {
    const current = activeRenders[0];
    const jobName = current.filename
      ? (current.filename.length > 20 ? current.filename.slice(0, 20) + '...' : current.filename)
      : 'Rendering';

    return (
      <div className="px-3 py-2 border-t border-gray-700 space-y-1">
        <div className="flex items-center gap-2 text-xs font-mono text-score-high">
          <span className="w-2 h-2 rounded-full bg-score-high flex-shrink-0" />
          <span>Wan2GP: Connected</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <span className="truncate" title={current.filename}>{jobName}</span>
        </div>
        {queue.total > 1 && (
          <div className="text-xs font-mono text-gray-600 pl-4">
            {activeRenders.length} of {queue.total} in queue
          </div>
        )}
      </div>
    );
  }

  const completedRenders = renders?.filter(r => r.status === 'complete') || [];
  if (completedRenders.length > 0) {
    const last = completedRenders[0];
    const ago = Math.round((Date.now() - new Date(last.completedAt).getTime()) / 1000);
    const agoStr = ago < 60 ? `${ago}s ago`
      : ago < 3600 ? `${Math.round(ago / 60)}m ago`
      : `${Math.round(ago / 3600)}h ago`;

    return (
      <div className="px-3 py-2 border-t border-gray-700 space-y-1">
        <div className="flex items-center gap-2 text-xs font-mono text-score-high">
          <span className="w-2 h-2 rounded-full bg-score-high flex-shrink-0" />
          <span>Wan2GP: Connected</span>
        </div>
        <div className="text-xs font-mono text-gray-600 pl-4">
          Last render: {agoStr}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-gray-700">
      <div className="flex items-center gap-2 text-xs font-mono text-score-high">
        <span className="w-2 h-2 rounded-full bg-score-high flex-shrink-0" />
        <span>Wan2GP: Connected</span>
      </div>
    </div>
  );
}
