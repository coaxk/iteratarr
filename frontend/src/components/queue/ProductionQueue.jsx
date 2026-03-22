import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-HTTPS contexts
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
      title="Copy path to clipboard"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function QueueCard({ item }) {
  const loras = item.loras || [];

  return (
    <div className="bg-surface border border-gray-600 rounded p-2.5 space-y-1.5">
      {/* Clip name + score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-gray-200 font-bold truncate" title={item.clip_name}>
          {item.clip_name}
        </span>
        <span className="text-xs font-mono font-bold text-score-high ml-2 shrink-0">
          {item.final_score}
        </span>
      </div>

      {/* Seed */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-gray-500">SEED</span>
        <span className="text-xs font-mono text-gray-300">{item.seed}</span>
      </div>

      {/* LoRAs */}
      {loras.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {loras.map((lora, i) => (
            <span key={i} className="text-xs font-mono bg-surface-overlay text-gray-400 px-1.5 py-0.5 rounded">
              {typeof lora === 'string' ? lora.split('/').pop().replace('.safetensors', '') : String(lora)}
            </span>
          ))}
        </div>
      )}

      {/* Iteration number */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-gray-500">ITER</span>
        <span className="text-xs font-mono text-gray-300">#{item.iteration_number}</span>
      </div>

      {/* Production JSON path */}
      {item.production_json_path && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs font-mono text-gray-600 truncate flex-1" title={item.production_json_path}>
            {item.production_json_path}
          </span>
          <CopyButton text={item.production_json_path} />
        </div>
      )}
    </div>
  );
}

export default function ProductionQueue() {
  const { data: queueItems, loading, error } = useApi(() => api.listQueue(), []);

  return (
    <div>
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Production Queue
      </h2>

      {loading && (
        <p className="text-gray-600 text-xs font-mono">Loading queue...</p>
      )}

      {error && (
        <p className="text-red-400 text-xs font-mono">Failed to load queue</p>
      )}

      {!loading && !error && (!queueItems || queueItems.length === 0) && (
        <p className="text-gray-600 text-xs font-mono">No clips queued</p>
      )}

      {!loading && queueItems && queueItems.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-mono text-gray-500">
            {queueItems.length} clip{queueItems.length !== 1 ? 's' : ''} queued
          </span>
          {queueItems.map(item => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
