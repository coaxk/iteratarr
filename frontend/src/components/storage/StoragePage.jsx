import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function SummaryCard({ label, bytes, sublabel }) {
  return (
    <div className="bg-surface-overlay rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-mono font-bold text-gray-100">{formatBytes(bytes)}</span>
      {sublabel && <span className="text-xs font-mono text-gray-500">{sublabel}</span>}
    </div>
  );
}

function StagnantRow({ branch, onHidden }) {
  const queryClient = useQueryClient();
  const [purgedBytes, setPurgedBytes] = useState(null);

  const purgeMutation = useMutation({
    mutationFn: () => api.purgeStorageBranch(branch.branch_id),
    onSuccess: (result) => {
      setPurgedBytes(result.bytes_reclaimed || 0);
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    }
  });

  const keepMutation = useMutation({
    mutationFn: () => api.updateBranch(branch.clip_id, branch.branch_id, { keep_frames_forever: true }),
    onSuccess: () => {
      onHidden(branch.branch_id);
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    }
  });

  if (purgedBytes != null) {
    return (
      <tr className="opacity-60">
        <td colSpan={6} className="px-3 py-2 text-xs font-mono text-green-400">
          {formatBytes(purgedBytes)} reclaimed ✓
        </td>
      </tr>
    );
  }

  const reasonLabel = {
    plateau: 'plateau',
    no_evals: 'no evals',
    idle: 'idle'
  };

  return (
    <tr className="border-t border-gray-700 hover:bg-surface-overlay/50">
      <td className="px-3 py-2 text-xs font-mono text-gray-300">{branch.clip_name || 'Unknown clip'} · seed:{branch.seed}</td>
      <td className="px-3 py-2 text-xs font-mono text-gray-500">{branch.idle_days}d</td>
      <td className="px-3 py-2 text-xs font-mono text-gray-300">{formatBytes(branch.frames_bytes)}</td>
      <td className="px-3 py-2">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-yellow-500/10 text-yellow-400">
          {reasonLabel[branch.stale_reason] || branch.stale_reason}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => purgeMutation.mutate()}
            disabled={purgeMutation.isPending}
            className="text-xs font-mono text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {purgeMutation.isPending ? 'Purging...' : 'Purge'}
          </button>
          <span className="text-gray-600">·</span>
          <button
            onClick={() => keepMutation.mutate()}
            disabled={keepMutation.isPending}
            className="text-xs font-mono text-gray-400 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            {keepMutation.isPending ? 'Saving...' : 'Keep'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function StoragePage() {
  const queryClient = useQueryClient();
  const [hiddenBranches, setHiddenBranches] = useState(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.getStorage(),
    staleTime: 5 * 60 * 1000
  });

  const purgeAllMutation = useMutation({
    mutationFn: async () => {
      const stagnant = data?.stagnant || [];
      let total = 0;
      for (const branch of stagnant) {
        if (hiddenBranches.has(branch.branch_id)) continue;
        try {
          const result = await api.purgeStorageBranch(branch.branch_id);
          total += result.bytes_reclaimed || 0;
        } catch {}
      }
      return { bytes_reclaimed: total };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storage'] })
  });

  if (isLoading) {
    return <div className="p-6 text-xs font-mono text-gray-500">Loading storage data...</div>;
  }

  if (error) {
    return <div className="p-6 text-xs font-mono text-red-400">Failed to load storage data: {error.message}</div>;
  }

  const { summary, stagnant = [], scheduled_purge: scheduled = [], settings = {} } = data || {};
  const visibleStagnant = stagnant.filter(branch => !hiddenBranches.has(branch.branch_id));
  const totalReclaimable = visibleStagnant.reduce((sum, branch) => sum + branch.frames_bytes, 0);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-mono font-bold text-gray-100">Storage</h1>
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            {formatBytes((summary?.frames_bytes || 0) + (summary?.contact_bytes || 0))} total · {formatBytes(summary?.reclaimable_bytes || 0)} reclaimable
          </p>
        </div>
        {visibleStagnant.length > 0 && (
          <button
            onClick={() => purgeAllMutation.mutate()}
            disabled={purgeAllMutation.isPending}
            className="px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {purgeAllMutation.isPending ? 'Purging...' : `Purge all stagnant  ${formatBytes(totalReclaimable)}`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          label="Frames"
          bytes={summary?.frames_bytes}
          sublabel={`${formatBytes(summary?.reclaimable_bytes)} reclaimable`}
        />
        <SummaryCard
          label="Contact Sheets"
          bytes={summary?.contact_bytes}
          sublabel="Permanent record — never purged"
        />
        <div className="bg-surface-overlay rounded-lg p-4 flex flex-col gap-1">
          <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Auto-purge</span>
          <span className="text-sm font-mono text-gray-300">
            {settings?.auto_purge_days ? `After ${settings.auto_purge_days} days idle` : 'Never (default)'}
          </span>
          <span className="text-xs font-mono text-gray-600">Config-driven (Phase 6+ scheduler)</span>
        </div>
      </div>

      {scheduled.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Scheduled for auto-purge</h2>
          <div className="space-y-1">
            {scheduled.map(item => (
              <div key={item.branch_id} className="flex items-center justify-between px-3 py-2 rounded bg-surface-overlay text-xs font-mono">
                <span className="text-gray-300">seed:{item.seed}</span>
                <span className="text-gray-500">purges {new Date(item.purge_date).toLocaleDateString()}</span>
                <span className="text-gray-400">{formatBytes(item.frames_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleStagnant.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
            Stagnant branches — {visibleStagnant.length} with reclaimable frames
          </h2>
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Branch</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Idle</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Frames</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Reason</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStagnant.map(branch => (
                  <StagnantRow
                    key={branch.branch_id}
                    branch={branch}
                    onHidden={(id) => setHiddenBranches(prev => new Set([...prev, id]))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-xs font-mono text-gray-500 py-4">
          Nothing to clean up — all branches are recently active or protected.
        </div>
      )}
    </div>
  );
}

