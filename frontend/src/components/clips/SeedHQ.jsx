import { useState } from 'react';
import { api } from '../../api';
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

function ScoreBadge({ score }) {
  if (score == null) return null;
  const pct = score / GRAND_MAX;
  const color = pct >= 0.85 ? 'text-green-400 bg-green-400/10' :
                pct >= 0.65 ? 'text-accent bg-accent/10' :
                pct >= 0.5  ? 'text-yellow-400 bg-yellow-400/10' :
                              'text-gray-400 bg-gray-400/10';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${color}`}>{score}/{GRAND_MAX}</span>;
}

/**
 * BranchTree — recursive tree renderer for branches.
 * Builds parent→child relationships via source_branch_id and renders with indentation.
 */
function BranchTree({ branches, allBranches, onEnter, onManage, parentId = null, depth = 0 }) {
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
        depth={depth}
      />
    );
  });
}

function BranchNode({ branch, children, allBranches, branches, onEnter, onManage, depth }) {
  const [collapsed, setCollapsed] = useState(false);
  const statusInfo = BRANCH_STATUSES[branch.status] || BRANCH_STATUSES.active;
  const isFork = branch.created_from === 'fork';
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-overlay transition-colors group ${
          branch.status === 'abandoned' || branch.status === 'superseded' ? 'opacity-40' :
          branch.status === 'stalled' ? 'opacity-60' : ''
        }`}
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

        {/* Status label */}
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${statusInfo.bgColor || 'bg-gray-600'} ${statusInfo.textColor || 'text-gray-300'}`}>
          {statusInfo.label}
        </span>

        {/* Fork origin — show source branch for forks */}
        {isFork && branch.source_branch_id && (() => {
          const source = allBranches?.find(b => b.id === branch.source_branch_id);
          if (!source) return null;
          return (
            <span className="text-[10px] font-mono text-purple-400/50 shrink-0 hidden group-hover:inline">
              from {source.name || `seed-${source.seed}`}
            </span>
          );
        })()}

        {/* Enter arrow */}
        <button
          onClick={() => onEnter(branch.id)}
          className="text-gray-600 hover:text-accent text-sm font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          &rarr;
        </button>

        {/* Manage */}
        <button
          onClick={() => onManage(branch.id)}
          className="text-gray-700 hover:text-gray-400 text-xs font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
          parentId={branch.id}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function SeedGroup({ seed, branches, seedScreen, onEnterBranch, onManageBranch, onLaunchBranch, allBranches }) {
  const hasBranches = branches.length > 0;
  const hasFrames = seedScreen?.frames?.length > 0;
  const rating = seedScreen?.rating;
  const firstFrame = hasFrames ? `/api/frames/${seedScreen.id}/${seedScreen.frames[0]}` : null;

  // Best score across all branches for this seed
  const bestScore = branches.reduce((max, b) => Math.max(max, b.best_score || 0), 0) || null;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Seed header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-raised">
        {/* Thumbnail */}
        {firstFrame ? (
          <img src={firstFrame} alt={`Seed ${seed}`} className="h-12 w-auto rounded border border-gray-700 shrink-0" />
        ) : (
          <div className="h-12 w-16 rounded border border-gray-700 bg-surface flex items-center justify-center shrink-0">
            <span className="text-xs font-mono text-gray-700">?</span>
          </div>
        )}

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
          />
        </div>
      )}
    </div>
  );
}

export default function SeedHQ({ clip, branches, seedScreens, onEnterBranch, onGenerateSeeds, onRefresh, onManageBranch, onLaunchBranch }) {
  // Group branches by seed
  const seedMap = {};

  // Add seed screen records first (these are all seeds, including un-branched)
  if (seedScreens) {
    for (const ss of seedScreens) {
      const seed = ss.seed;
      if (!seedMap[seed]) seedMap[seed] = { seed, branches: [], seedScreen: ss };
      else seedMap[seed].seedScreen = ss;
    }
  }

  // Add branches (some seeds may not have seed screens — e.g., forked branches)
  // Filter out legacy seed=-1 migration artifacts
  if (branches) {
    for (const branch of branches) {
      const seed = branch.seed;
      if (seed === -1 || seed === '-1') continue; // Skip legacy migration entries
      if (!seedMap[seed]) seedMap[seed] = { seed, branches: [], seedScreen: null };
      seedMap[seed].branches.push(branch);
    }
  }

  // Sort: seeds with highest best_score first, then by branch count, then seed number
  const seedGroups = Object.values(seedMap).sort((a, b) => {
    const aScore = a.branches.reduce((max, br) => Math.max(max, br.best_score || 0), 0);
    const bScore = b.branches.reduce((max, br) => Math.max(max, br.best_score || 0), 0);
    if (bScore !== aScore) return bScore - aScore;
    if (b.branches.length !== a.branches.length) return b.branches.length - a.branches.length;
    return 0;
  });

  const totalBranches = branches?.length || 0;
  const totalSeeds = Object.keys(seedMap).length;
  const activeBranches = (branches || []).filter(b => b.status === 'active').length;

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
        <button
          onClick={onGenerateSeeds}
          className="px-3 py-1.5 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
        >
          + Generate Seeds
        </button>
      </div>

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

      {/* Seed tree */}
      {seedGroups.map(group => (
        <SeedGroup
          key={group.seed}
          seed={group.seed}
          branches={group.branches}
          seedScreen={group.seedScreen}
          onEnterBranch={onEnterBranch}
          onManageBranch={onManageBranch}
          onLaunchBranch={onLaunchBranch}
          allBranches={branches}
        />
      ))}
    </div>
  );
}
