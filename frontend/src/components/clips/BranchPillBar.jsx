import { useRef } from 'react';
import { BRANCH_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

/**
 * BranchPillBar — horizontal pill selector for switching between branches.
 * Scroll arrows when pills overflow. Fork branches get a visible indicator.
 */
export default function BranchPillBar({ branches, selectedBranchId, onSelect, onManage }) {
  const scrollRef = useRef(null);

  if (!branches || branches.length === 0) return null;

  const statusOrder = { active: 0, locked: 1, screening: 2, stalled: 3, abandoned: 4, superseded: 5 };
  const sorted = [...branches].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  const needsScroll = branches.length > 4;

  return (
    <div className="flex items-center gap-1">
      {needsScroll && (
        <button onClick={() => scrollBy(-1)} className="shrink-0 px-1 py-2 text-gray-600 hover:text-accent font-mono text-sm">
          ‹
        </button>
      )}

      <div ref={scrollRef} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1 py-1">
        {/* All branches pill */}
        <button
          onClick={() => onSelect(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-colors ${
            selectedBranchId === null
              ? 'bg-accent text-black'
              : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
          }`}
        >
          All ({branches.reduce((sum, b) => sum + (b.iteration_count || 0), 0)})
        </button>

        {sorted.map(branch => {
          const isSelected = selectedBranchId === branch.id;
          const isLocked = branch.status === 'locked';
          const isDimmed = branch.status === 'superseded' || branch.status === 'abandoned';
          const isFork = branch.created_from === 'fork';

          const displayName = branch.name || `seed-${branch.seed}`;
          const shortName = displayName.length > 16 ? `seed-${String(branch.seed).slice(-6)}` : displayName;

          const pct = branch.best_score ? branch.best_score / GRAND_MAX : 0;
          const scoreColor = isSelected ? 'text-black/60' :
            pct >= 0.75 ? 'text-score-high' :
            pct >= 0.5 ? 'text-score-mid' :
            pct > 0 ? 'text-score-low' : '';

          return (
            <div key={branch.id} className="shrink-0 flex items-center">
              <button
                onClick={() => onSelect(isSelected ? null : branch.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-accent text-black'
                    : isDimmed
                      ? 'bg-surface-overlay/50 text-gray-600 hover:text-gray-400'
                      : isFork
                        ? 'bg-surface-overlay text-gray-300 hover:text-gray-100'
                        : 'bg-surface-overlay text-gray-300 hover:text-gray-100'
                }`}
                style={isFork ? (isSelected
                  ? { backgroundColor: 'rgba(168, 85, 247, 0.7)', border: '1px solid rgba(168, 85, 247, 0.8)', color: '#fff' }
                  : { backgroundColor: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c4b5fd' }
                ) : undefined}
                title={`${displayName} — ${(BRANCH_STATUSES[branch.status] || BRANCH_STATUSES.active).label}${branch.best_score ? `, best: ${branch.best_score}/75` : ''}${branch.iteration_count ? `, ${branch.iteration_count} iters` : ''}${isFork ? ' (forked)' : ''}`}
              >
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full ${
                  isSelected ? 'bg-black/40' :
                  isLocked ? 'bg-green-400' :
                  branch.status === 'active' ? 'bg-amber-400' :
                  branch.status === 'stalled' ? 'bg-gray-400' :
                  branch.status === 'screening' ? 'bg-purple-400' :
                  'bg-gray-600'
                }`} />

                {/* Fork icon — prominent */}
                {isFork && (
                  <span className={`text-base font-bold leading-none ${isSelected ? 'text-black' : 'text-purple-300'}`}>⑂</span>
                )}

                {shortName}

                {/* Score */}
                {branch.best_score != null && (
                  <span className={scoreColor}>{branch.best_score}</span>
                )}

                {/* Iteration count */}
                {branch.iteration_count > 0 && (
                  <span className={isSelected ? 'text-black/40' : 'text-gray-600'}>
                    ({branch.iteration_count})
                  </span>
                )}
              </button>

              {/* Manage button */}
              {onManage && !isLocked && (
                <button
                  onClick={(e) => { e.stopPropagation(); onManage(branch.id); }}
                  className="ml-0.5 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-accent hover:bg-surface-overlay text-xs font-mono transition-colors"
                  title="Manage branch"
                >
                  ...
                </button>
              )}
            </div>
          );
        })}
      </div>

      {needsScroll && (
        <button onClick={() => scrollBy(1)} className="shrink-0 px-1 py-2 text-gray-600 hover:text-accent font-mono text-sm">
          ›
        </button>
      )}
    </div>
  );
}
