import { useState } from 'react';
import { api } from '../../api';

/**
 * ForkModal — create a new branch by forking from the current iteration.
 * Copies all settings, optionally with a new seed.
 *
 * Props:
 *   iteration — source iteration to fork from
 *   clipId    — parent clip ID
 *   onForked  — callback({ branch, iteration }) after successful fork
 *   onClose   — close the modal
 */
export default function ForkModal({ iteration, clipId, onForked, onClose }) {
  const [useSameSeed, setUseSameSeed] = useState(true);
  const [newSeed, setNewSeed] = useState('');
  const [name, setName] = useState('');
  const [forking, setForking] = useState(false);
  const [error, setError] = useState(null);

  const currentSeed = iteration.seed_used || iteration.json_contents?.seed;

  const handleFork = async () => {
    setForking(true);
    setError(null);
    try {
      const data = {
        source_iteration_id: iteration.id
      };
      if (!useSameSeed && newSeed.trim()) {
        data.seed = parseInt(newSeed.trim());
        if (isNaN(data.seed)) {
          setError('Seed must be a number');
          setForking(false);
          return;
        }
      }
      if (name.trim()) {
        data.name = name.trim();
      }

      const result = await api.forkBranch(clipId, data);
      onForked(result);
    } catch (err) {
      setError(err.message);
      setForking(false);
    }
  };

  const generateRandomSeed = () => {
    setNewSeed(String(Math.floor(Math.random() * 2147483647)));
    setUseSameSeed(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-raised border border-gray-700 rounded-lg w-[420px]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold">Fork Branch</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Source info */}
          <div className="bg-surface rounded border border-gray-700 px-3 py-2">
            <p className="text-xs font-mono text-gray-500">Forking from</p>
            <p className="text-sm font-mono text-gray-200">
              Iteration #{iteration.iteration_number} — Seed {currentSeed}
            </p>
            {iteration.evaluation?.scores?.grand_total && (
              <p className="text-xs font-mono text-gray-400 mt-0.5">Score: {iteration.evaluation.scores.grand_total}/75</p>
            )}
          </div>

          <p className="text-xs font-mono text-gray-500">
            Creates a new branch starting from this iteration's settings.
            All prompts, guidance values, and LoRA configuration will be copied.
          </p>

          {/* Seed selection */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-gray-500 block">Seed</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUseSameSeed(true)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                  useSameSeed
                    ? 'bg-accent text-black font-bold'
                    : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
                }`}
              >
                Same seed ({currentSeed})
              </button>
              <button
                type="button"
                onClick={() => setUseSameSeed(false)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                  !useSameSeed
                    ? 'bg-accent text-black font-bold'
                    : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
                }`}
              >
                New seed
              </button>
            </div>
            {!useSameSeed && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSeed}
                  onChange={(e) => setNewSeed(e.target.value)}
                  placeholder="Enter seed number..."
                  className="flex-1 bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                />
                <button
                  type="button"
                  onClick={generateRandomSeed}
                  className="px-3 py-1.5 bg-surface-overlay text-gray-400 hover:text-gray-200 text-xs font-mono rounded transition-colors"
                >
                  Random
                </button>
              </div>
            )}
          </div>

          {/* Branch name */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Branch Name <span className="text-gray-700">(optional)</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`seed-${useSameSeed ? currentSeed : (newSeed || '...')}`}
              className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
            />
          </div>

          {error && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button
              onClick={handleFork}
              disabled={forking || (!useSameSeed && !newSeed.trim())}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
            >
              {forking ? 'Forking...' : 'Fork Branch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
