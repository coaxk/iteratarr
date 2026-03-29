import { useState } from 'react';
import { useOverviewAnalytics } from '../../hooks/useQueries';
import OverviewTab from './OverviewTab';
import CharactersTab from './CharactersTab';
import RopesTab from './RopesTab';
import StallsTab from './StallsTab';
import SeedsTab from './SeedsTab';
import { useSeedsAnalytics } from '../../hooks/useQueries';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'seeds', label: 'Seeds' },
  { id: 'characters', label: 'Characters' },
  { id: 'ropes', label: 'Ropes' },
  { id: 'stalls', label: 'Stalls' },
];

/**
 * CrossClipDashboard — full-screen analytics view.
 * Fetches the /api/analytics/overview payload once and passes it to tab components.
 *
 * Props:
 *   onBack() — return to previous view
 */
export default function CrossClipDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, isLoading, isError, refetch } = useOverviewAnalytics();
  const {
    data: seedsData,
    isLoading: seedsLoading,
    isError: seedsError,
    refetch: refetchSeeds
  } = useSeedsAnalytics({ enabled: activeTab === 'seeds' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 font-mono text-sm">Loading analytics...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm mb-2">Failed to load analytics</p>
          <button onClick={() => refetch()} className="px-3 py-1 text-xs font-mono bg-surface-overlay text-gray-400 rounded hover:text-gray-200">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stallingCount = data.summary?.stalling_count ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← back
          </button>
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Analytics</h2>
        </div>
        <button
          onClick={() => {
            refetch();
            if (activeTab === 'seeds') refetchSeeds();
          }}
          className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-700 mb-4 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-mono transition-colors relative ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.id === 'stalls' && stallingCount > 0 && (
              <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">
                {stallingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && <OverviewTab data={data} onSwitchToStalls={() => setActiveTab('stalls')} />}
        {activeTab === 'seeds' && (
          <SeedsTab
            data={seedsData}
            isLoading={seedsLoading}
            isError={seedsError}
            onRetry={() => refetchSeeds()}
          />
        )}
        {activeTab === 'characters' && <CharactersTab characters={data.characters} />}
        {activeTab === 'ropes' && <RopesTab ropes={data.ropes} />}
        {activeTab === 'stalls' && <StallsTab clips={data.clips} />}
      </div>
    </div>
  );
}
