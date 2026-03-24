import { BRANCH_STATUSES, SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

/**
 * BranchPillBar — horizontal pill selector for switching between branches.
 * Shows each branch as a pill with seed name, best score, and status indicator.
 * "All" pill shows unfiltered view across all branches.
 *
 * Props:
 *   branches        — array of branch records from the API
 *   selectedBranchId — currently selected branch ID, or null for "All"
 *   onSelect        — callback(branchId | null)
 *   onManage        — callback(branchId) for status management (optional)
 */
export default function BranchPillBar({ branches, selectedBranchId, onSelect, onManage }) {
  if (!branches || branches.length === 0) return null;

  // Sort: active first, then locked, then rest. Within same status, by creation date.
  const statusOrder = { active: 0, locked: 1, screening: 2, stalled: 3, abandoned: 4, superseded: 5 };
  const sorted = [...branches].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {/* All branches pill */}
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${
          selectedBranchId === null
            ? 'bg-accent text-black'
            : 'bg-surface-overlay text-gray-400 hover:text-gray-200 hover:bg-surface-overlay/80'
        }`}
      >
        All ({branches.reduce((sum, b) => sum + (b.iteration_count || 0), 0)})
      </button>

      {sorted.map(branch => {
        const isSelected = selectedBranchId === branch.id;
        const statusInfo = BRANCH_STATUSES[branch.status] || BRANCH_STATUSES.active;
        const isLocked = branch.status === 'locked';
        const isDimmed = branch.status === 'superseded' || branch.status === 'abandoned';

        // Short display name — prefer custom name, fall back to seed-XXXXX
        const displayName = branch.name || `seed-${branch.seed}`;
        // Truncate long seed names for pill display
        const shortName = displayName.length > 16 ? `seed-${String(branch.seed).slice(-6)}` : displayName;

        return (
          <div key={branch.id} className="shrink-0 flex items-center">
            <button
              onClick={() => onSelect(isSelected ? null : branch.id)}
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-accent text-black'
                  : isDimmed
                    ? 'bg-surface-overlay/50 text-gray-600 hover:text-gray-400'
                    : 'bg-surface-overlay text-gray-300 hover:text-gray-100 hover:bg-surface-overlay/80'
              }`}
              title={`${displayName} — ${statusInfo.label}${branch.best_score ? `, best: ${branch.best_score}/75` : ''}${branch.iteration_count ? `, ${branch.iteration_count} iters` : ''}`}
            >
              {/* Status dot */}
              <span className={`w-1.5 h-1.5 rounded-full ${
                isSelected ? 'bg-black/40' :
                isLocked ? 'bg-green-400' :
                branch.status === 'active' ? 'bg-amber-400' :
                branch.status === 'stalled' ? 'bg-gray-400' :
                branch.status === 'screening' ? 'bg-purple-400' :
                'bg-gray-600'
              }`} />

              {shortName}

              {/* Score badge — matches iteration lineage color scale */}
              {branch.best_score !== null && branch.best_score !== undefined && (() => {
                const pct = branch.best_score / GRAND_MAX;
                const scoreColor = isSelected ? 'text-black/60' :
                  pct >= 0.75 ? 'text-score-high' :
                  pct >= 0.5 ? 'text-score-mid' :
                  'text-score-low';
                return (
                  <span className={`ml-0.5 ${scoreColor}`}>
                    {branch.best_score}
                  </span>
                );
              })()}

              {/* Iteration count */}
              {branch.iteration_count > 0 && (
                <span className={`${isSelected ? 'text-black/40' : 'text-gray-600'}`}>
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
  );
}
