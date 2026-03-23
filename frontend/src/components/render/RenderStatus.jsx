import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';

/**
 * RenderStatus — compact sidebar widget showing Wan2GP connection and render queue.
 *
 * Polls /api/render/status:
 *   - Every 5s when renders are active
 *   - Every 30s when idle
 *
 * States:
 *   - Connected + active renders: job name, queue depth, pulsing amber dot
 *   - Connected + recent complete: "Last render: Xs ago"
 *   - Connected + idle: green dot "Wan2GP: Connected"
 *   - Offline: red dot "Wan2GP: Offline"
 */
export default function RenderStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const data = await api.getRenderStatus();
      setStatus(data);
      setError(false);
    } catch {
      setStatus(null);
      setError(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Adjust poll interval based on active renders
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = status?.queue?.active > 0 ? 5000 : 30000;
    pollRef.current = setInterval(fetchStatus, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.queue?.active]);

  // Offline state
  if (error || !status) {
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

  // Not available (API responded but Wan2GP process not detected)
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

  // Active renders
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

  // Idle — check for last completed render
  const completedRenders = renders?.filter(r => r.status === 'complete') || [];
  if (completedRenders.length > 0) {
    const last = completedRenders[0]; // Already sorted newest first
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

  // Connected, no renders
  return (
    <div className="px-3 py-2 border-t border-gray-700">
      <div className="flex items-center gap-2 text-xs font-mono text-score-high">
        <span className="w-2 h-2 rounded-full bg-score-high flex-shrink-0" />
        <span>Wan2GP: Connected</span>
      </div>
    </div>
  );
}
