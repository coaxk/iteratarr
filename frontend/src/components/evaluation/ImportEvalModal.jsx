import { useState } from 'react';

export default function ImportEvalModal({ onImport, onClose }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState(null);

  const handleImport = () => {
    setError(null);
    try {
      const data = JSON.parse(raw);

      // Validate required structure
      if (!data.scores) throw new Error('Missing "scores" object');
      if (!data.scores.identity) throw new Error('Missing "scores.identity" object');
      if (!data.scores.location) throw new Error('Missing "scores.location" object');
      if (!data.scores.motion) throw new Error('Missing "scores.motion" object');

      // Strip computed totals — Iteratarr calculates these server-side
      const clean = (group) => {
        const { total, max, ...fields } = group;
        return fields;
      };

      const imported = {
        scores: {
          identity: clean(data.scores.identity),
          location: clean(data.scores.location),
          motion: clean(data.scores.motion)
        },
        attribution: data.attribution || {},
        qualitative_notes: data.qualitative_notes || '',
        scoring_source: 'ai_assisted'
      };

      onImport(imported);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-raised border border-gray-700 rounded-lg w-[600px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-mono text-gray-200 font-bold">Import Evaluation</h3>
            <p className="text-xs font-mono text-gray-500 mt-0.5">Paste the structured JSON from Tenzing or Claude</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        {/* Paste area */}
        <div className="p-4 flex-1 overflow-auto">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={16}
            placeholder={'Paste evaluation JSON here...\n\n{\n  "scores": {\n    "identity": { "face_match": 3, ... },\n    "location": { ... },\n    "motion": { ... }\n  },\n  "attribution": { ... },\n  "qualitative_notes": "..."\n}'}
            className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 resize-none"
          />

          {error && (
            <div className="mt-2 border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">Parse error: {error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">
            Cancel
          </button>
          <button onClick={handleImport} disabled={!raw.trim()}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
            Import & Pre-fill
          </button>
        </div>
      </div>
    </div>
  );
}
