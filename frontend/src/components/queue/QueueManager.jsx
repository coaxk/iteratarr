import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api';

/**
 * QueueManager — full-page render queue management view.
 *
 * Features:
 * - List of queued items with clip name, seed, source, status badge, estimated time
 * - Up/down arrows to reorder items
 * - Remove button per item
 * - Start/Pause queue toggle
 * - Progress bar on active rendering item
 * - Completed items section at bottom
 * - Total estimated time remaining
 * - Clear completed button
 */

const STATUS_CONFIG = {
  queued: { bg: 'bg-gray-600', text: 'text-gray-300', label: 'Queued', dot: 'bg-gray-500' },
  rendering: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Rendering', dot: 'bg-amber-400 animate-pulse' },
  complete: { bg: 'bg-score-high/20', text: 'text-score-high', label: 'Complete', dot: 'bg-score-high' },
  failed: { bg: 'bg-score-low/20', text: 'text-score-low', label: 'Failed', dot: 'bg-score-low' }
};

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Thumbnail preview for completed renders — loads first frame from the iteration */
function CompletedThumbnail({ iterationId }) {
  const [frameSrc, setFrameSrc] = useState(null);
  useEffect(() => {
    if (!iterationId) return;
    api.listFrames(iterationId).then(data => {
      if (data.frames?.length > 0) {
        setFrameSrc(`/api/frames/${iterationId}/${data.frames[0]}`);
      }
    }).catch(() => {});
  }, [iterationId]);
  if (!frameSrc) return null;
  return (
    <img
      src={frameSrc}
      alt="Render preview"
      className="h-16 w-auto rounded border border-gray-700 shrink-0"
    />
  );
}

function QueueItemRow({ item, index, totalQueued, onMoveUp, onMoveDown, onRemove, isActive }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued;
  const duration = item.started_at && item.completed_at
    ? Math.round((new Date(item.completed_at) - new Date(item.started_at)) / 1000)
    : null;

  return (
    <div className={`border rounded p-3 space-y-2 transition-colors ${
      isActive ? 'border-amber-500/50 bg-amber-500/5' : 'border-gray-700 bg-surface'
    }`}>
      <div className="flex items-center gap-3">
        {/* Reorder arrows — only for queued items */}
        {item.status === 'queued' && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              onClick={() => onMoveUp(item.id)}
              disabled={index === 0}
              className="w-5 h-5 flex items-center justify-center rounded text-xs text-gray-500 hover:text-accent hover:bg-surface-overlay disabled:opacity-20 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
              title="Move up"
            >
              ^
            </button>
            <button
              onClick={() => onMoveDown(item.id)}
              disabled={index === totalQueued - 1}
              className="w-5 h-5 flex items-center justify-center rounded text-xs text-gray-500 hover:text-accent hover:bg-surface-overlay disabled:opacity-20 disabled:hover:text-gray-500 disabled:hover:bg-transparent transition-colors"
              title="Move down"
            >
              v
            </button>
          </div>
        )}

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Clip name + details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-200 font-bold truncate" title={item.clip_name}>
              {item.clip_name}
            </span>
            {item.seed && (
              <span className="text-xs font-mono text-gray-600 shrink-0">seed:{item.seed}</span>
            )}
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
            {item.source && item.source !== 'manual' && (
              <span className="text-xs font-mono text-gray-600 shrink-0">
                {item.source}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {item.seed && (
              <span className="text-xs font-mono text-gray-500">
                Seed: <span className="text-gray-400">{item.seed}</span>
              </span>
            )}
            {item.queued_at && (
              <span className="text-xs font-mono text-gray-600">
                Queued: {formatTime(item.queued_at)}
              </span>
            )}
            {duration && (
              <span className="text-xs font-mono text-gray-500">
                Duration: {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail preview for completed renders */}
        {item.status === 'complete' && item.iteration_id && (
          <CompletedThumbnail iterationId={item.iteration_id} />
        )}

        {/* Remove button — only for queued/complete/failed items */}
        {item.status !== 'rendering' && (
          <button
            onClick={() => onRemove(item.id)}
            className="px-2 py-1 text-xs font-mono text-gray-600 hover:text-score-low transition-colors shrink-0"
            title="Remove from queue"
          >
            Remove
          </button>
        )}
      </div>

      {/* Progress bar for rendering items */}
      {item.status === 'rendering' && (
        <div className="space-y-1">
          {/* Phase label */}
          {item.progress?.phase && (
            <span className="text-xs font-mono text-amber-400/80 uppercase tracking-wider">
              {item.progress.phase === 'loading_model' ? 'Loading model...' :
               item.progress.phase === 'loading_lora' ? 'Loading LoRA...' :
               item.progress.phase === 'task_ready' ? 'Task ready' :
               item.progress.phase === 'denoising' ? 'Denoising' :
               item.progress.phase === 'denoise_phase' ? `Phase ${item.progress.currentPhase}/${item.progress.totalPhases} — ${item.progress.phaseLabel}` :
               item.progress.phase === 'vae_decoding' ? 'VAE Decoding — generating frames' :
               item.progress.phase === 'video_saved' ? 'Video saved' :
               item.progress.phase}
            </span>
          )}
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-amber-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${item.progress?.percent || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-gray-300">
              <span className="text-amber-400 font-bold">{item.progress?.percent || 0}%</span>
              {item.progress?.step && item.progress?.totalSteps && (
                <> — Step {item.progress.step}/{item.progress.totalSteps}</>
              )}
            </span>
            {item.progress?.secsPerStep && (
              <span className="text-xs font-mono text-gray-400">
                <span className="text-green-400 font-bold">{item.progress.secsPerStep.toFixed(1)}s/step</span>
                {item.progress.totalSteps && item.progress.step && (
                  <> — <span className="text-accent">~{Math.round((item.progress.totalSteps - item.progress.step) * item.progress.secsPerStep)}s left</span></>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error message for failed items */}
      {item.status === 'failed' && item.error && (
        <div className="border border-score-low/30 bg-score-low/5 rounded px-2 py-1">
          <p className="text-xs font-mono text-score-low truncate" title={item.error}>{item.error}</p>
        </div>
      )}

      {/* JSON path — subtle, expandable */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-gray-700 truncate flex-1" title={item.json_path}>
          {item.json_path}
        </span>
        <button
          onClick={async () => { await navigator.clipboard.writeText(item.json_path); }}
          className="text-xs font-mono text-gray-700 hover:text-gray-400 shrink-0 transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export default function QueueManager() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [queueItems, queueStatus] = await Promise.all([
        api.listQueue(),
        api.getQueueStatus()
      ]);
      setItems(queueItems);
      setStatus(queueStatus);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Polling — 3s when rendering, 15s when idle
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = status?.running ? 3000 : 15000;
    pollRef.current = setInterval(fetchAll, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.running, fetchAll]);

  const showAction = (msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const [starting, setStarting] = useState(false);
  const handleStartPause = async () => {
    try {
      if (status?.running) {
        await api.pauseQueue();
        showAction('Queue paused');
      } else {
        setStarting(true);
        showAction('Starting queue — connecting to Wan2GP...');
        await api.startQueue();
        showAction('Queue started');
        setStarting(false);
      }
      await fetchAll();
    } catch (err) {
      setStarting(false);
      showAction(`Error: ${err.message}`);
    }
  };

  const handleRemove = async (id) => {
    try {
      await api.removeFromQueue(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      showAction(`Remove failed: ${err.message}`);
    }
  };

  const handleMoveUp = async (id) => {
    const queued = items.filter(i => i.status === 'queued');
    const idx = queued.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const newOrder = [...queued];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    try {
      await api.reorderQueue(newOrder.map(i => i.id));
      await fetchAll();
    } catch (err) {
      showAction(`Reorder failed: ${err.message}`);
    }
  };

  const handleMoveDown = async (id) => {
    const queued = items.filter(i => i.status === 'queued');
    const idx = queued.findIndex(i => i.id === id);
    if (idx < 0 || idx >= queued.length - 1) return;
    const newOrder = [...queued];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    try {
      await api.reorderQueue(newOrder.map(i => i.id));
      await fetchAll();
    } catch (err) {
      showAction(`Reorder failed: ${err.message}`);
    }
  };

  const handleClearCompleted = async () => {
    try {
      const result = await api.clearCompletedQueue();
      showAction(`Cleared ${result.cleared} items`);
      await fetchAll();
    } catch (err) {
      showAction(`Clear failed: ${err.message}`);
    }
  };

  // Separate items by category
  const renderingItems = items.filter(i => i.status === 'rendering');
  const queuedItems = items.filter(i => i.status === 'queued');
  const completedItems = items.filter(i => i.status === 'complete' || i.status === 'failed');

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Queue Manager</h2>
        <p className="text-gray-600 text-xs font-mono">Loading queue...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Queue Manager</h2>
          <p className="text-xs font-mono text-gray-600 mt-1">
            Build up render jobs throughout the day, curate priority, then batch overnight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {completedItems.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="px-3 py-1.5 text-xs font-mono text-gray-500 border border-gray-700 rounded hover:text-gray-300 hover:border-gray-600 transition-colors"
            >
              Clear Completed
            </button>
          )}
          <button
            onClick={handleStartPause}
            disabled={(queuedItems.length === 0 && !status?.running) || starting}
            className={`px-4 py-2 text-sm font-mono font-bold rounded transition-colors ${
              starting
                ? 'bg-accent/50 text-black/50 cursor-wait'
                : status?.running
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                  : 'bg-accent text-black hover:bg-accent/90 disabled:opacity-50'
            }`}
          >
            {starting ? 'Starting...' : status?.running ? 'Pause Queue' : 'Start Queue'}
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className="border border-accent/30 bg-accent/5 rounded px-3 py-2">
          <p className="text-xs font-mono text-accent">{actionMsg}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
          <p className="text-xs font-mono text-score-low">{error}</p>
        </div>
      )}

      {/* Status summary bar */}
      <div className="flex items-center gap-4 border border-gray-700 rounded px-4 py-3 bg-surface-raised">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status?.running ? 'bg-amber-400 animate-pulse' : status?.paused ? 'bg-amber-600' : 'bg-gray-600'}`} />
          <span className="text-xs font-mono text-gray-400">
            {status?.running ? 'Processing' : status?.paused ? 'Paused' : 'Idle'}
          </span>
        </div>
        <div className="h-3 w-px bg-gray-700" />
        <span className="text-xs font-mono text-gray-500">
          {queuedItems.length} queued
        </span>
        <span className="text-xs font-mono text-gray-500">
          {renderingItems.length} rendering
        </span>
        <span className="text-xs font-mono text-gray-500">
          {completedItems.filter(i => i.status === 'complete').length} complete
        </span>
        {completedItems.filter(i => i.status === 'failed').length > 0 && (
          <span className="text-xs font-mono text-score-low">
            {completedItems.filter(i => i.status === 'failed').length} failed
          </span>
        )}
        {status?.estimated_remaining_seconds > 0 && (
          <>
            <div className="h-3 w-px bg-gray-700" />
            <span className="text-xs font-mono text-gray-400">
              Est. remaining: {formatDuration(status.estimated_remaining_seconds)}
            </span>
          </>
        )}
      </div>

      {/* Active rendering item */}
      {renderingItems.length > 0 && (
        <div>
          <h3 className="text-xs font-mono text-amber-400 uppercase tracking-wider mb-2">Now Rendering</h3>
          {renderingItems.map(item => (
            <QueueItemRow
              key={item.id}
              item={item}
              index={0}
              totalQueued={0}
              onMoveUp={() => {}}
              onMoveDown={() => {}}
              onRemove={handleRemove}
              isActive={true}
            />
          ))}
        </div>
      )}

      {/* Queued items */}
      {queuedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
            Up Next ({queuedItems.length})
          </h3>
          <div className="space-y-2">
            {queuedItems.map((item, idx) => (
              <QueueItemRow
                key={item.id}
                item={item}
                index={idx}
                totalQueued={queuedItems.length}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemove}
                isActive={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-700 rounded-lg">
          <p className="text-gray-500 text-sm font-mono mb-2">No items in queue</p>
          <p className="text-gray-600 text-xs font-mono">
            Add renders from iteration panels or seed screening using the "Add to Queue" button.
          </p>
        </div>
      )}

      {/* Completed items */}
      {completedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-2">
            Completed ({completedItems.length})
          </h3>
          <div className="space-y-1.5">
            {completedItems.map(item => (
              <QueueItemRow
                key={item.id}
                item={item}
                index={0}
                totalQueued={0}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onRemove={handleRemove}
                isActive={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
