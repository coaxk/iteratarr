import { useState, useMemo } from 'react';
import { useBranchAnalytics } from '../../hooks/useQueries';
import { api } from '../../api';
import { GRAND_MAX, SCORE_LOCK_THRESHOLD, ROPES } from '../../constants';
import CrossBranchComparison from './CrossBranchComparison';

/**
 * BranchAnalytics — cross-branch analytics dashboard for a clip.
 *
 * Sections:
 * 1. Branch Leaderboard — ranked by best score, with sparklines
 * 2. Seed Effectiveness — visual ranking of seeds
 * 3. Settings Correlation — which rope changes had positive/negative impact
 * 4. Winning Settings Summary — aggregated best settings
 * 5. Cross-branch comparison launcher
 */

const ROPE_LABELS = Object.fromEntries(ROPES.map(r => [r.id, r.label]));

function scoreColor(pct) {
  if (pct >= 0.75) return 'text-score-high';
  if (pct >= 0.5) return 'text-score-mid';
  if (pct > 0) return 'text-score-low';
  return 'text-gray-600';
}

function barColor(pct) {
  if (pct >= 0.75) return 'bg-green-500';
  if (pct >= 0.5) return 'bg-amber-500';
  if (pct > 0) return 'bg-red-500';
  return 'bg-gray-700';
}

function deltaBarColor(val) {
  if (val > 0) return 'bg-green-500';
  if (val < 0) return 'bg-red-500';
  return 'bg-gray-600';
}

/** Inline SVG sparkline — CSS-only mini chart showing score progression */
function Sparkline({ data, maxVal = GRAND_MAX }) {
  if (!data || data.length === 0) return null;

  const scores = data.map(d => d.score).filter(s => s !== null);
  if (scores.length === 0) return null;

  const width = 80;
  const height = 24;
  const padding = 2;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const points = scores.map((s, i) => {
    const x = padding + (scores.length > 1 ? (i / (scores.length - 1)) * usableWidth : usableWidth / 2);
    const y = padding + usableHeight - (s / maxVal) * usableHeight;
    return `${x},${y}`;
  }).join(' ');

  // Threshold line
  const threshY = padding + usableHeight - (SCORE_LOCK_THRESHOLD / maxVal) * usableHeight;

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <line x1={padding} y1={threshY} x2={width - padding} y2={threshY}
        stroke="#22c55e" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
      <polyline
        points={points}
        fill="none"
        stroke="#d97706"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Highlight last point */}
      {scores.length > 0 && (() => {
        const lastX = padding + (scores.length > 1 ? ((scores.length - 1) / (scores.length - 1)) * usableWidth : usableWidth / 2);
        const lastY = padding + usableHeight - (scores[scores.length - 1] / maxVal) * usableHeight;
        return <circle cx={lastX} cy={lastY} r="2" fill="#d97706" />;
      })()}
    </svg>
  );
}

/** Horizontal bar for score visualization */
function ScoreBar({ value, max = GRAND_MAX, showLabel = true }) {
  if (value === null || value === undefined) {
    return <span className="text-xs font-mono text-gray-600">--</span>;
  }
  const pct = value / max;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor(pct)}`}
          style={{ width: `${Math.min(pct * 100, 100)}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-mono font-bold min-w-[3rem] text-right ${scoreColor(pct)}`}>
          {value}/{max}
        </span>
      )}
    </div>
  );
}

export default function BranchAnalytics({ clip, onClose, onFork }) {
  const { data, isLoading: loading, error: queryError } = useBranchAnalytics(clip.id);
  const error = queryError?.message || null;
  const [compareMode, setCompareMode] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [activeSection, setActiveSection] = useState('leaderboard');

  const sections = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'seeds', label: 'Seeds' },
    { id: 'settings', label: 'Settings' },
    { id: 'correlation', label: 'Rope Impact' },
  ];

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <div className="bg-surface border border-gray-700 rounded-lg p-8">
          <p className="text-xs font-mono text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <div className="bg-surface border border-gray-700 rounded-lg p-8 space-y-3">
          <p className="text-xs font-mono text-red-400">Error: {error}</p>
          <button onClick={onClose} className="text-xs font-mono text-accent hover:text-accent/80">Close</button>
        </div>
      </div>
    );
  }

  if (!data || data.branches.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <div className="bg-surface border border-gray-700 rounded-lg p-8 space-y-3 text-center">
          <p className="text-xs font-mono text-gray-500">No branches to analyse yet.</p>
          <button onClick={onClose} className="text-xs font-mono text-accent hover:text-accent/80">Close</button>
        </div>
      </div>
    );
  }

  // Cross-branch comparison mode
  if (compareMode && selectedBranches.length === 2) {
    return (
      <CrossBranchComparison
        clipId={clip.id}
        branchId1={selectedBranches[0]}
        branchId2={selectedBranches[1]}
        onClose={() => {
          setCompareMode(false);
          setSelectedBranches([]);
        }}
        onFork={onFork}
      />
    );
  }

  const toggleBranchSelect = (branchId) => {
    setSelectedBranches(prev => {
      if (prev.includes(branchId)) return prev.filter(id => id !== branchId);
      if (prev.length >= 2) return [prev[1], branchId]; // Replace oldest
      return [...prev, branchId];
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface border border-gray-700 rounded-lg w-full max-w-5xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-mono text-gray-200 font-bold uppercase tracking-wider">
              Branch Analytics
            </h3>
            <p className="text-xs font-mono text-gray-500 mt-0.5">
              {data.branch_count} branches, {data.total_iterations} iterations
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg font-mono transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-gray-700 px-4">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                activeSection === s.id
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 py-4 max-h-[70vh] overflow-y-auto space-y-4">

          {/* ---- Leaderboard ---- */}
          {activeSection === 'leaderboard' && (
            <div className="space-y-3">
              {/* Compare action bar */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-mono text-gray-500">
                  Select 2 branches to compare side-by-side
                </p>
                <button
                  onClick={() => setCompareMode(true)}
                  disabled={selectedBranches.length !== 2}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                    selectedBranches.length === 2
                      ? 'bg-accent text-black font-bold hover:bg-accent/90'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Compare ({selectedBranches.length}/2)
                </button>
              </div>

              {/* Branch rows */}
              {data.branches.map((branch, rank) => {
                const isSelected = selectedBranches.includes(branch.id);
                return (
                  <div
                    key={branch.id}
                    onClick={() => toggleBranchSelect(branch.id)}
                    className={`border rounded p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-accent/50 bg-accent/5'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <span className={`text-lg font-mono font-bold w-8 text-center ${
                        rank === 0 ? 'text-amber-400' : rank === 1 ? 'text-gray-300' : rank === 2 ? 'text-amber-700' : 'text-gray-600'
                      }`}>
                        {rank + 1}
                      </span>

                      {/* Branch info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-gray-200 font-bold truncate">
                            {branch.name}
                          </span>
                          <span className="text-xs font-mono text-gray-500">
                            seed:{branch.seed}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                            branch.status === 'locked' ? 'bg-green-500/20 text-green-400' :
                            branch.status === 'active' ? 'bg-amber-500/20 text-amber-400' :
                            branch.status === 'abandoned' ? 'bg-red-500/20 text-red-400' :
                            branch.status === 'superseded' ? 'bg-gray-500/20 text-gray-500' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {branch.status}
                          </span>
                          {branch.created_from === 'fork' && (
                            <span className="text-purple-400 text-xs font-mono">forked</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <ScoreBar value={branch.best_score} />
                          <Sparkline data={branch.score_progression} />
                          <span className="text-xs font-mono text-gray-500">
                            {branch.iteration_count} iter{branch.iteration_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      {/* Selection indicator */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'border-accent bg-accent' : 'border-gray-600'
                      }`}>
                        {isSelected && <span className="text-black text-xs font-bold">&#10003;</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Seed Effectiveness ---- */}
          {activeSection === 'seeds' && (
            <div className="space-y-3">
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                Seed Effectiveness Ranking
              </h4>
              <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                {data.seedRanking.map((seed, idx) => (
                  <div key={seed.seed} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`text-sm font-mono font-bold w-6 text-center ${
                      idx === 0 ? 'text-amber-400' : 'text-gray-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-gray-200 font-bold">
                          Seed {seed.seed}
                        </span>
                        <span className="text-xs font-mono text-gray-500">
                          {seed.branch_count} branch{seed.branch_count !== 1 ? 'es' : ''} /
                          {seed.total_iterations} iter{seed.total_iterations !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <ScoreBar value={seed.best_score} />
                    </div>
                  </div>
                ))}
              </div>
              {data.seedRanking.length === 0 && (
                <p className="text-xs font-mono text-gray-600 italic text-center py-4">
                  No seed data available yet.
                </p>
              )}
            </div>
          )}

          {/* ---- Winning Settings Summary ---- */}
          {activeSection === 'settings' && (
            <div className="space-y-3">
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                Best Settings Summary
                <span className="ml-2 normal-case tracking-normal text-gray-600">
                  (aggregated from top 3 scoring iterations)
                </span>
              </h4>
              {Object.keys(data.winningSummary).length > 0 ? (
                <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                  {Object.entries(data.winningSummary).map(([key, info]) => (
                    <div key={key} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-xs font-mono text-gray-400 min-w-[10rem]">
                        {key}
                      </span>
                      <div className="flex-1">
                        {info.avg !== undefined ? (
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono text-accent font-bold">{info.avg}</span>
                            <span className="text-xs font-mono text-gray-600">
                              range: {info.min} - {info.max}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm font-mono text-accent font-bold">
                            {info.most_common}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-gray-600 italic text-center py-4">
                  No evaluated iterations yet.
                </p>
              )}
            </div>
          )}

          {/* ---- Rope Impact / Settings Correlation ---- */}
          {activeSection === 'correlation' && (
            <div className="space-y-3">
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                Rope Impact Analysis
                <span className="ml-2 normal-case tracking-normal text-gray-600">
                  (score change when each rope was adjusted)
                </span>
              </h4>
              {data.settingsCorrelation.length > 0 ? (
                <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                  {data.settingsCorrelation.map(rope => {
                    const label = ROPE_LABELS[rope.rope] || rope.rope;
                    const maxDelta = Math.max(...data.settingsCorrelation.map(r => Math.abs(r.avg_delta)), 1);
                    const barWidth = Math.abs(rope.avg_delta) / maxDelta * 50;
                    return (
                      <div key={rope.rope} className="px-3 py-2.5">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-mono text-gray-300 flex-1 truncate" title={label}>
                            {label}
                          </span>
                          <span className={`text-xs font-mono font-bold ${
                            rope.avg_delta > 0 ? 'text-green-400' :
                            rope.avg_delta < 0 ? 'text-red-400' :
                            'text-gray-500'
                          }`}>
                            {rope.avg_delta > 0 ? '+' : ''}{rope.avg_delta}
                          </span>
                          <span className="text-xs font-mono text-gray-500 min-w-[3rem] text-right">
                            {rope.success_rate}% up
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden relative">
                            {/* Center line */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
                            {/* Delta bar */}
                            <div
                              className={`absolute top-0 bottom-0 rounded-full ${deltaBarColor(rope.avg_delta)}`}
                              style={{
                                left: rope.avg_delta >= 0 ? '50%' : `${50 - barWidth}%`,
                                width: `${barWidth}%`
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono text-gray-600 min-w-[2rem] text-right">
                            n={rope.count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-mono text-gray-600 italic text-center py-4">
                  Need consecutive evaluated iterations with attributed ropes to compute correlations.
                </p>
              )}
            </div>
          )}
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
