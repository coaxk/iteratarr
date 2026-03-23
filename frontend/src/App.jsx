import { useState, useEffect } from 'react';
import EpisodeTracker from './components/kanban/EpisodeTracker';
import ClipDetail from './components/clips/ClipDetail';
import CharacterRegistry from './components/characters/CharacterRegistry';
import ScoreTrendChart from './components/trends/ScoreTrendChart';
import RopeEffectivenessChart from './components/trends/RopeEffectivenessChart';
import ParameterScatterChart from './components/trends/ParameterScatterChart';
import CreateProjectModal from './components/forms/CreateProjectModal';
import ProductionQueue from './components/queue/ProductionQueue';
import TemplateLibrary from './components/templates/TemplateLibrary';
import RenderStatus from './components/render/RenderStatus';
import { useApi } from './hooks/useApi';
import { api } from './api';

const VIEWS = {
  episodes: 'Episode Tracker',
  characters: 'Character Registry',
  templates: 'Templates',
  trends: 'Score Trends'
};

function TrendsView() {
  const { data: clips, loading: clipsLoading } = useApi(() => api.listClips(), []);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const { data: iterations, loading: itersLoading } = useApi(
    () => selectedClipId ? api.getClipIterations(selectedClipId) : Promise.resolve([]),
    [selectedClipId]
  );

  return (
    <div className="space-y-4">
      <div>
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

export default function App() {
  const [view, setView] = useState('episodes');
  const [selectedClip, setSelectedClip] = useState(null);
  const [showCreateProject, setShowCreateProject] = useState(false);

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
                onClick={() => { setView(key); setSelectedClip(null); }}
                className={`w-full text-left px-3 py-2 rounded text-sm font-mono transition-colors ${
                  view === key ? 'bg-accent text-black font-bold' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-overlay'
                }`}
              >
                {label}
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
            <RenderStatus />
            <TelemetryToggle />
          </div>
        </aside>

        {/* Centre panel — Main content */}
        <main className="flex-1 overflow-auto p-4">
          {view === 'episodes' && !selectedClip && (
            <EpisodeTracker onSelectClip={(clip) => setSelectedClip(clip)} />
          )}
          {view === 'episodes' && selectedClip && (
            <ClipDetail clip={selectedClip} onBack={() => setSelectedClip(null)} />
          )}
          {view === 'characters' && <CharacterRegistry />}
          {view === 'templates' && <TemplateLibrary />}
          {view === 'trends' && <TrendsView />}
        </main>

        {/* Right panel — Production Queue */}
        <aside className="w-64 bg-surface-raised border-l border-gray-700 p-3 overflow-y-auto">
          <ProductionQueue />
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
