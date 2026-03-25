import { CLIP_STATUSES } from '../../constants';

export default function ClipCard({ clip, onClick, onDelete, onArchive, isDragging = false }) {
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  return (
    <div
      onClick={() => onClick(clip)}
      role="button"
      tabIndex={0}
      className={`w-full text-left p-3 bg-surface rounded border transition-colors group cursor-pointer h-28 overflow-hidden ${
        isDragging
          ? 'border-accent opacity-90 shadow-lg shadow-accent/10'
          : 'border-gray-700 hover:border-accent/50'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-mono text-gray-200 group-hover:text-accent transition-colors truncate">
          {clip.name}
        </span>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
          {onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(clip); }}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-amber-400 hover:bg-amber-400/10 text-xs"
              title="Archive clip"
            >
              ↓
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(clip); }}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-score-low hover:bg-score-low/10 text-xs"
              title="Delete clip"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-1 mb-1 flex-wrap">
        {clip.characters?.length > 0
          ? clip.characters.map(c => (
              <span key={c} className="text-xs font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-gray-400">{c}</span>
            ))
          : <span className="text-xs font-mono text-gray-700 italic">No characters</span>
        }
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={clip.location ? 'text-gray-500' : 'text-gray-700 italic'}>{clip.location || 'No location'}</span>
        <div className="flex items-center gap-2">
          {clip.branch_count > 0 && (
            <span className="font-mono font-bold text-sm" title={`${clip.branch_count} branch${clip.branch_count !== 1 ? 'es' : ''}${clip.fork_count ? `, ${clip.fork_count} fork${clip.fork_count !== 1 ? 's' : ''}` : ''}`}>
              <span style={{ color: '#86efac' }}>⑂{clip.branch_count - (clip.fork_count || 0)}</span>
              {clip.fork_count > 0 && <span style={{ color: '#c4b5fd' }}> ⑂{clip.fork_count}</span>}
            </span>
          )}
          {clip.best_score != null && (
            <span className="font-mono font-bold text-accent">{clip.best_score}/75</span>
          )}
        </div>
      </div>
      {clip.goal ? (
        <p className="text-xs text-gray-500 truncate mt-1">
          {clip.goal.length > 60 ? clip.goal.slice(0, 60) + '...' : clip.goal}
        </p>
      ) : (
        <p className="text-xs text-gray-700 italic mt-1">No brief</p>
      )}
    </div>
  );
}
