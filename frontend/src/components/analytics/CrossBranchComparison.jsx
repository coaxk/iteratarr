import { useState } from 'react';
import { useBranchComparison } from '../../hooks/useQueries';
import { api } from '../../api';
import { GRAND_MAX, SCORE_LOCK_THRESHOLD, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, ROPES } from '../../constants';

/**
 * CrossBranchComparison — side-by-side comparison of two branches.
 *
 * Shows best iterations from each branch with:
 * - Full score breakdown (all 15 fields) with deltas
 * - Settings diff between the two best iterations
 * - Score progressions
 * - "Fork from this" button to carry forward the winning config
 */

const ROPE_LABELS = Object.fromEntries(ROPES.map(r => [r.id, r.label]));

function scoreColor(value, max) {
  if (value === null || value === undefined) return 'text-gray-600';
  const pct = value / max;
  if (pct < 0.493) return 'text-score-low';
  if (pct < 0.747) return 'text-score-mid';
  return 'text-score-high';
}

function deltaColor(d) {
  if (d === null || d === undefined) return 'text-gray-600';
  if (d > 0) return 'text-score-high';
  if (d < 0) return 'text-score-low';
  return 'text-gray-500';
}

function formatDelta(d) {
  if (d === null || d === undefined) return '\u2014';
  if (d === 0) return '0';
  return d > 0 ? `+${d}` : String(d);
}

function fmtVal(val) {
  if (val === undefined || val === null) return '\u2014';
  if (typeof val === 'string') return val.length > 80 ? `${val.slice(0, 80)}...` : val;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function ScoreRow({ label, leftVal, rightVal, max }) {
  const delta = (leftVal !== null && rightVal !== null) ? rightVal - leftVal : null;
  return (
    <tr className="border-b border-gray-700/30 last:border-b-0">
      <td className={`px-2 py-1 text-right font-mono ${leftVal !== null ? scoreColor(leftVal, max) : 'text-gray-600'}`}>
        {leftVal !== null && leftVal !== undefined ? leftVal : '\u2014'}
      </td>
      <td className="px-3 py-1 text-center text-gray-400 text-xs">{label}</td>
      <td className={`px-2 py-1 font-mono ${rightVal !== null ? scoreColor(rightVal, max) : 'text-gray-600'}`}>
        {rightVal !== null && rightVal !== undefined ? rightVal : '\u2014'}
      </td>
      <td className={`px-2 py-1 text-right font-mono ${deltaColor(delta)}`}>
        {formatDelta(delta)}
      </td>
    </tr>
  );
}

function SubtotalRow({ label, leftVal, rightVal, max }) {
  const delta = (leftVal !== null && rightVal !== null) ? rightVal - leftVal : null;
  return (
    <tr className="border-b border-gray-700 bg-surface-overlay/30">
      <td className={`px-2 py-1.5 text-right font-mono font-bold ${leftVal !== null ? scoreColor(leftVal, max) : 'text-gray-600'}`}>
        {leftVal !== null ? `${leftVal}/${max}` : '\u2014'}
      </td>
      <td className="px-3 py-1.5 text-center text-gray-300 text-xs font-bold uppercase tracking-wider">{label}</td>
      <td className={`px-2 py-1.5 font-mono font-bold ${rightVal !== null ? scoreColor(rightVal, max) : 'text-gray-600'}`}>
        {rightVal !== null ? `${rightVal}/${max}` : '\u2014'}
      </td>
      <td className={`px-2 py-1.5 text-right font-mono font-bold ${deltaColor(delta)}`}>
        {formatDelta(delta)}
      </td>
    </tr>
  );
}

export default function CrossBranchComparison({ clipId, branchId1, branchId2, onClose, onFork }) {
  const { data, isLoading: loading, error: queryError } = useBranchComparison(clipId, [branchId1, branchId2]);
  const error = queryError?.message || null;
  const [forking, setForking] = useState(false);
  const [forkSeed, setForkSeed] = useState('');
  const [forkSource, setForkSource] = useState(null); // 'left' | 'right'

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <div className="bg-surface border border-gray-700 rounded-lg p-8">
          <p className="text-xs font-mono text-gray-500">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <div className="bg-surface border border-gray-700 rounded-lg p-8 space-y-3">
          <p className="text-xs font-mono text-red-400">Error: {error || 'No data'}</p>
          <button onClick={onClose} className="text-xs font-mono text-accent">Close</button>
        </div>
      </div>
    );
  }

  const { left, right, settingsDiff, scoreDeltas } = data;
  const leftScores = left.scores || {};
  const rightScores = right.scores || {};

  // Category totals
  const leftIdentity = leftScores.identity?.total ?? null;
  const rightIdentity = rightScores.identity?.total ?? null;
  const leftLocation = leftScores.location?.total ?? null;
  const rightLocation = rightScores.location?.total ?? null;
  const leftMotion = leftScores.motion?.total ?? null;
  const rightMotion = rightScores.motion?.total ?? null;

  const handleFork = async (side) => {
    const source = side === 'left' ? left : right;
    if (!source.best_iteration) return;

    const seed = forkSeed ? parseInt(forkSeed) : undefined;
    setForking(true);
    try {
      const result = await api.forkBranch(clipId, {
        source_iteration_id: source.best_iteration.id,
        seed,
        name: seed ? `fork-from-${source.branch.name}-seed-${seed}` : undefined
      });
      if (onFork) onFork(result);
      onClose();
    } catch (err) {
      alert(`Fork failed: ${err.message}`);
    } finally {
      setForking(false);
    }
  };

  // Filter settings diff to exclude noise (output_filename, etc.)
  const meaningfulDiffs = (settingsDiff || []).filter(d =>
    !['output_filename', 'video_length', 'mode', 'type', 'settings_version', 'model_filename', 'model_type'].includes(d.field)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface border border-gray-700 rounded-lg w-full max-w-4xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold uppercase tracking-wider">
            Cross-Branch Comparison
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg font-mono transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Branch headers */}
        <div className="flex gap-4 px-4 py-3 border-b border-gray-700">
          <div className="flex-1 text-center">
            <p className="text-sm font-mono text-gray-200 font-bold">{left.branch.name}</p>
            <p className="text-xs font-mono text-gray-500">
              seed:{left.branch.seed} / {left.branch.iteration_count} iters / {left.branch.status}
            </p>
          </div>
          <div className="flex items-center text-gray-600 font-mono text-sm">vs</div>
          <div className="flex-1 text-center">
            <p className="text-sm font-mono text-gray-200 font-bold">{right.branch.name}</p>
            <p className="text-xs font-mono text-gray-500">
              seed:{right.branch.seed} / {right.branch.iteration_count} iters / {right.branch.status}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4 max-h-[65vh] overflow-y-auto">

          {/* Score comparison — all 15 fields */}
          {left.scores && right.scores ? (
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Score Comparison</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-2 py-1 text-right text-gray-500 w-20">{left.branch.name}</th>
                      <th className="px-3 py-1 text-center text-gray-500">Field</th>
                      <th className="px-2 py-1 text-left text-gray-500 w-20">{right.branch.name}</th>
                      <th className="px-2 py-1 text-right text-gray-500 w-16">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {IDENTITY_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores.identity?.[f.key] ?? null}
                        rightVal={rightScores.identity?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Identity" leftVal={leftIdentity} rightVal={rightIdentity} max={40} />
                    {LOCATION_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores.location?.[f.key] ?? null}
                        rightVal={rightScores.location?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Location" leftVal={leftLocation} rightVal={rightLocation} max={20} />
                    {MOTION_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores.motion?.[f.key] ?? null}
                        rightVal={rightScores.motion?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Motion" leftVal={leftMotion} rightVal={rightMotion} max={15} />
                    {/* Grand total */}
                    <tr className="bg-surface-overlay/50">
                      <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${scoreColor(leftScores.grand_total, GRAND_MAX)}`}>
                        {leftScores.grand_total ?? '\u2014'}/{GRAND_MAX}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-200 text-xs font-bold uppercase tracking-wider">Grand Total</td>
                      <td className={`px-2 py-2 font-mono text-sm font-bold ${scoreColor(rightScores.grand_total, GRAND_MAX)}`}>
                        {rightScores.grand_total ?? '\u2014'}/{GRAND_MAX}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${deltaColor(scoreDeltas?.grand_total)}`}>
                        {formatDelta(scoreDeltas?.grand_total ?? null)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs font-mono text-gray-600 italic">
              One or both branches have no evaluated iterations.
            </p>
          )}

          {/* Settings diff */}
          {meaningfulDiffs.length > 0 && (
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                Settings Diff
                <span className="ml-2 text-accent normal-case tracking-normal">
                  {meaningfulDiffs.length} field{meaningfulDiffs.length !== 1 ? 's' : ''} differ
                </span>
              </h4>
              <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                {meaningfulDiffs.map(diff => (
                  <div key={diff.field} className="flex items-start gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0 text-right">
                      <span className={`font-mono text-xs break-all ${diff.left != null ? 'text-score-low' : 'text-gray-600'}`}>
                        {fmtVal(diff.left)}
                      </span>
                    </div>
                    <div className="shrink-0 text-center min-w-[120px]">
                      <span className="text-xs font-mono text-gray-400">{diff.field}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`font-mono text-xs break-all ${diff.right != null ? 'text-accent' : 'text-gray-600'}`}>
                        {fmtVal(diff.right)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {meaningfulDiffs.length === 0 && left.best_iteration && right.best_iteration && (
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Settings Diff</h4>
              <p className="text-xs font-mono text-gray-600 italic">No meaningful differences in generation settings.</p>
            </div>
          )}

          {/* Attribution */}
          {(left.attribution || right.attribution) && (
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Attribution</h4>
              <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                <div className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0 text-right">
                    <span className="font-mono text-xs text-gray-300">
                      {left.attribution?.rope ? (ROPE_LABELS[left.attribution.rope] || left.attribution.rope) : '\u2014'}
                    </span>
                  </div>
                  <div className="shrink-0 text-center min-w-[120px]">
                    <span className="text-xs font-mono text-gray-400">Attributed Rope</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-gray-300">
                      {right.attribution?.rope ? (ROPE_LABELS[right.attribution.rope] || right.attribution.rope) : '\u2014'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fork / Carry-forward */}
          <div>
            <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
              Carry Forward
            </h4>
            <div className="border border-gray-700 rounded p-3 space-y-3">
              <p className="text-xs font-mono text-gray-400">
                Fork a new branch using the best settings from either side. Optionally specify a new seed.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-xs font-mono text-gray-500">New Seed (optional):</label>
                <input
                  type="number"
                  value={forkSeed}
                  onChange={(e) => setForkSeed(e.target.value)}
                  placeholder="auto"
                  className="w-28 bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 placeholder:text-gray-600"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleFork('left')}
                  disabled={!left.best_iteration || forking}
                  className={`flex-1 px-3 py-2 text-xs font-mono font-bold rounded transition-colors ${
                    left.best_iteration && !forking
                      ? 'bg-purple-600/30 border border-purple-500/50 text-purple-300 hover:bg-purple-600/50'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {forking ? 'Forking...' : `Fork from ${left.branch.name}`}
                  {left.best_score != null && (
                    <span className="ml-1 text-gray-500">({left.best_score}/{GRAND_MAX})</span>
                  )}
                </button>
                <button
                  onClick={() => handleFork('right')}
                  disabled={!right.best_iteration || forking}
                  className={`flex-1 px-3 py-2 text-xs font-mono font-bold rounded transition-colors ${
                    right.best_iteration && !forking
                      ? 'bg-purple-600/30 border border-purple-500/50 text-purple-300 hover:bg-purple-600/50'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {forking ? 'Forking...' : `Fork from ${right.branch.name}`}
                  {right.best_score != null && (
                    <span className="ml-1 text-gray-500">({right.best_score}/{GRAND_MAX})</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
