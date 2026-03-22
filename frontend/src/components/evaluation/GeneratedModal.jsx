import { useState } from 'react';

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

export default function GeneratedModal({ jsonPath, renderPath, iterationNumber, onClose, onGoToIteration }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-raised border border-gray-700 rounded-lg w-[550px] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-score-high font-bold">Iteration #{iterationNumber} Generated</h3>
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
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          {onGoToIteration && (
            <button onClick={onGoToIteration}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90">
              Go to Iteration #{iterationNumber} →
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
