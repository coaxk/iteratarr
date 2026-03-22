import { useState } from 'react';

/**
 * Recursively computes diffs between two JSON objects.
 * Returns an array of { path, type, oldValue, newValue } entries.
 * type is one of: 'added', 'removed', 'modified'
 */
function computeDiffs(prev, curr, prefix = '') {
  const diffs = [];
  const allKeys = new Set([
    ...Object.keys(prev || {}),
    ...Object.keys(curr || {}),
  ]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const inPrev = prev != null && key in prev;
    const inCurr = curr != null && key in curr;

    if (!inPrev && inCurr) {
      diffs.push({ path, type: 'added', oldValue: undefined, newValue: curr[key] });
    } else if (inPrev && !inCurr) {
      diffs.push({ path, type: 'removed', oldValue: prev[key], newValue: undefined });
    } else {
      const oldVal = prev[key];
      const newVal = curr[key];

      // Both are plain objects — recurse
      if (
        oldVal != null && newVal != null &&
        typeof oldVal === 'object' && typeof newVal === 'object' &&
        !Array.isArray(oldVal) && !Array.isArray(newVal)
      ) {
        diffs.push(...computeDiffs(oldVal, newVal, path));
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({ path, type: 'modified', oldValue: oldVal, newValue: newVal });
      }
      // else identical — skip
    }
  }

  return diffs;
}

function formatValue(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

/** Returns true if a value looks like a long prompt string */
function isPromptField(path) {
  return path === 'prompt' || path.endsWith('.prompt');
}

function DiffRow({ diff }) {
  const [expanded, setExpanded] = useState(false);
  const isPrompt = isPromptField(diff.path) && diff.type === 'modified';

  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-700/30 last:border-b-0">
      <div className="flex items-start gap-3">
        {/* Field name */}
        <span className="text-gray-400 font-mono text-xs shrink-0 min-w-[140px]">
          {diff.path}
        </span>

        {/* Type badge */}
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
          diff.type === 'added'   ? 'bg-score-high/15 text-score-high' :
          diff.type === 'removed' ? 'bg-score-low/15 text-score-low' :
                                    'bg-accent/15 text-accent'
        }`}>
          {diff.type}
        </span>

        {/* Values */}
        <div className="flex-1 min-w-0">
          {diff.type === 'added' && (
            <span className="text-score-high font-mono text-xs break-all">
              {formatValue(diff.newValue)}
            </span>
          )}
          {diff.type === 'removed' && (
            <span className="text-score-low font-mono text-xs line-through opacity-70 break-all">
              {formatValue(diff.oldValue)}
            </span>
          )}
          {diff.type === 'modified' && !isPrompt && (
            <div className="flex flex-col gap-0.5">
              <span className="text-score-low font-mono text-xs line-through opacity-70 break-all">
                {formatValue(diff.oldValue)}
              </span>
              <span className="text-accent font-mono text-xs break-all">
                {formatValue(diff.newValue)}
              </span>
            </div>
          )}
          {diff.type === 'modified' && isPrompt && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-mono text-accent hover:text-accent/80 transition-colors"
            >
              {expanded ? 'hide prompt diff \u25BC' : 'modified \u2014 click to expand \u25B6'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded prompt diff */}
      {isPrompt && expanded && (
        <div className="mt-1 ml-[140px] pl-3 border-l border-gray-700 space-y-1">
          <div>
            <span className="text-xs font-mono text-gray-600 uppercase">previous:</span>
            <pre className="text-xs font-mono text-score-low/70 whitespace-pre-wrap max-h-40 overflow-y-auto mt-0.5">
              {typeof diff.oldValue === 'string' ? diff.oldValue : formatValue(diff.oldValue)}
            </pre>
          </div>
          <div>
            <span className="text-xs font-mono text-gray-600 uppercase">current:</span>
            <pre className="text-xs font-mono text-accent whitespace-pre-wrap max-h-40 overflow-y-auto mt-0.5">
              {typeof diff.newValue === 'string' ? diff.newValue : formatValue(diff.newValue)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JsonDiffPanel({ previousJson, currentJson }) {
  const [open, setOpen] = useState(false);

  if (!previousJson || !currentJson) return null;

  const diffs = computeDiffs(previousJson, currentJson);

  if (diffs.length === 0) return null;

  return (
    <div className="border border-gray-700 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="text-gray-500 uppercase tracking-wider">
          Generation settings changed from previous iteration
          <span className="ml-2 text-accent normal-case tracking-normal">
            {diffs.length} setting{diffs.length !== 1 ? 's' : ''} differ
          </span>
        </span>
        <span className="text-gray-600">{open ? '\u25BC' : '\u25B6'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-700/50">
          {diffs.map((diff) => (
            <DiffRow key={diff.path} diff={diff} />
          ))}
        </div>
      )}
    </div>
  );
}
