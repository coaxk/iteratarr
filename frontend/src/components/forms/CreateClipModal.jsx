import { useState } from 'react';
import { api } from '../../api';
import { useApi } from '../../hooks/useApi';

export default function CreateClipModal({ onCreated, onClose }) {
  const { data: projects, loading: projLoading } = useApi(() => api.listProjects(), []);

  // Auto-select first project, then load its scenes
  const firstProjectId = (!projLoading && projects?.length) ? projects[0].id : null;
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const projectId = selectedProjectId || firstProjectId;

  const { data: project, loading: sceneLoading } = useApi(
    () => projectId ? api.getProject(projectId) : Promise.resolve(null),
    [projectId]
  );
  const scenes = project?.scenes || [];

  const [name, setName] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [characters, setCharacters] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !sceneId) return;

    setSubmitting(true);
    setError(null);
    try {
      const charArray = characters
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      const clip = await api.createClip({
        name: name.trim(),
        scene_id: sceneId,
        characters: charArray,
        location: location.trim() || undefined
      });
      onCreated(clip);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-raised border border-gray-700 rounded-lg w-[480px]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold">New Clip</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Clip Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. KS_EP01_SC03_CLIP02"
              autoFocus
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Scene</label>
            {(projLoading || sceneLoading) ? (
              <p className="text-xs font-mono text-gray-600">Loading scenes...</p>
            ) : scenes.length === 0 ? (
              <p className="text-xs font-mono text-gray-600">No scenes found. Create a scene first.</p>
            ) : (
              <select
                value={sceneId}
                onChange={(e) => setSceneId(e.target.value)}
                className="w-full bg-surface border border-gray-600 rounded px-2 py-2 text-sm font-mono text-gray-200"
              >
                <option value="">Select a scene...</option>
                {scenes.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.scene_number ? `Scene ${s.scene_number}` : s.id} {s.description ? `- ${s.description}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Characters</label>
            <input
              type="text"
              value={characters}
              onChange={(e) => setCharacters(e.target.value)}
              placeholder="e.g. Kebbin, Luna, Sable"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
            <p className="text-xs font-mono text-gray-600 mt-1">Comma-separated names</p>
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Workshop interior"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
          </div>

          {error && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || !sceneId || submitting}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Clip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
