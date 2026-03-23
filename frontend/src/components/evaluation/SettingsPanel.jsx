import { useState } from 'react';
import { SETTINGS_TIERS } from '../../constants';

/**
 * Displays the current iteration's generation settings organized by tier.
 *
 * Tier 1 (Core Ropes): Always visible. The settings that move the needle.
 * Tier 2 (Advanced): Collapsed accordion. Power-user territory.
 * Tier 3 (Passthrough): Not shown at all — preserved silently in JSON.
 *
 * Read-only display. Editing happens via the rope system + generate next.
 * Changed values (vs parent iteration) are highlighted in accent colour.
 */

/** Format a value for display — keeps it compact */
function formatDisplay(val) {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/** Check if a value differs between current and parent */
function hasChanged(key, jsonContents, parentJsonContents) {
  if (!parentJsonContents) return false;
  const curr = jsonContents?.[key];
  const prev = parentJsonContents?.[key];
  if (curr === undefined && prev === undefined) return false;
  return JSON.stringify(curr) !== JSON.stringify(prev);
}

/** Single setting field row */
function SettingField({ field, value, changed, isText }) {
  const [expanded, setExpanded] = useState(false);
  const displayValue = formatDisplay(value);
  const isLong = isText && typeof value === 'string' && value.length > 80;

  return (
    <div className={isText ? 'col-span-2' : ''}>
      {/* Label */}
      <div className="text-xs font-mono text-gray-500">{field.label}</div>

      {/* Value */}
      {isLong && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className={`text-left text-xs font-mono w-full ${changed ? 'text-accent' : 'text-gray-300'}`}
        >
          <span className="line-clamp-1">{displayValue}</span>
          <span className="text-gray-600 text-xs ml-1">...click to expand</span>
        </button>
      ) : isLong && expanded ? (
        <button
          onClick={() => setExpanded(false)}
          className={`text-left text-xs font-mono w-full whitespace-pre-wrap break-words ${changed ? 'text-accent' : 'text-gray-300'}`}
        >
          {displayValue}
          <span className="text-gray-600 text-xs ml-1 block mt-0.5">click to collapse</span>
        </button>
      ) : (
        <div className={`text-xs font-mono ${changed ? 'text-accent' : 'text-gray-300'}`}>
          {displayValue}
        </div>
      )}

      {/* Hint */}
      {field.hint && (
        <div className="text-xs font-mono text-gray-600 italic">{field.hint}</div>
      )}
    </div>
  );
}

/** Render a tier's fields in the two-column / full-width layout */
function TierFields({ fields, jsonContents, parentJsonContents }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {fields.map((field) => {
        const value = jsonContents?.[field.key];
        const changed = hasChanged(field.key, jsonContents, parentJsonContents);
        const isText = field.type === 'text';
        return (
          <SettingField
            key={field.key}
            field={field}
            value={value}
            changed={changed}
            isText={isText}
          />
        );
      })}
    </div>
  );
}

export default function SettingsPanel({ jsonContents, parentJsonContents }) {
  const [tier2Open, setTier2Open] = useState(false);

  if (!jsonContents) return null;

  // Count how many tier 2 values changed from parent
  const tier2ChangedCount = parentJsonContents
    ? SETTINGS_TIERS.tier2.filter(f => hasChanged(f.key, jsonContents, parentJsonContents)).length
    : 0;

  return (
    <div className="border border-gray-700 rounded">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-mono text-gray-500 uppercase tracking-wider">
        Generation Settings
      </div>

      {/* Tier 1 — always visible */}
      <div className="px-3 pb-3 border-t border-gray-700/50">
        <TierFields
          fields={SETTINGS_TIERS.tier1}
          jsonContents={jsonContents}
          parentJsonContents={parentJsonContents}
        />
      </div>

      {/* Tier 2 — collapsed accordion */}
      <div className="border-t border-gray-700">
        <button
          onClick={() => setTier2Open(!tier2Open)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span>
            Advanced Settings
            {tier2ChangedCount > 0 && (
              <span className="ml-2 text-accent normal-case tracking-normal">
                {tier2ChangedCount} changed
              </span>
            )}
          </span>
          <span className="text-gray-600">{tier2Open ? '\u25BC' : '\u25B6'}</span>
        </button>
        {tier2Open && (
          <div className="px-3 pb-3 border-t border-gray-700/50">
            <TierFields
              fields={SETTINGS_TIERS.tier2}
              jsonContents={jsonContents}
              parentJsonContents={parentJsonContents}
            />
          </div>
        )}
      </div>
    </div>
  );
}
