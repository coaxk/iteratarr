import { memo } from 'react';

/**
 * RopesTab — cross-clip rope effectiveness as horizontal bar chart.
 * Each row: rope label · delta bar (green/red) · use count · success rate.
 *
 * Props:
 *   ropes — array from overview API response
 */
const RopesTab = memo(function RopesTab({ ropes }) {
  if (!ropes || ropes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-600 font-mono text-sm">No rope data yet — evaluations need attribution fields.</p>
      </div>
    );
  }

  const maxAbsDelta = Math.max(...ropes.map(r => Math.abs(r.avg_delta)), 1);

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Cross-clip rope effectiveness — avg score delta per use
      </div>
      <div className="space-y-3">
        {ropes.map(rope => {
          const isPositive = rope.avg_delta >= 0;
          const barWidth = `${(Math.abs(rope.avg_delta) / maxAbsDelta) * 100}%`;

          return (
            <div key={rope.rope} className="flex items-center gap-3 font-mono">
              <div className="w-56 shrink-0 text-sm text-gray-200 truncate" title={rope.label}>
                {rope.label}
              </div>
              <div className="flex-1 bg-gray-800 rounded h-6 relative overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded flex items-center px-2 text-xs text-white font-bold ${isPositive ? 'left-0 bg-green-600' : 'right-0 bg-red-600'}`}
                  style={{ width: barWidth, minWidth: rope.avg_delta !== 0 ? '2rem' : '0' }}
                >
                  {rope.avg_delta > 0 ? `+${rope.avg_delta}` : rope.avg_delta}
                </div>
              </div>
              <div className="w-16 text-right text-xs text-gray-500 shrink-0">{rope.count} uses</div>
              <div className={`w-14 text-right text-xs font-bold shrink-0 ${rope.success_rate >= 60 ? 'text-green-400' : rope.success_rate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {rope.success_rate}% ✓
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-xs font-mono text-gray-600">
        avg score delta per use · success rate = % of uses with a positive delta · sorted by avg delta
      </div>
    </div>
  );
});

export default RopesTab;
