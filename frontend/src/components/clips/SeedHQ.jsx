import { useState, useMemo, memo } from 'react';
import { useClipIterations, useSeedThumbnails } from '../../hooks/useQueries';
import { useSeedAnalytics } from '../../hooks/useQueries';
import { BRANCH_STATUSES, GRAND_MAX } from '../../constants';

/**
 * SeedHQ — the clip's home screen. Shows the full seed→branch→iteration tree
 * at a glance. Replaces the flat tab model with a roots-to-leaves overview.
 *
 * Props:
 *   clip — clip record
 *   branches — branch records for this clip
 *   seedScreens — seed screen records for this clip
 *   onEnterBranch(branchId) — drill into a branch's iteration view
 *   onGenerateSeeds() — open seed generation flow
 *   onRefresh() — trigger data refetch
 */

const TrendPill = memo(function TrendPill({ trend }) {
  if (!trend) return null;
  const config = {
    rising:    { style: 'bg-green-400/15 text-green-400 border-green-400/30', label: '↗ Rising', tip: 'Scores trending up — momentum is building' },
    plateau:   { style: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30', label: '→ Plateau', tip: 'Scores have levelled off — try a different rope' },
    declining: { style: 'bg-red-400/15 text-red-400 border-red-400/30', label: '↘ Declining', tip: 'Scores dropping — consider pruning or forking' },
    fresh:     { style: 'bg-blue-400/15 text-blue-400 border-blue-400/30', label: '• Fresh', tip: 'Too early to call — needs more iterations' },
  };
  const c = config[trend];
  if (!c) return null;
  return <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border shrink-0 cursor-help ${c.style}`} title={c.tip}>{c.label}</span>;
});

const ScoreBadge = memo(function ScoreBadge({ score }) {
  if (score == null) return null;
  const pct = score / GRAND_MAX;
  const color = pct >= 0.85 ? 'text-green-400 bg-green-400/10' :
                pct >= 0.65 ? 'text-accent bg-accent/10' :
                pct >= 0.5  ? 'text-yellow-400 bg-yellow-400/10' :
                              'text-gray-400 bg-gray-400/10';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${color}`}>{score}/{GRAND_MAX}</span>;
});

/**
 * BranchTree — recursive tree renderer for branches.
 * Builds parent→child relationships via source_branch_id and renders with indentation.
 */
function BranchTree({ branches, allBranches, onEnter, onManage, branchTrends, mostRecentBranchId, parentId = null, depth = 0 }) {
  // Find branches at this level: root branches (no source or source outside this seed) when parentId=null,
  // or children of parentId
  const atThisLevel = parentId === null
    ? branches.filter(b => !b.source_branch_id || !branches.find(p => p.id === b.source_branch_id))
    : branches.filter(b => b.source_branch_id === parentId);

  if (atThisLevel.length === 0) return null;

  // Sort root-level branches by best score (strongest first), keep fork children in creation order
  const sorted = parentId === null
    ? [...atThisLevel].sort((a, b) => (b.best_score || 0) - (a.best_score || 0))
    : atThisLevel;

  return sorted.map(branch => {
    const children = branches.filter(b => b.source_branch_id === branch.id);
    return (
      <BranchNode
        key={branch.id}
        branch={branch}
        children={children}
        allBranches={allBranches || branches}
        branches={branches}
        onEnter={onEnter}
        onManage={onManage}
        branchTrends={branchTrends}
        mostRecentBranchId={mostRecentBranchId}
        depth={depth}
      />
    );
  });
}

const BranchNode = memo(function BranchNode({ branch, children, allBranches, branches, onEnter, onManage, branchTrends, mostRecentBranchId, depth }) {
  const [collapsed, setCollapsed] = useState(false);
  const statusInfo = BRANCH_STATUSES[branch.status] || BRANCH_STATUSES.active;
  const isFork = branch.created_from === 'fork';
  const hasChildren = children.length > 0;
  const isMostRecent = branch.id === mostRecentBranchId;

  const trend = branchTrends[branch.id] || null;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-overlay transition-colors group ${
          branch.status === 'abandoned' || branch.status === 'superseded' ? 'opacity-40' :
          branch.status === 'stalled' ? 'opacity-60' : ''
        } ${isMostRecent ? 'border-l-2 border-accent bg-accent/5' : ''}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {/* Expand/collapse for branches with children */}
        {hasChildren ? (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-4 h-4 flex items-center justify-center text-xs font-mono text-gray-500 hover:text-accent shrink-0"
          >
            {collapsed ? '+' : '\u2212'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Tree connector line for forks */}
        {depth > 0 && (
          <span className="text-purple-400/40 text-xs shrink-0">{'\u2514'}</span>
        )}

        {/* Fork indicator at root level (cross-seed fork) */}
        {depth === 0 && isFork && (
          <span className="text-purple-400 text-xs shrink-0">&#9826;</span>
        )}

        {/* Status dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.dotColor || 'bg-green-500'}`} />

        {/* Branch name */}
        <button
          onClick={() => onEnter(branch.id)}
          className="text-sm font-mono text-gray-200 hover:text-accent transition-colors truncate text-left flex-1 min-w-0"
          title={`Enter branch: ${branch.name}`}
        >
          {branch.name || `seed-${branch.seed}`}
        </button>

        {/* Iteration count */}
        <span className="text-xs font-mono text-gray-600 shrink-0">
          {branch.iteration_count || 0} iter{(branch.iteration_count || 0) !== 1 ? 's' : ''}
        </span>

        {/* Best score */}
        <ScoreBadge score={branch.best_score} />

        {/* Trend indicator */}
        <TrendPill trend={trend} />

        {/* Status label */}
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${statusInfo.bgColor || 'bg-gray-600'} ${statusInfo.textColor || 'text-gray-300'}`}>
          {statusInfo.label}
        </span>

        {/* Fork origin — show source branch for forks */}
        {isFork && branch.source_branch_id && (() => {
          const source = allBranches?.find(b => b.id === branch.source_branch_id);
          if (!source) return null;
          return (
            <span className="text-[10px] font-mono text-purple-400/30 group-hover:text-purple-400/60 shrink-0 transition-colors">
              from {source.name || `seed-${source.seed}`}
            </span>
          );
        })()}

        {/* Enter arrow */}
        <button
          onClick={() => onEnter(branch.id)}
          className="text-gray-700 group-hover:text-accent text-sm font-mono shrink-0 transition-colors"
        >
          &rarr;
        </button>

        {/* Manage */}
        <button
          onClick={() => onManage(branch.id)}
          className="text-gray-800 group-hover:text-gray-500 text-xs font-mono shrink-0 transition-colors"
          title="Manage branch"
        >
          &#9881;
        </button>
      </div>

      {/* Recursive children */}
      {hasChildren && !collapsed && (
        <BranchTree
          branches={branches}
          allBranches={allBranches}
          onEnter={onEnter}
          onManage={onManage}
          branchTrends={branchTrends}
          mostRecentBranchId={mostRecentBranchId}
          parentId={branch.id}
          depth={depth + 1}
        />
      )}
    </div>
  );
});

function SeedGroupThumbnail({ thumbnail }) {
  if (thumbnail?.url) {
    return <img src={thumbnail.url} alt="Seed thumbnail" className="h-12 w-auto rounded border border-gray-700 shrink-0" />;
  }
  return (
    <div className="h-12 w-16 rounded border border-gray-700 bg-surface flex items-center justify-center shrink-0">
      <span className="text-xs font-mono text-gray-700">?</span>
    </div>
  );
}

function SeedGroup({ seed, branches, seedScreen, thumbnail, onEnterBranch, onManageBranch, onLaunchBranch, onOpenSeedProfile, allBranches, branchTrends, mostRecentBranchId }) {
  const hasBranches = branches.length > 0;
  const rating = seedScreen?.rating;

  // Best score across all branches for this seed
  const bestScore = branches.reduce((max, b) => Math.max(max, b.best_score || 0), 0) || null;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Seed header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-raised">
        {/* Thumbnail — auto-extracts from seed screen render or branch iteration */}
        <SeedGroupThumbnail thumbnail={thumbnail} />

        {/* Seed number */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-200 font-bold">Seed {seed}</span>
            {bestScore && <ScoreBadge score={bestScore} />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Star rating */}
            {rating != null && (
              <span className="text-xs font-mono text-accent">
                {'&#9733;'.repeat(rating)}{'&#9734;'.repeat(5 - rating)}
              </span>
            )}
            <span className="text-xs font-mono text-gray-600">
              {branches.length} branch{branches.length !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenSeedProfile(seed)}
            className="px-2 py-1 text-xs font-mono text-gray-500 hover:text-accent transition-colors"
            title="Open seed intelligence profile"
          >
            Profile
          </button>
          {!hasBranches && (
            <button
              onClick={() => onLaunchBranch(seed)}
              className="px-3 py-1 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
            >
              Launch Branch
            </button>
          )}
          <button
            onClick={async () => { await navigator.clipboard.writeText(String(seed)); }}
            className="px-2 py-1 text-xs font-mono text-gray-600 hover:text-gray-300 transition-colors"
            title="Copy seed"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Branch tree under this seed */}
      {hasBranches && (
        <div className="border-t border-gray-700/50">
          <BranchTree
            branches={branches}
            allBranches={allBranches}
            onEnter={onEnterBranch}
            onManage={onManageBranch}
            branchTrends={branchTrends}
            mostRecentBranchId={mostRecentBranchId}
          />
        </div>
      )}
    </div>
  );
}

/** Compute branch trend from score history: 'rising' | 'plateau' | 'declining' | 'fresh' | null */
function computeTrend(scores) {
  if (!scores || scores.length < 2) return scores?.length === 1 ? 'fresh' : null;
  const recent = scores.slice(-3);
  if (recent.length < 2) return 'fresh';
  const deltas = [];
  for (let i = 1; i < recent.length; i++) deltas.push(recent[i] - recent[i - 1]);
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  if (avgDelta > 2) return 'rising';
  if (avgDelta < -2) return 'declining';
  return 'plateau';
}

const TREND_DISPLAY = {
  rising:    { icon: '\u2197', color: 'text-green-400', label: 'Rising' },
  plateau:   { icon: '\u2192', color: 'text-yellow-400', label: 'Plateau' },
  declining: { icon: '\u2198', color: 'text-red-400', label: 'Declining' },
  fresh:     { icon: '\u2022', color: 'text-blue-400', label: 'Fresh' },
};

export default function SeedHQ({ clip, branches, seedScreens, onEnterBranch, onGenerateSeeds, onRefresh, onManageBranch, onLaunchBranch, onNavigateToAnalytics }) {
  const [profileSeed, setProfileSeed] = useState(null);
  // Fetch ALL iterations for this clip to compute branch trends
  // Shared with ClipDetail via TanStack Query dedup (same queryKey)
  const { data: allIterations } = useClipIterations(clip.id);
  const {
    data: seedProfile,
    isLoading: seedProfileLoading,
    isError: seedProfileError,
    refetch: refetchSeedProfile
  } = useSeedAnalytics(profileSeed, { enabled: profileSeed != null });
  const { data: thumbnailsData } = useSeedThumbnails(clip.id);
  const thumbnailsBySeed = useMemo(() => {
    const map = {};
    for (const entry of (thumbnailsData?.seeds || [])) {
      map[String(entry.seed)] = entry.thumbnail || null;
    }
    return map;
  }, [thumbnailsData]);

  const branchTrends = useMemo(() => {
    const scoreSeriesByBranch = {};
    for (const iteration of (allIterations || [])) {
      const score = iteration?.evaluation?.scores?.grand_total;
      if (iteration.branch_id == null || score == null) continue;
      if (!scoreSeriesByBranch[iteration.branch_id]) scoreSeriesByBranch[iteration.branch_id] = [];
      scoreSeriesByBranch[iteration.branch_id].push({
        iteration_number: iteration.iteration_number,
        score
      });
    }
    const trends = {};
    for (const [branchId, points] of Object.entries(scoreSeriesByBranch)) {
      const scores = points
        .sort((a, b) => a.iteration_number - b.iteration_number)
        .map(point => point.score);
      trends[branchId] = computeTrend(scores);
    }
    return trends;
  }, [allIterations]);

  // Find most recently worked on branch
  const mostRecentBranchId = useMemo(() => (
    branches?.length > 0
      ? [...branches]
          .filter(b => b.status === 'active')
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.id
      : null
  ), [branches]);

  const seedMap = useMemo(() => {
    const map = {};
    if (seedScreens) {
      for (const ss of seedScreens) {
        const seed = ss.seed;
        if (!map[seed]) map[seed] = { seed, branches: [], seedScreen: ss };
        else map[seed].seedScreen = ss;
      }
    }
    if (branches) {
      for (const branch of branches) {
        const seed = branch.seed;
        if (seed === -1 || seed === '-1') continue;
        if (!map[seed]) map[seed] = { seed, branches: [], seedScreen: null };
        map[seed].branches.push(branch);
      }
    }
    return map;
  }, [branches, seedScreens]);

  const seedGroups = useMemo(() => (
    Object.values(seedMap).sort((a, b) => {
      const aScore = a.branches.reduce((max, br) => Math.max(max, br.best_score || 0), 0);
      const bScore = b.branches.reduce((max, br) => Math.max(max, br.best_score || 0), 0);
      if (bScore !== aScore) return bScore - aScore;
      if (b.branches.length !== a.branches.length) return b.branches.length - a.branches.length;
      return 0;
    })
  ), [seedMap]);

  const totalBranches = branches?.length || 0;
  const totalSeeds = Object.keys(seedMap).length;
  const activeBranches = (branches || []).filter(b => b.status === 'active').length;
  const clipProfile = seedProfile?.clips?.find(c => c.clip_id === clip.id) || null;

  return (
    <div className="space-y-3">
      {/* HQ header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Seed HQ</h3>
          <span className="text-xs font-mono text-gray-600">
            {totalSeeds} seed{totalSeeds !== 1 ? 's' : ''} &middot; {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} &middot; {activeBranches} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToAnalytics && (
            <button
              onClick={onNavigateToAnalytics}
              className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 rounded transition-colors"
              title="Open cross-clip analytics dashboard"
            >
              Analytics
            </button>
          )}
          <button
            onClick={onGenerateSeeds}
            className="px-3 py-1.5 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
          >
            + Generate Seeds
          </button>
        </div>
      </div>
      <p className="text-[11px] font-mono text-gray-600">
        Branch trend pills (`Rising/Plateau/Declining/Fresh`) appear on each branch row once scored iterations exist.
      </p>

      {/* Empty state */}
      {seedGroups.length === 0 && (
        <div className="border border-dashed border-gray-700 rounded-lg p-8 text-center">
          <p className="text-sm font-mono text-gray-400 mb-2">No seeds yet</p>
          <p className="text-xs font-mono text-gray-600 mb-4">Generate seeds to start screening and branching.</p>
          <button
            onClick={onGenerateSeeds}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90"
          >
            Generate First Seeds
          </button>
        </div>
      )}

      {/* Seed profile panel */}
      {profileSeed != null && (
        <div className="border border-gray-700 rounded-lg p-3 bg-surface-raised space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">
              Seed Profile: {profileSeed}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => refetchSeedProfile()}
                className="text-xs font-mono text-gray-600 hover:text-gray-300 transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={() => setProfileSeed(null)}
                className="text-xs font-mono text-gray-600 hover:text-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {seedProfileLoading && (
            <p className="text-xs font-mono text-gray-500">Loading seed intelligence...</p>
          )}

          {seedProfileError && (
            <p className="text-xs font-mono text-red-400">Failed to load seed profile.</p>
          )}

          {!seedProfileLoading && !seedProfileError && seedProfile && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <div className="border border-gray-700 rounded px-2 py-1.5 font-mono">
                  <div className="text-[10px] text-gray-500 uppercase">Best</div>
                  <div className="text-sm text-accent font-bold">{seedProfile.summary?.best_score ?? '—'}</div>
                </div>
                <div className="border border-gray-700 rounded px-2 py-1.5 font-mono">
                  <div className="text-[10px] text-gray-500 uppercase">Avg</div>
                  <div className="text-sm text-gray-300 font-bold">{seedProfile.summary?.avg_score ?? '—'}</div>
                </div>
                <div className="border border-gray-700 rounded px-2 py-1.5 font-mono">
                  <div className="text-[10px] text-gray-500 uppercase">Eval</div>
                  <div className="text-sm text-gray-300 font-bold">{seedProfile.summary?.evaluated_count ?? 0}</div>
                </div>
                <div className="border border-gray-700 rounded px-2 py-1.5 font-mono">
                  <div className="text-[10px] text-gray-500 uppercase">Branches</div>
                  <div className="text-sm text-gray-300 font-bold">{seedProfile.summary?.branch_count ?? 0}</div>
                </div>
                <div className="border border-gray-700 rounded px-2 py-1.5 font-mono">
                  <div className="text-[10px] text-gray-500 uppercase">Locked</div>
                  <div className="text-sm text-green-400 font-bold">{seedProfile.summary?.locked_count ?? 0}</div>
                </div>
              </div>

              <div className="border border-gray-700 rounded p-2 bg-surface">
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">This Clip Context</div>
                {clipProfile ? (
                  <div className="text-xs font-mono text-gray-300">
                    {clipProfile.iteration_count} iterations, {clipProfile.evaluated_count} evaluated, best {clipProfile.best_score ?? '—'}
                  </div>
                ) : (
                  <div className="text-xs font-mono text-gray-600">No historical evidence for this seed on this clip yet.</div>
                )}
              </div>

              <div className="border border-gray-700 rounded p-2 bg-surface">
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Recommendation</div>
                <p className="text-xs font-mono text-gray-300">
                  {seedProfile.insights?.recommendation || 'No recommendation yet.'}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="border border-gray-700 rounded p-2 bg-surface">
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Trait Signals</div>
                  {(seedProfile.insights?.trait_signals || []).length === 0 ? (
                    <p className="text-xs font-mono text-gray-600">No strong trait signals yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {seedProfile.insights.trait_signals.slice(0, 3).map(signal => (
                        <div key={signal.key} className="flex items-center justify-between text-xs font-mono border border-gray-800 rounded px-2 py-1">
                          <span className="text-gray-300">{signal.label}</span>
                          <span className="text-amber-400">{signal.prevalence}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-gray-700 rounded p-2 bg-surface">
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Stability</div>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1">
                      <span className="text-gray-400">Grand stddev</span>
                      <span className="text-gray-300">{seedProfile.insights?.stability?.grand_stddev ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1">
                      <span className="text-gray-400">Identity stddev</span>
                      <span className="text-gray-300">{seedProfile.insights?.stability?.identity_stddev ?? '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seed tree */}
      {seedGroups.map(group => (
        <SeedGroup
          key={group.seed}
          seed={group.seed}
          branches={group.branches}
          seedScreen={group.seedScreen}
          thumbnail={thumbnailsBySeed[String(group.seed)]}
          onEnterBranch={onEnterBranch}
          onManageBranch={onManageBranch}
          onLaunchBranch={onLaunchBranch}
          onOpenSeedProfile={setProfileSeed}
          allBranches={branches}
          branchTrends={branchTrends}
          mostRecentBranchId={mostRecentBranchId}
        />
      ))}
    </div>
  );
}
