import { useState, useEffect } from 'react';
import { api } from '../../api';
import FileBrowserModal from './FileBrowserModal';

export default function CreateCharacterModal({ onCreated, onClose }) {
  const [name, setName] = useState('');
  const [triggerWord, setTriggerWord] = useState('');
  const [loraFiles, setLoraFiles] = useState([]);
  const [identityBlock, setIdentityBlock] = useState('');
  const [negativeBlock, setNegativeBlock] = useState('');
  const [guidanceScale, setGuidanceScale] = useState('');
  const [guidance2Scale, setGuidance2Scale] = useState('');
  const [lorasMultipliers, setLorasMultipliers] = useState('');
  const [filmGrainIntensity, setFilmGrainIntensity] = useState('');
  const [filmGrainSaturation, setFilmGrainSaturation] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [loraDir, setLoraDir] = useState(null);

  // Fetch the LoRA directory from config on mount
  useEffect(() => {
    api.getConfigPaths()
      .then(paths => {
        if (paths?.wan2gp_lora_dir) {
          setLoraDir(paths.wan2gp_lora_dir);
        }
      })
      .catch(() => {
        // Non-critical — browser will fall back to default dir
      });
  }, []);

  const handleLoraSelect = (filePath) => {
    // Avoid duplicates
    if (!loraFiles.includes(filePath)) {
      setLoraFiles(prev => [...prev, filePath]);
    }
    setShowBrowser(false);
  };

  const handleLoraRemove = (filePath) => {
    setLoraFiles(prev => prev.filter(f => f !== filePath));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !triggerWord.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const data = {
        name: name.trim(),
        trigger_word: triggerWord.trim(),
        lora_files: loraFiles,
        identity_block: identityBlock.trim() || undefined,
        negative_block: negativeBlock.trim() || undefined,
        notes: notes.trim() || undefined,
        proven_settings: {},
      };

      // Only include proven_settings fields that have values
      if (guidanceScale !== '') data.proven_settings.guidance_scale = parseFloat(guidanceScale);
      if (guidance2Scale !== '') data.proven_settings.guidance2_scale = parseFloat(guidance2Scale);
      if (lorasMultipliers.trim()) data.proven_settings.loras_multipliers = lorasMultipliers.trim();
      if (filmGrainIntensity !== '') data.proven_settings.film_grain_intensity = parseFloat(filmGrainIntensity);
      if (filmGrainSaturation !== '') data.proven_settings.film_grain_saturation = parseFloat(filmGrainSaturation);

      // Remove proven_settings if empty
      if (Object.keys(data.proven_settings).length === 0) {
        delete data.proven_settings;
      }

      const character = await api.createCharacter(data);
      onCreated(character);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  // Extract just the filename from a full path for display
  const fileName = (path) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
        <div
          className="bg-surface-raised border border-gray-700 rounded-lg w-[560px] max-h-[85vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-mono text-gray-200 font-bold">New Character</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Name */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kebbin Solvane"
                autoFocus
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
              />
            </div>

            {/* Trigger Word */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Trigger Word *</label>
              <input
                type="text"
                value={triggerWord}
                onChange={(e) => setTriggerWord(e.target.value)}
                placeholder="e.g. mckdhn"
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
              />
              <p className="text-xs font-mono text-gray-600 mt-1">LoRA activation token embedded in prompts</p>
            </div>

            {/* LoRA Files */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">LoRA Files</label>
              {loraFiles.length > 0 && (
                <div className="space-y-1 mb-2">
                  {loraFiles.map((file) => (
                    <div key={file} className="flex items-center gap-2 bg-surface border border-gray-600 rounded px-3 py-1.5">
                      <span className="text-xs font-mono text-gray-200 truncate flex-1" title={file}>
                        {fileName(file)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleLoraRemove(file)}
                        className="text-gray-500 hover:text-score-low text-sm flex-shrink-0"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowBrowser(true)}
                className="text-xs font-mono text-accent hover:text-accent/80 border border-accent/30 rounded px-3 py-1.5"
              >
                + Browse .safetensors
              </button>
              <p className="text-xs font-mono text-gray-600 mt-1">Dual LoRA stack is standard — add up to 2</p>
            </div>

            {/* Identity Block */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Identity Block</label>
              <textarea
                value={identityBlock}
                onChange={(e) => setIdentityBlock(e.target.value)}
                placeholder="Locked identity prompt fragment — trigger word + physical descriptors"
                rows={3}
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y"
              />
            </div>

            {/* Negative Block */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Negative Block</label>
              <textarea
                value={negativeBlock}
                onChange={(e) => setNegativeBlock(e.target.value)}
                placeholder="Locked negative prompt"
                rows={2}
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y"
              />
            </div>

            {/* Proven Settings */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-2">Proven Settings</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-gray-600 block mb-1">guidance_scale</label>
                  <input
                    type="number"
                    step="0.1"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(e.target.value)}
                    className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-600 block mb-1">guidance2_scale</label>
                  <input
                    type="number"
                    step="0.1"
                    value={guidance2Scale}
                    onChange={(e) => setGuidance2Scale(e.target.value)}
                    className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-mono text-gray-600 block mb-1">loras_multipliers</label>
                  <input
                    type="text"
                    value={lorasMultipliers}
                    onChange={(e) => setLorasMultipliers(e.target.value)}
                    placeholder="1.0;0.3 0.3;1.2"
                    className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-600 block mb-1">film_grain_intensity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={filmGrainIntensity}
                    onChange={(e) => setFilmGrainIntensity(e.target.value)}
                    className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-600 block mb-1">film_grain_saturation</label>
                  <input
                    type="number"
                    step="0.1"
                    value={filmGrainSaturation}
                    onChange={(e) => setFilmGrainSaturation(e.target.value)}
                    className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Freeform notes about this character"
                rows={2}
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
              <button type="submit" disabled={!name.trim() || !triggerWord.trim() || submitting}
                className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Character'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* LoRA File Browser */}
      {showBrowser && (
        <FileBrowserModal
          title="Select LoRA File"
          filter=".safetensors"
          initialPath={loraDir}
          onSelect={handleLoraSelect}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  );
}
