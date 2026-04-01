import { api } from '../../api';
import CopyButton from '../common/CopyButton';

const PHASE_LABELS = {
  loading_model: 'Loading model...',
  loading_lora: 'Loading LoRA...',
  task_ready: 'Task ready',
  denoising: 'Denoising',
  vae_decoding: 'VAE Decoding',
  video_saved: 'Video saved',
};

function getPhaseLabel(p) {
  if (!p?.phase) return null;
  if (p.phase === 'denoise_phase') return `Phase ${p.currentPhase}/${p.totalPhases} — ${p.phaseLabel}`;
  return PHASE_LABELS[p.phase] || p.phase;
}

function clipLabel(iteration) {
  return iteration.json_filename?.replace('.json', '') || `Iteration #${iteration.iteration_number}`;
}

function queuePayload(iteration, priority) {
  return {
    json_path: iteration.json_path,
    clip_name: clipLabel(iteration),
    iteration_id: iteration.id,
    seed: iteration.seed_used || null,
    source: 'iteration',
    ...(priority !== undefined && { priority }),
  };
}

/**
 * RenderStatusPanel — shows render/queue status for a pending iteration.
 * Handles checking, complete, queued, rendering, failed, and ready-to-render states.
 */
export default function RenderStatusPanel({ iteration, renderStatus, setRenderStatus, renderProgress, queueAdded, setQueueAdded, iterQueueStatus }) {
  const queueState = queueAdded;

  if (renderStatus === 'checking') {
    return (
      <div className="mt-2 border border-gray-600 bg-surface-overlay rounded px-3 py-2">
        <span className="text-xs font-mono text-gray-400 animate-pulse">Checking render status...</span>
      </div>
    );
  }

  if (renderStatus === 'complete' || queueState === 'complete') {
    return (
      <div className="mt-2 border border-green-500/30 bg-green-500/5 rounded px-3 py-2">
        <span className="text-xs font-mono text-green-400 font-bold">Render complete</span>
      </div>
    );
  }

  if (queueState === 'queued') {
    const queuePosition = iterQueueStatus?.position;
    return (
      <div className="mt-2 border border-accent/30 bg-accent/5 rounded px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-accent font-bold">
            In queue{queuePosition != null ? ` — position ${queuePosition}` : ' — waiting to render'}
          </span>
          <button
            onClick={async () => {
              try {
                const qs = await api.getIterationQueueStatus(iteration.id);
                if (qs.in_queue && qs.id) {
                  await api.removeFromQueue(qs.id);
                  setQueueAdded(false);
                }
              } catch (err) { alert(`Remove failed: ${err.message}`); }
            }}
            className="px-2 py-0.5 text-xs font-mono text-gray-500 hover:text-red-400 border border-gray-600 hover:border-red-400/50 rounded transition-colors"
          >
            Remove from queue
          </button>
        </div>
      </div>
    );
  }

  if (queueState === 'rendering' || renderStatus === 'rendering') {
    const p = renderProgress;
    const phaseLabel = getPhaseLabel(p);
    return (
      <div className="mt-2 border border-blue-500/30 bg-blue-500/5 rounded px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-blue-400 font-bold animate-pulse">Rendering...</span>
          {phaseLabel && <span className="text-xs font-mono text-blue-400/60">{phaseLabel}</span>}
        </div>
        {p?.percent != null && (
          <>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-blue-400 h-2 rounded-full transition-all duration-500" style={{ width: `${p.percent}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-300">
                <span className="text-blue-400 font-bold">{p.percent}%</span>
                {p.step && p.totalSteps && <> — Step {p.step}/{p.totalSteps}</>}
              </span>
              {p.secsPerStep && (
                <span className="text-xs font-mono text-gray-400">
                  <span className="text-green-400 font-bold">{p.secsPerStep.toFixed(1)}s/step</span>
                  {p.totalSteps && p.step && <> — <span className="text-accent">~{Math.round((p.totalSteps - p.step) * p.secsPerStep)}s left</span></>}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (queueState === 'failed' || renderStatus === 'failed') {
    return (
      <div className="mt-2 border border-red-500/30 bg-red-500/5 rounded px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-red-400 font-bold">Render failed</span>
          <button
            onClick={async () => {
              try {
                setRenderStatus('checking');
                const qs = await api.getIterationQueueStatus(iteration.id);
                if (qs.in_queue && qs.id && qs.status === 'failed') {
                  await api.retryQueueItem(qs.id);
                } else {
                  await api.updateIteration(iteration.id, { status: 'pending' });
                  await api.addToQueue(queuePayload(iteration, 0));
                  try { await api.startQueue(); } catch {}
                }
                setQueueAdded('queued');
                setRenderStatus(null);
              } catch (err) {
                setRenderStatus('failed');
                alert(`Retry failed: ${err.message}`);
              }
            }}
            className="px-3 py-1 text-xs font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
          >
            Retry Render
          </button>
        </div>
      </div>
    );
  }

  // Default: not queued, ready to render
  return (
    <div className="mt-2 border border-accent/30 bg-accent/5 rounded px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-accent font-bold">Ready to render</span>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                await api.addToQueue(queuePayload(iteration));
                setQueueAdded('queued');
              } catch (err) {
                alert(`Queue failed: ${err.message}`);
              }
            }}
            className="bg-surface-overlay text-gray-300 border border-gray-600 hover:border-accent hover:text-accent px-3 py-1 text-xs font-mono font-bold rounded transition-colors"
          >
            Add to Render Queue
          </button>
          <button
            onClick={async () => {
              try {
                setRenderStatus('submitting');
                await api.addToQueue(queuePayload(iteration, 0));
                try { await api.startQueue(); } catch {}
                setQueueAdded('queued');
                setRenderStatus(null);
              } catch (err) {
                setRenderStatus(null);
                alert(`Render failed: ${err.message}`);
              }
            }}
            disabled={renderStatus === 'submitting'}
            className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
              renderStatus === 'submitting'
                ? 'bg-accent/50 text-black/50 cursor-wait'
                : 'bg-accent text-black hover:bg-accent/90'
            }`}
          >
            {renderStatus === 'submitting' ? 'Submitting...' : 'Render Now'}
          </button>
          <CopyButton
            text={iteration.json_path}
            label="Copy JSON"
            title="Copy JSON path for manual rendering"
            className="px-3 py-1 text-xs font-mono bg-surface-overlay text-gray-400 hover:text-gray-200 rounded transition-colors"
          />
        </div>
      </div>
      <p className="text-xs font-mono text-gray-600 truncate" title={iteration.json_path}>{iteration.json_path}</p>
    </div>
  );
}
