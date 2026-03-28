import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { getAutoRender } from '../../hooks/useAutoRender';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy}
      className={`px-2 py-0.5 rounded text-xs font-mono flex-shrink-0 ${
        copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
      }`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function GeneratedModal({ jsonPath, renderPath, iterationNumber, clipName, iterationId, seed, onClose, onGoToIteration }) {
  const [wan2gpAvailable, setWan2gpAvailable] = useState(false);
  const [renderSubmitted, setRenderSubmitted] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [queueAdded, setQueueAdded] = useState(false);
  const autoSubmitAttempted = useRef(false);

  // Check Wan2GP availability on mount
  useEffect(() => {
    api.getRenderStatus()
      .then(status => setWan2gpAvailable(status.available))
      .catch(() => setWan2gpAvailable(false));
  }, []);

  // Auto-submit render when auto-render is enabled and Wan2GP is available
  useEffect(() => {
    if (!wan2gpAvailable || !jsonPath || autoSubmitAttempted.current || renderSubmitted) return;
    if (!getAutoRender()) return;

    autoSubmitAttempted.current = true;
    setAutoSubmitting(true);

    api.submitRender(jsonPath)
      .then(() => {
        setRenderSubmitted(true);
        setRenderError(null);
      })
      .catch((err) => {
        setRenderError(`Auto-render failed: ${err.message}`);
      })
      .finally(() => {
        setAutoSubmitting(false);
      });
  }, [wan2gpAvailable, jsonPath, renderSubmitted]);

  const [submitting, setSubmitting] = useState(false);

  const handleRender = async () => {
    try {
      setSubmitting(true);
      // Route through queue at priority 0 + auto-start
      await api.addToQueue({
        json_path: jsonPath,
        clip_name: clipName || `Iteration #${iterationNumber}`,
        iteration_id: iterationId || null,
        seed: seed || null,
        source: 'iteration',
        priority: 0
      });
      try { await api.startQueue(); } catch {}
      setRenderSubmitted(true);
      setRenderError(null);
    } catch (err) {
      setRenderError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToQueue = async () => {
    try {
      setSubmitting(true);
      await api.addToQueue({
        json_path: jsonPath,
        clip_name: clipName || `Iteration #${iterationNumber}`,
        iteration_id: iterationId || null,
        seed: seed || null,
        source: 'iteration'
      });
      setQueueAdded(true);
      setRenderError(null);
    } catch (err) {
      setRenderError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-raised border border-gray-700 rounded-lg w-[550px] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-score-high font-bold">Iteration #{iterationNumber} Generated</h3>
          {/* Auto-render status indicator */}
          {autoSubmitting && (
            <p className="text-xs font-mono text-accent mt-1 animate-pulse">Auto-submitting to Wan2GP render queue...</p>
          )}
          {renderSubmitted && getAutoRender() && (
            <p className="text-xs font-mono text-score-high mt-1">Auto-submitted to render queue</p>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* JSON path */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Iteration JSON saved to:</label>
            <div className="flex items-center gap-2 bg-surface rounded border border-gray-600 px-2 py-1.5">
              <span className="text-xs font-mono text-gray-300 break-all flex-1 select-all">{jsonPath}</span>
              <CopyButton text={jsonPath} />
            </div>
            <p className="text-xs font-mono text-gray-600 mt-1">Load this file in Wan2GP to render.</p>
          </div>

          {/* Render output path */}
          {renderPath && (
            <div>
              <label className="text-xs font-mono text-accent block mb-1">Your render will save to:</label>
              <div className="flex items-center gap-2 bg-surface rounded border border-accent/30 px-2 py-1.5">
                <span className="text-xs font-mono text-accent break-all flex-1 select-all">{renderPath}</span>
                <CopyButton text={renderPath} />
              </div>
              <p className="text-xs font-mono text-gray-600 mt-1">Wan2GP will output here automatically. Iteratarr will find it.</p>
            </div>
          )}

          {/* Render error */}
          {renderError && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{renderError}</p>
            </div>
          )}
        </div>

        {/* Post-action guidance */}
        {(renderSubmitted || queueAdded) && onGoToIteration && (
          <div className="px-4 py-2 border-t border-green-500/20 bg-green-500/5">
            <p className="text-xs font-mono text-green-400">
              {renderSubmitted ? 'Render queued and starting.' : 'Added to queue.'} Go to Iteration #{iterationNumber} to track progress.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          {/* Add to Queue */}
          {jsonPath && !renderSubmitted && (
            <button
              onClick={handleAddToQueue}
              disabled={queueAdded || submitting}
              className={`px-4 py-2 text-sm font-mono font-bold rounded transition-colors ${
                queueAdded
                  ? 'bg-accent/20 text-accent'
                  : submitting
                    ? 'bg-surface-overlay text-gray-500 cursor-wait'
                    : 'bg-surface-overlay text-gray-300 border border-gray-600 hover:border-accent hover:text-accent'
              }`}
            >
              {queueAdded ? 'Added to Render Queue' : submitting ? 'Adding...' : 'Add to Render Queue'}
            </button>
          )}
          {/* Render Now — always visible (routes through queue, doesn't need Wan2GP check) */}
          {jsonPath && !queueAdded && (
            <button
              onClick={handleRender}
              disabled={renderSubmitted || submitting}
              className={`px-4 py-2 text-sm font-mono font-bold rounded transition-colors ${
                renderSubmitted
                  ? 'bg-score-high/20 text-score-high'
                  : submitting
                    ? 'bg-accent/50 text-black/50 cursor-wait'
                    : 'bg-accent text-black hover:bg-accent/90'
              }`}
            >
              {renderSubmitted ? 'Render Queued' : submitting ? 'Submitting...' : 'Render Now'}
            </button>
          )}
          {/* Go to iteration — always visible, highlighted after action */}
          {onGoToIteration && (
            <button onClick={onGoToIteration}
              className={`px-4 py-2 text-sm font-mono font-bold rounded transition-colors ${
                renderSubmitted || queueAdded
                  ? 'bg-accent text-black hover:bg-accent/90 animate-pulse'
                  : 'bg-surface-overlay text-gray-300 border border-gray-600 hover:text-accent hover:border-accent'
              }`}>
              Go to Iteration #{iterationNumber} &rarr;
            </button>
          )}
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
