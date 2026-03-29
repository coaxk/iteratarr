import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import EpisodeTracker from './components/kanban/EpisodeTracker';
import ClipDetail from './components/clips/ClipDetail';
import CharacterRegistry from './components/characters/CharacterRegistry';
import ScoreTrendChart from './components/trends/ScoreTrendChart';
import RopeEffectivenessChart from './components/trends/RopeEffectivenessChart';
import ParameterScatterChart from './components/trends/ParameterScatterChart';
import CreateProjectModal from './components/forms/CreateProjectModal';
import ProductionQueue from './components/queue/ProductionQueue';
import QueueManager from './components/queue/QueueManager';
import TemplateLibrary from './components/templates/TemplateLibrary';
import RenderStatus from './components/render/RenderStatus';
import GpuStatus from './components/gpu/GpuStatus';

import { useAutoRender } from './hooks/useAutoRender';
import { useQueueStatus, useClips } from './hooks/useQueries';
import { api } from './api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

const VIEWS = {
  episodes: 'Episode Tracker',
  queue: 'Queue Manager',
  characters: 'Character Registry',
  templates: 'Templates',
  trends: 'Score Trends'
};

function TrendsView() {
  const { data: clips, isLoading: clipsLoading } = useClips();
  const [selectedClipId, setSelectedClipId] = useState(null);
  const { data: iterations, isLoading: itersLoading } = useQuery({
    queryKey: ['iterations', selectedClipId],
    queryFn: () => api.getClipIterations(selectedClipId),
    enabled: !!selectedClipId,
    staleTime: 15000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Score Trends</h2>
        <p className="text-xs font-mono text-gray-600 mb-3">Track scoring progress, rope effectiveness, and parameter correlations across iterations.</p>
        <label className="text-xs font-mono text-gray-500 block mb-1">Select Clip</label>
        <select
          value={selectedClipId || ''}
          onChange={(e) => setSelectedClipId(e.target.value || null)}
          className="bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 w-72"
        >
          <option value="">Choose a clip...</option>
          {!clipsLoading && (clips || []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {selectedClipId && (
        itersLoading
          ? <p className="text-gray-500 font-mono text-sm">Loading iterations...</p>
          : <>
              <ScoreTrendChart iterations={iterations || []} />
              <div className="mt-6">
                <RopeEffectivenessChart iterations={iterations || []} />
              </div>
              <div className="mt-6 border border-gray-700 rounded-lg p-4">
                <ParameterScatterChart iterations={iterations || []} />
              </div>
            </>
      )}
    </div>
  );
}

function TelemetryToggle() {
  const [enabled, setEnabled] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTelemetryStatus()
      .then(status => { setEnabled(status.enabled); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    const newState = !enabled;
    if (newState && !showInfo) {
      // First time enabling — show explanation
      setShowInfo(true);
      return;
    }
    try {
      const result = await api.toggleTelemetry(newState);
      setEnabled(result.enabled);
      setShowInfo(false);
    } catch {
      // Toggle failed — keep current state
    }
  };

  const confirmEnable = async () => {
    try {
      const result = await api.toggleTelemetry(true);
      setEnabled(result.enabled);
      setShowInfo(false);
    } catch {
      setShowInfo(false);
    }
  };

  if (loading) return null;

  return (
    <div className="px-3 py-2 border-t border-gray-700">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between text-xs font-mono text-gray-500 hover:text-gray-400 transition-colors"
      >
        <span>Telemetry: {enabled ? 'On' : 'Off'}</span>
        <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
      </button>
      {showInfo && (
        <div className="mt-2 p-2 rounded bg-surface text-xs text-gray-400 font-mono">
          <p className="mb-2">Anonymous usage data helps improve recommendations for the community. No prompts, paths, or personal data collected.</p>
          <div className="flex gap-2">
            <button onClick={confirmEnable} className="px-2 py-1 rounded bg-accent text-black text-xs font-bold">Enable</button>
            <button onClick={() => setShowInfo(false)} className="px-2 py-1 rounded bg-surface-overlay text-gray-400 text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueBadge({ active }) {
  const { data: counts } = useQueueStatus();
  if (!counts) return null;
  const { queued, rendering, failed } = counts.counts || {};
  const total = (queued || 0) + (rendering || 0);
  if (total === 0 && !failed) return null;
  return (
    <span className="flex items-center gap-1">
      {total > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${active ? 'bg-black/20 text-black' : 'bg-accent/20 text-accent'}`}>{total}</span>}
      {failed > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400">!</span>}
    </span>
  );
}

function AutoRenderToggle() {
  const { autoRender, toggleAutoRender } = useAutoRender();

  return (
    <div className="px-3 py-2 border-t border-gray-700">
      <button
        onClick={toggleAutoRender}
        className="w-full flex items-center justify-between text-xs font-mono text-gray-500 hover:text-gray-400 transition-colors"
        title="When enabled, generated iterations are automatically submitted to Wan2GP for rendering"
      >
        <span>Auto-Render: {autoRender ? 'On' : 'Off'}</span>
        <span className={`w-2 h-2 rounded-full ${autoRender ? 'bg-accent' : 'bg-gray-600'}`} />
      </button>
    </div>
  );
}

function AppContent() {
  const [view, setView] = useState('episodes');
  const [selectedClip, setSelectedClip] = useState(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [hasUnsavedScores, setHasUnsavedScores] = useState(false);

  const guardedNavigate = (action) => {
    if (hasUnsavedScores && !window.confirm('You have unsaved Vision API scores. Leave without saving?')) return;
    setHasUnsavedScores(false);
    action();
  };

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-200">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 bg-surface-raised border-b border-gray-700">
        <h1 className="text-accent font-mono font-bold tracking-wide text-lg">ITERATARR</h1>
        <span className="text-gray-500 text-xs font-mono">v0.1.0</span>
      </header>

      {/* Three panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — Navigation */}
        <aside className="w-56 bg-surface-raised border-r border-gray-700 flex flex-col">
          <nav className="p-3 space-y-1">
            {Object.entries(VIEWS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => guardedNavigate(() => { setView(key); setSelectedClip(null); })}
                className={`w-full text-left px-3 py-2 rounded text-sm font-mono transition-colors flex items-center justify-between ${
                  view === key ? 'bg-accent text-black font-bold' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-overlay'
                }`}
              >
                <span>{label}</span>
                {key === 'queue' && <QueueBadge active={view === key} />}
              </button>
            ))}
          </nav>

          {/* Create Project button */}
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowCreateProject(true)}
              className="w-full px-3 py-2 text-sm font-mono rounded bg-surface-overlay text-gray-400 hover:text-gray-200 hover:bg-surface transition-colors"
            >
              + New Project
            </button>
          </div>

          {/* Render status + Telemetry toggle — pushed to bottom of sidebar */}
          <div className="mt-auto">
            <GpuStatus />
            <RenderStatus />
            <AutoRenderToggle />
            <TelemetryToggle />
          </div>
        </aside>

        {/* Centre panel — Main content */}
        <main className="flex-1 overflow-auto p-4">
          {view === 'episodes' && !selectedClip && (
            <EpisodeTracker onSelectClip={(clip) => setSelectedClip(clip)} />
          )}
          {view === 'episodes' && selectedClip && (
            <ClipDetail clip={selectedClip} onBack={() => guardedNavigate(() => setSelectedClip(null))} onUnsavedScoresChange={setHasUnsavedScores} />
          )}
          {view === 'queue' && <QueueManager />}
          {view === 'characters' && <CharacterRegistry onNavigateToClip={(clip) => { setSelectedClip(clip); setView('episodes'); }} />}
          {view === 'templates' && <TemplateLibrary />}
          {view === 'trends' && <TrendsView />}
        </main>

        {/* Right panel — Production Queue */}
        <aside className="w-64 bg-surface-raised border-l border-gray-700 p-3 overflow-y-auto">
          <ProductionQueue onNavigateToQueue={() => { setView('queue'); setSelectedClip(null); }} />
        </aside>
      </div>

      {/* Create Project Modal */}
      {showCreateProject && (
        <CreateProjectModal
          onCreated={() => setShowCreateProject(false)}
          onClose={() => setShowCreateProject(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
