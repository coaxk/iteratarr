import { useState } from 'react';
import { api } from '../../api';
import { useCharacters } from '../../hooks/useQueries';

export default function CreateClipModal({ onCreated, onClose }) {
  const { data: characters, isLoading: charsLoading } = useCharacters();

  const [name, setName] = useState('');
  const [scene, setScene] = useState('');
  const [selectedChars, setSelectedChars] = useState([]);
  const [location, setLocation] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggleChar = (triggerWord) => {
    setSelectedChars(prev =>
      prev.includes(triggerWord) ? prev.filter(c => c !== triggerWord) : [...prev, triggerWord]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      // Create a default scene from the text input (or use a placeholder)
      // This maintains backward compatibility with the scene_id requirement
      // until clip-first simplification removes it entirely
      let sceneId;
      const sceneName = scene.trim() || name.trim();
      try {
        // Try to find existing project, or create one
        const projects = await api.listProjects();
        let projectId;
        if (projects.length > 0) {
          projectId = projects[0].id;
        } else {
          const project = await api.createProject({ name: 'Default Project' });
          projectId = project.id;
        }
        const sceneRecord = await api.createScene(projectId, { name: sceneName });
        sceneId = sceneRecord.id;
      } catch {
        // Scene creation failed — use a placeholder
        setError('Failed to create scene record');
        setSubmitting(false);
        return;
      }

      const clip = await api.createClip({
        name: name.trim(),
        scene_id: sceneId,
        characters: selectedChars,
        location: location.trim() || undefined,
        goal: goal.trim() || undefined
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
              placeholder="e.g. Clip 1e - Mick Balcony"
              autoFocus
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Scene <span className="text-gray-700">(optional)</span></label>
            <input
              type="text"
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="e.g. Monaco Harbour, Episode 1"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
            <p className="text-xs font-mono text-gray-600 mt-1">Context for this clip — used for file organization</p>
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Characters</label>
            {charsLoading ? (
              <p className="text-xs font-mono text-gray-600">Loading characters...</p>
            ) : characters && characters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {characters.map(ch => {
                  const isSelected = selectedChars.includes(ch.trigger_word);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChar(ch.trigger_word)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                        isSelected
                          ? 'bg-accent text-black font-bold'
                          : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {ch.name} <span className="text-gray-500">{ch.trigger_word}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs font-mono text-gray-600">No characters in registry. You can add them later.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Monaco Balcony"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Creative Brief <span className="text-gray-700">(optional)</span></label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What does 'done' look like? Action, mood, must-avoid..."
              rows={3}
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y"
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
            <button type="submit" disabled={!name.trim() || submitting}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Clip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
