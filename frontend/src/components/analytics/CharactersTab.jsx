import { memo } from 'react';
import { SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';

/**
 * CharactersTab — per-character performance across all clips.
 *
 * Props:
 *   characters — array from overview API response
 */
const CharactersTab = memo(function CharactersTab({ characters }) {
  if (!characters || characters.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-600 font-mono text-sm">No characters found — add character tags to your clips.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
        Per-character performance across all clips
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left py-2 px-3">Character</th>
              <th className="text-right py-2 px-3">Clips</th>
              <th className="text-right py-2 px-3">Total Iters</th>
              <th className="text-right py-2 px-3">Best Score</th>
              <th className="text-right py-2 px-3">Avg Score</th>
              <th className="text-left py-2 px-3 min-w-40">Best Progress</th>
            </tr>
          </thead>
          <tbody>
            {characters.map(char => {
              const hasData = char.best_score != null;
              const progressPct = hasData ? Math.min((char.best_score / SCORE_LOCK_THRESHOLD) * 100, 100) : 0;
              const barColor = !hasData ? 'bg-gray-700' :
                char.best_score >= SCORE_LOCK_THRESHOLD ? 'bg-green-500' :
                char.best_score >= 43 ? 'bg-amber-500' : 'bg-red-500';

              return (
                <tr
                  key={char.name}
                  className={`border-b border-gray-800 ${!hasData ? 'opacity-40' : ''}`}
                >
                  <td className="py-2.5 px-3 text-purple-400 font-bold text-base">{char.name}</td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{char.clip_count}</td>
                  <td className="py-2.5 px-3 text-right text-gray-400">{char.total_iterations}</td>
                  <td className="py-2.5 px-3 text-right">
                    {hasData
                      ? <span className={char.best_score >= SCORE_LOCK_THRESHOLD ? 'text-green-400 font-bold' : 'text-amber-400 font-bold'}>
                          {char.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span>
                        </span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-400">
                    {char.avg_score != null ? char.avg_score : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="bg-gray-800 rounded h-1.5 w-full">
                      <div className={`rounded h-1.5 ${barColor}`} style={{ width: `${progressPct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default CharactersTab;
