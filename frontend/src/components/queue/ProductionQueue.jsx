import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import CopyButton from '../common/CopyButton';

const STATUS_BADGE = {
  queued: { bg: 'bg-gray-600', text: 'text-gray-300', label: 'Queued' },
  rendering: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Rendering' },
  complete: { bg: 'bg-score-high/20', text: 'text-score-high', label: 'Done' },
  failed: { bg: 'bg-score-low/20', text: 'text-score-low', label: 'Failed' }
};

function RenderQueueItem({ item }) {
  const badge = STATUS_BADGE[item.status] || STATUS_BADGE.queued;

  return (
    <div className="bg-surface border border-gray-600 rounded p-2 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-mono text-gray-200 font-bold truncate" title={item.clip_name}>
          {item.clip_name}
        </span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} shrink-0`}>
          {badge.label}
        </span>
      </div>
      {item.seed && (
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-600">SEED</span>
          <span className="text-xs font-mono text-gray-400">{item.seed}</span>
        </div>
      )}
      {item.status === 'rendering' && item.progress?.percent != null && (
        <div className="w-full bg-gray-700 rounded-full h-1">
          <div className="bg-amber-400 h-1 rounded-full transition-all" style={{ width: `${item.progress.percent}%` }} />
        </div>
      )}
    </div>
  );
}

function ProductionCard({ item }) {
  const loras = item.loras || [];

  return (
    <div className="bg-surface border border-gray-600 rounded p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-gray-200 font-bold truncate" title={item.clip_name}>
          {item.clip_name}
        </span>
        <span className="text-xs font-mono font-bold text-score-high ml-2 shrink-0">
          {item.final_score}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-gray-500">SEED</span>
        <span className="text-xs font-mono text-gray-300">{item.seed}</span>
      </div>
      {loras.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {loras.map((lora, i) => (
            <span key={i} className="text-xs font-mono bg-surface-overlay text-gray-400 px-1.5 py-0.5 rounded">
              {typeof lora === 'string' ? lora.split('/').pop().replace('.safetensors', '') : String(lora)}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-gray-500">ITER</span>
        <span className="text-xs font-mono text-gray-300">#{item.iteration_number}</span>
      </div>
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

export default function ProductionQueue({ onNavigateToQueue }) {
  const { data: renderQueue, loading: rqLoading } = useApi(() => api.listQueue(), []);
  const { data: prodQueue, loading: pqLoading } = useApi(() => api.listProductionQueue(), []);
  const { data: queueStatus } = useApi(() => api.getQueueStatus(), []);

  const activeRenderItems = (renderQueue || []).filter(i => i.status === 'queued' || i.status === 'rendering');
  const prodItems = prodQueue || [];

  return (
    <div className="space-y-4">
      {/* Render Queue section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
            Render Queue
          </h2>
          {onNavigateToQueue && (
            <button
              onClick={onNavigateToQueue}
              className="text-xs font-mono text-accent hover:text-accent/80 transition-colors"
            >
              Open
            </button>
          )}
        </div>

        {queueStatus?.running && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono text-amber-400">Processing</span>
          </div>
        )}

        {rqLoading && <p className="text-gray-600 text-xs font-mono">Loading...</p>}

        {!rqLoading && activeRenderItems.length === 0 && (
          <p className="text-gray-700 text-xs font-mono">No renders queued</p>
        )}

        {!rqLoading && activeRenderItems.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-mono text-gray-500">
              {activeRenderItems.length} item{activeRenderItems.length !== 1 ? 's' : ''}
            </span>
            {activeRenderItems.slice(0, 5).map(item => (
              <RenderQueueItem key={item.id} item={item} />
            ))}
            {activeRenderItems.length > 5 && (
              <button
                onClick={onNavigateToQueue}
                className="text-xs font-mono text-gray-600 hover:text-accent transition-colors"
              >
                +{activeRenderItems.length - 5} more...
              </button>
            )}
          </div>
        )}
      </div>

      {/* Production Queue section (locked iterations) */}
      <div>
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
          Production
        </h2>

        {pqLoading && <p className="text-gray-600 text-xs font-mono">Loading...</p>}

        {!pqLoading && prodItems.length === 0 && (
          <div className="text-center py-2">
            <p className="text-gray-700 text-xs font-mono">Locked iterations appear here.</p>
          </div>
        )}

        {!pqLoading && prodItems.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-mono text-gray-500">
              {prodItems.length} clip{prodItems.length !== 1 ? 's' : ''} locked
            </span>
            {prodItems.map(item => (
              <ProductionCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
