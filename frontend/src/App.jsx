import { useState } from 'react';
import EpisodeTracker from './components/kanban/EpisodeTracker';
import ClipDetail from './components/clips/ClipDetail';
import CharacterRegistry from './components/characters/CharacterRegistry';
import ScoreTrendChart from './components/trends/ScoreTrendChart';
import RopeEffectivenessChart from './components/trends/RopeEffectivenessChart';
import CreateProjectModal from './components/forms/CreateProjectModal';
import ProductionQueue from './components/queue/ProductionQueue';
import { useApi } from './hooks/useApi';
import { api } from './api';

const VIEWS = {
  episodes: 'Episode Tracker',
  characters: 'Character Registry',
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
            </>
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
