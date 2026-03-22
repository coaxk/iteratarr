import { CLIP_STATUSES } from '../../constants';

export default function ClipCard({ clip, onClick }) {
  const status = CLIP_STATUSES[clip.status] || CLIP_STATUSES.not_started;

  return (
    <button
      onClick={() => onClick(clip)}
      className="w-full text-left p-3 bg-surface rounded border border-gray-700 hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-mono text-gray-200 group-hover:text-accent transition-colors truncate">
          {clip.name}
        </span>
      </div>
      {clip.characters?.length > 0 && (
        <div className="flex gap-1 mb-1 flex-wrap">
          {clip.characters.map(c => (
            <span key={c} className="text-xs font-mono bg-surface-overlay px-1.5 py-0.5 rounded text-gray-400">{c}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{clip.location || 'No location'}</span>
        {clip.best_score != null && (
          <span className="font-mono font-bold text-accent">{clip.best_score}/75</span>
        )}
      </div>
    </button>
  );
}
