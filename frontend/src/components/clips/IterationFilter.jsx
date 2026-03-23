import { useState } from 'react';

const DEFAULT_FILTERS = {
  scoreMin: null, scoreMax: null,
  identityMin: null, locationMin: null, motionMin: null,
  rope: null, source: null, tag: null
};

// Controlled number input that treats empty string as null
function NumInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      className={`bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 placeholder-gray-600 w-16 focus:outline-none focus:border-accent/50 ${className}`}
    />
  );
}

export { DEFAULT_FILTERS };

export default function IterationFilter({ filters, onChange, ropes }) {
  const [expanded, setExpanded] = useState(false);

  const set = (key, value) => onChange({ ...filters, [key]: value });

  const hasAnyFilter = Object.values(filters).some(v => v !== null);

  const clearAll = () => onChange({ ...DEFAULT_FILTERS });

  return (
    <div className="space-y-1.5">
      {/* Primary filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Score range */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-500">Score:</span>
          <NumInput value={filters.scoreMin} onChange={(v) => set('scoreMin', v)} placeholder="min" />
          <span className="text-xs font-mono text-gray-600">to</span>
          <NumInput value={filters.scoreMax} onChange={(v) => set('scoreMax', v)} placeholder="max" />
        </div>

        {/* Rope dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-500">Rope:</span>
          <select
            value={filters.rope ?? ''}
            onChange={(e) => set('rope', e.target.value || null)}
            className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-accent/50"
          >
            <option value="">Any</option>
            {ropes.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Source dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-500">Source:</span>
          <select
            value={filters.source ?? ''}
            onChange={(e) => set('source', e.target.value || null)}
            className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-accent/50"
          >
            <option value="">Any</option>
            <option value="manual">Manual</option>
            <option value="ai_assisted">AI Assisted</option>
          </select>
        </div>

        {/* Tag filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-500">Tag:</span>
          <input
            type="text"
            value={filters.tag ?? ''}
            onChange={(e) => set('tag', e.target.value || null)}
            placeholder="filter..."
            className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 placeholder-gray-600 w-24 focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Category expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? 'Less' : 'Categories'}
        </button>

        {/* Clear all */}
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="text-xs font-mono text-gray-500 hover:text-accent transition-colors ml-auto"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded category filters */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-gray-500">Identity &ge;</span>
            <NumInput value={filters.identityMin} onChange={(v) => set('identityMin', v)} placeholder="min" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-gray-500">Location &ge;</span>
            <NumInput value={filters.locationMin} onChange={(v) => set('locationMin', v)} placeholder="min" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-gray-500">Motion &ge;</span>
            <NumInput value={filters.motionMin} onChange={(v) => set('motionMin', v)} placeholder="min" />
          </div>
        </div>
      )}
    </div>
  );
}
