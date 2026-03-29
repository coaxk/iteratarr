import { memo } from 'react';
import { GRAND_MAX } from '../../constants';

const StallCard = memo(function StallCard({ clip }) {
  const isPlateau = clip.stall?.type === 'plateau';
  return (
    <div className="border border-red-500/40 bg-surface-raised rounded-lg p-4 font-mono">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-200 text-sm font-bold">{clip.name}</span>
          {isPlateau
            ? <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold">PLATEAU</span>
            : <span className="bg-purple-700 text-white text-xs px-2 py-0.5 rounded font-bold">NO EVALS</span>
          }
        </div>
        <span className="text-gray-500 text-xs shrink-0 ml-2">
          {clip.characters.length > 0 ? clip.characters.join(', ') : 'no character'}
        </span>
      </div>
      <div className="text-gray-400 text-sm">{clip.stall.detail}</div>
      {clip.stall.excluded_branch_count > 0 && (
        <div className="text-gray-600 text-xs mt-1">
          {clip.stall.excluded_branch_count} abandoned branch{clip.stall.excluded_branch_count !== 1 ? 'es' : ''} excluded from check
        </div>
      )}
    </div>
  );
});

const LockedCard = memo(function LockedCard({ clip }) {
  return (
    <div className="border border-green-500/30 bg-surface-raised rounded-lg px-4 py-3 font-mono flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-gray-200 text-sm">{clip.name}</span>
        <span className="bg-green-600 text-black text-xs px-2 py-0.5 rounded font-bold">LOCKED</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs">{clip.characters.join(', ')}</span>
        <span className="text-green-400 font-bold text-sm">
          {clip.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span>
        </span>
      </div>
    </div>
  );
});

/**
 * StallsTab — three sections: stalling clips, locked clips, healthy clips.
 *
 * Props:
 *   clips — array from overview API response
 */
export default function StallsTab({ clips }) {
  const stalling = clips.filter(c => c.stall && !c.locked_iteration_id);
  const locked = clips.filter(c => c.locked_iteration_id);
  const healthy = clips.filter(c => !c.stall && !c.locked_iteration_id && c.iteration_count > 0);
  const notStarted = clips.filter(c => c.iteration_count === 0);

  return (
    <div className="space-y-6">
      {/* Stalling */}
      {stalling.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Needs Intervention ({stalling.length})
          </div>
          <div className="space-y-3">
            {stalling.map(clip => <StallCard key={clip.id} clip={clip} />)}
          </div>
        </div>
      )}

      {stalling.length === 0 && (
        <div className="border border-gray-700 rounded-lg p-4 font-mono text-gray-500 text-sm text-center">
          ✓ No clips are stalling
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Locked ✓ ({locked.length})
          </div>
          <div className="space-y-2">
            {locked.map(clip => <LockedCard key={clip.id} clip={clip} />)}
          </div>
        </div>
      )}

      {/* Healthy */}
      {healthy.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Progressing Normally ({healthy.length})
          </div>
          <div className="border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-gray-400">
            {healthy.map(c => c.name).join(' · ')}
          </div>
        </div>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Not Started ({notStarted.length})
          </div>
          <div className="border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-gray-600">
            {notStarted.map(c => c.name).join(' · ')}
          </div>
        </div>
      )}

      {/* Logic note */}
      <div className="border border-gray-800 rounded-lg px-4 py-3 font-mono text-xs text-gray-600">
        Plateau = best score unchanged for 4+ scored iters on active branches ·
        No evals = active branches with 3+ iters and zero evaluations ·
        Abandoned branches and locked clips always excluded
      </div>
    </div>
  );
}
