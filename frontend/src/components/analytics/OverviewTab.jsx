import { memo } from 'react';
import { SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

function progressColor(score) {
  if (score == null) return 'bg-gray-700';
  const pct = score / GRAND_MAX;
  if (pct >= SCORE_LOCK_THRESHOLD / GRAND_MAX) return 'bg-green-500';
  if (pct >= 0.57) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreColor(score) {
  if (score == null) return 'text-gray-600';
  const pct = score / GRAND_MAX;
  if (pct >= SCORE_LOCK_THRESHOLD / GRAND_MAX) return 'text-green-400';
  if (pct >= 0.57) return 'text-amber-400';
  return 'text-red-400';
}

const SummaryPill = memo(function SummaryPill({ label, value, color = 'text-gray-200', borderColor = 'border-gray-700' }) {
  return (
    <div className={`bg-surface-raised border ${borderColor} rounded-lg px-5 py-3 font-mono`}>
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
});

const StallBadge = memo(function StallBadge({ stall, lockedIterationId }) {
  if (lockedIterationId) return <span className="text-xs font-mono font-bold text-green-400">✓ locked</span>;
  if (!stall) return null;
  if (stall.type === 'plateau') return <span className="text-xs font-mono text-red-400">⚠ plateau</span>;
  if (stall.type === 'no_evals') return <span className="text-xs font-mono text-purple-400">⚠ no evals</span>;
  return null;
});

const ScoreHistogram = memo(function ScoreHistogram({ distribution }) {
  if (!distribution) return null;
  const { buckets, median, mean, high } = distribution;
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  const barColor = (range) => {
    const start = parseInt(range);
    if (start >= 60) return 'bg-green-500';
    if (start >= 30) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Score Distribution — all evaluated iterations
      </div>
      <div className="flex items-end gap-2 h-24">
        {buckets.map(bucket => (
          <div key={bucket.range} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-xs font-mono text-gray-400">{bucket.count}</span>
            <div
              className={`w-full rounded-t ${barColor(bucket.range)}`}
              style={{ height: `${Math.max((bucket.count / maxCount) * 80, bucket.count > 0 ? 4 : 0)}px` }}
            />
            <span className="text-xs font-mono text-gray-500">{bucket.range}</span>
          </div>
        ))}
      </div>
      <div className="text-xs font-mono text-gray-500 mt-2 flex gap-3 flex-wrap">
        {median != null && <span>median <span className="text-gray-300">{median}</span></span>}
        {mean != null && <span>mean <span className="text-gray-300">{mean}</span></span>}
        {high != null && <span>high <span className="text-gray-300">{high}</span></span>}
        <span>lock threshold <span className="text-green-400">{SCORE_LOCK_THRESHOLD}</span></span>
      </div>
    </div>
  );
});

/**
 * OverviewTab — summary pills, all-clips table, score distribution histogram.
 *
 * Props:
 *   data — full overview API response
 *   onSwitchToStalls() — called when user clicks the Stalling pill
 */
export default function OverviewTab({ data, onSwitchToStalls }) {
  const { summary, clips, score_distribution } = data;

  return (
    <div className="space-y-6">
      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        <SummaryPill label="Clips" value={summary.clip_count} />
        <SummaryPill label="Iterations" value={summary.iteration_count} />
        <SummaryPill label="Evaluated" value={summary.evaluated_count} />
        <SummaryPill label="Locked" value={summary.locked_count} color="text-green-400" />
        <button onClick={onSwitchToStalls} className="focus:outline-none">
          <SummaryPill
            label="Stalling"
            value={summary.stalling_count}
            color={summary.stalling_count > 0 ? 'text-red-400' : 'text-gray-600'}
            borderColor={summary.stalling_count > 0 ? 'border-red-500/40' : 'border-gray-700'}
          />
        </button>
      </div>

      {/* All clips table */}
      <div>
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">All Clips</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3">Clip</th>
                <th className="text-left py-2 px-3">Character</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-right py-2 px-3">Best</th>
                <th className="text-right py-2 px-3">Iters</th>
                <th className="text-left py-2 px-3 min-w-32">Progress</th>
                <th className="text-left py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {clips.map(clip => (
                <tr
                  key={clip.id}
                  className={`border-b border-gray-800 ${clip.iteration_count === 0 ? 'opacity-40' : ''}`}
                >
                  <td className="py-2.5 px-3 text-gray-200">{clip.name}</td>
                  <td className="py-2.5 px-3">
                    {clip.characters.length > 0
                      ? <span className="text-purple-400">{clip.characters.join(', ')}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={
                      clip.status === 'locked' ? 'text-green-400' :
                      clip.status === 'in_progress' ? 'text-amber-400' :
                      clip.status === 'evaluating' ? 'text-blue-400' :
                      'text-gray-500'
                    }>
                      {clip.status}
                    </span>
                  </td>
                  <td className={`py-2.5 px-3 text-right font-bold ${scoreColor(clip.best_score)}`}>
                    {clip.best_score != null
                      ? <>{clip.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span></>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{clip.iteration_count}</td>
                  <td className="py-2.5 px-3">
                    <div className="bg-gray-800 rounded h-1.5 w-full">
                      <div
                        className={`rounded h-1.5 ${progressColor(clip.best_score)}`}
                        style={{ width: `${Math.min((clip.best_score ?? 0) / SCORE_LOCK_THRESHOLD * 100, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <StallBadge stall={clip.stall} lockedIterationId={clip.locked_iteration_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Score histogram */}
      <ScoreHistogram distribution={score_distribution} />
    </div>
  );
}
