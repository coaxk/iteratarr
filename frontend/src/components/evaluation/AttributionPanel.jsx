import { ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, ROPE_GUIDANCE, MODEL_ROPE_CONFIG } from '../../constants';

const ALL_SCORE_FIELDS = [...IDENTITY_FIELDS, ...LOCATION_FIELDS, ...MOTION_FIELDS];

export default function AttributionPanel({ attribution, onChange, readOnly, modelType }) {
  // Filter ropes by model type — fall back to all ropes if no model config exists
  const modelConfig = modelType ? (MODEL_ROPE_CONFIG[modelType] || MODEL_ROPE_CONFIG['default']) : null;
  const availableRopes = modelConfig
    ? ROPES.filter(r => modelConfig.availableRopes.includes(r.id))
    : ROPES;
  const disabled = readOnly || !onChange;
  return (
    <div className={`border border-gray-700 rounded p-3 space-y-3 ${disabled ? 'opacity-70' : ''}`}>
      <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Attribution</h4>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Lowest Scoring Element</label>
        <select
          value={attribution.lowest_element || ''}
          onChange={disabled ? undefined : (e) => onChange({ ...attribution, lowest_element: e.target.value })}
          disabled={disabled}
          className={`w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          <option value="">Select element...</option>
          {ALL_SCORE_FIELDS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Smart rope guidance — appears when lowest element is selected */}
      {attribution.lowest_element && ROPE_GUIDANCE[attribution.lowest_element] && !disabled && (
        <div className="border border-accent/20 bg-accent/5 rounded p-2 space-y-1.5">
          <p className="text-xs font-mono text-accent font-bold">Suggested ropes for {ALL_SCORE_FIELDS.find(f => f.key === attribution.lowest_element)?.label}:</p>
          {ROPE_GUIDANCE[attribution.lowest_element].map((g, i) => {
            const rope = ROPES.find(r => r.id === g.rope);
            return (
              <button
                key={i}
                onClick={() => onChange({ ...attribution, rope: g.rope })}
                className="w-full text-left px-2 py-1.5 rounded text-xs font-mono bg-surface hover:bg-surface-overlay transition-colors border border-transparent hover:border-accent/30"
              >
                <span className="text-gray-300">{rope?.label}</span>
                <span className="text-gray-500 block mt-0.5">{g.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Most Likely Rope</label>
        <select
          value={attribution.rope || ''}
          onChange={disabled ? undefined : (e) => onChange({ ...attribution, rope: e.target.value })}
          disabled={disabled}
          className={`w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          <option value="">Select rope...</option>
          {availableRopes.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {attribution.rope && (
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {ROPES.find(r => r.id === attribution.rope)?.description}
          </p>
        )}
        {modelConfig && (
          <p className="text-xs text-gray-600 mt-1 font-mono">{modelConfig.notes}</p>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">How sure are you this rope will fix it?</label>
        <div className="flex gap-2">
          {['low', 'medium', 'high'].map(level => (
            <button
              key={level}
              onClick={disabled ? undefined : () => onChange({ ...attribution, confidence: level })}
              disabled={disabled}
              className={`px-3 py-1 rounded text-xs font-mono ${
                attribution.confidence === level
                  ? 'bg-accent text-black font-bold'
                  : 'bg-surface-overlay text-gray-400 hover:text-gray-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 font-mono block mb-1">Next Change</label>
        <input
          type="text"
          value={attribution.next_change_description || ''}
          onChange={disabled ? undefined : (e) => onChange({ ...attribution, next_change_description: e.target.value })}
          readOnly={disabled}
          placeholder="Describe the single change to make..."
          className={`w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 ${disabled ? 'cursor-not-allowed' : ''}`}
        />
      </div>

      {attribution.rope && ROPES.find(r => r.id === attribution.rope)?.field && !attribution.next_changes && (
        <div>
          <label className="text-xs text-gray-400 font-mono block mb-1">
            JSON Field: <code className="text-accent">{ROPES.find(r => r.id === attribution.rope).field}</code>
          </label>
          <input
            type="text"
            value={attribution.next_change_value || ''}
            onChange={disabled ? undefined : (e) => onChange({
              ...attribution,
              next_change_json_field: ROPES.find(r => r.id === attribution.rope).field,
              next_change_value: e.target.value
            })}
            readOnly={disabled}
            placeholder="New value..."
            className={`w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 ${disabled ? 'cursor-not-allowed' : ''}`}
          />
        </div>
      )}

      {/* Multi-field changes (next_changes object) — shows when imported */}
      {attribution.next_changes && typeof attribution.next_changes === 'object' && (
        <div>
          <label className="text-xs text-gray-400 font-mono block mb-1">
            Fields to change ({Object.keys(attribution.next_changes).length})
          </label>
          <div className="space-y-1.5">
            {Object.entries(attribution.next_changes).map(([field, value]) => (
              <div key={field} className="bg-surface rounded border border-gray-700/50 px-3 py-1.5">
                <span className="text-xs font-mono text-accent block mb-0.5">{field}</span>
                <p className="text-xs font-mono text-gray-400 break-words whitespace-pre-wrap">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
