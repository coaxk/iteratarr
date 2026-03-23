import { useState, useMemo } from 'react';
import { ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, GRAND_MAX } from '../../constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROPE_LABELS = Object.fromEntries(ROPES.map(r => [r.id, r.label]));

/** Sum a category's score fields. Returns null when the group is absent. */
function sumFields(scoreGroup, fields) {
  if (!scoreGroup) return null;
  return fields.reduce((s, f) => s + (scoreGroup[f.key] || 0), 0);
}

/** Colour class for an individual score value relative to its field max. */
function scoreColor(value, max) {
  if (value === null || value === undefined) return 'text-gray-600';
  const pct = value / max;
  if (pct < 0.493) return 'text-score-low';
  if (pct < 0.747) return 'text-score-mid';
  return 'text-score-high';
}

/** Colour class for a delta value (positive = improved, negative = regressed, zero = neutral). */
function deltaColor(d) {
  if (d === null) return 'text-gray-600';
  if (d > 0) return 'text-score-high';
  if (d < 0) return 'text-score-low';
  return 'text-gray-500';
}

/** Format a delta with explicit +/- sign. */
function formatDelta(d) {
  if (d === null) return '\u2014';
  if (d === 0) return '0';
  return d > 0 ? `+${d}` : String(d);
}

/**
 * Recursively compute diffs between two plain objects.
 * Returns [{ path, leftValue, rightValue }] for every field that differs.
 * Mirrors the approach in JsonDiffPanel but returns a simpler structure for
 * side-by-side display.
 */
function computeSettingsDiffs(left, right, prefix = '') {
  const diffs = [];
  const allKeys = new Set([
    ...Object.keys(left || {}),
    ...Object.keys(right || {}),
  ]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const lv = left?.[key];
    const rv = right?.[key];

    // Both plain objects — recurse
    if (
      lv != null && rv != null &&
      typeof lv === 'object' && typeof rv === 'object' &&
      !Array.isArray(lv) && !Array.isArray(rv)
    ) {
      diffs.push(...computeSettingsDiffs(lv, rv, path));
    } else if (JSON.stringify(lv) !== JSON.stringify(rv)) {
      diffs.push({ path, leftValue: lv, rightValue: rv });
    }
  }

  return diffs;
}

/** Stringify a JSON value for display. */
function fmtVal(val) {
  if (val === undefined) return '\u2014';
  if (val === null) return 'null';
  if (typeof val === 'string') return val.length > 120 ? `${val.slice(0, 120)}...` : val;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** A single score row: left value | label | right value | delta */
function ScoreRow({ label, leftVal, rightVal, max }) {
  const delta = (leftVal !== null && rightVal !== null) ? rightVal - leftVal : null;
  return (
    <tr className="border-b border-gray-700/30 last:border-b-0">
      <td className={`px-2 py-1 text-right font-mono ${leftVal !== null ? scoreColor(leftVal, max) : 'text-gray-600'}`}>
        {leftVal !== null ? leftVal : '\u2014'}
      </td>
      <td className="px-3 py-1 text-center text-gray-400 text-xs">{label}</td>
      <td className={`px-2 py-1 font-mono ${rightVal !== null ? scoreColor(rightVal, max) : 'text-gray-600'}`}>
        {rightVal !== null ? rightVal : '\u2014'}
      </td>
      <td className={`px-2 py-1 text-right font-mono ${deltaColor(delta)}`}>
        {formatDelta(delta)}
      </td>
    </tr>
  );
}

/** Category subtotal row — slightly bolder styling */
function SubtotalRow({ label, leftVal, rightVal, max }) {
  const delta = (leftVal !== null && rightVal !== null) ? rightVal - leftVal : null;
  return (
    <tr className="border-b border-gray-700 bg-surface-overlay/30">
      <td className={`px-2 py-1.5 text-right font-mono font-bold ${leftVal !== null ? scoreColor(leftVal, max) : 'text-gray-600'}`}>
        {leftVal !== null ? `${leftVal}/${max}` : '\u2014'}
      </td>
      <td className="px-3 py-1.5 text-center text-gray-300 text-xs font-bold uppercase tracking-wider">{label}</td>
      <td className={`px-2 py-1.5 font-mono font-bold ${rightVal !== null ? scoreColor(rightVal, max) : 'text-gray-600'}`}>
        {rightVal !== null ? `${rightVal}/${max}` : '\u2014'}
      </td>
      <td className={`px-2 py-1.5 text-right font-mono font-bold ${deltaColor(delta)}`}>
        {formatDelta(delta)}
      </td>
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ComparisonView({ iterations, onClose, preselect }) {
  // Only iterations that have evaluations are selectable
  const evaluated = useMemo(
    () => (iterations || []).filter(i => i.evaluation?.scores),
    [iterations]
  );

  const [leftId, setLeftId] = useState(() => {
    if (preselect?.[0] && evaluated.find(i => i.id === preselect[0])) return preselect[0];
    return evaluated.length >= 2 ? evaluated[0].id : null;
  });
  const [rightId, setRightId] = useState(() => {
    if (preselect?.[1] && evaluated.find(i => i.id === preselect[1])) return preselect[1];
    return evaluated.length >= 2 ? evaluated[evaluated.length - 1].id : null;
  });

  const leftIter = evaluated.find(i => i.id === leftId) || null;
  const rightIter = evaluated.find(i => i.id === rightId) || null;

  const leftScores = leftIter?.evaluation?.scores || null;
  const rightScores = rightIter?.evaluation?.scores || null;

  // Compute category totals
  const leftIdentity = sumFields(leftScores?.identity, IDENTITY_FIELDS);
  const rightIdentity = sumFields(rightScores?.identity, IDENTITY_FIELDS);
  const leftLocation = sumFields(leftScores?.location, LOCATION_FIELDS);
  const rightLocation = sumFields(rightScores?.location, LOCATION_FIELDS);
  const leftMotion = sumFields(leftScores?.motion, MOTION_FIELDS);
  const rightMotion = sumFields(rightScores?.motion, MOTION_FIELDS);

  // Settings diffs
  const settingsDiffs = useMemo(
    () => computeSettingsDiffs(leftIter?.json_contents, rightIter?.json_contents),
    [leftIter, rightIter]
  );

  // Attribution shorthand
  const leftAttr = leftIter?.evaluation?.attribution || {};
  const rightAttr = rightIter?.evaluation?.attribution || {};
  const leftNotes = leftIter?.evaluation?.qualitative_notes || '';
  const rightNotes = rightIter?.evaluation?.qualitative_notes || '';
  const leftTags = leftIter?.tags || [];
  const rightTags = rightIter?.tags || [];

  if (evaluated.length < 2) {
    return (
      <div className="border border-gray-700 rounded p-6 text-center">
        <p className="text-xs font-mono text-gray-500">Need at least 2 evaluated iterations to compare.</p>
        <button onClick={onClose} className="mt-3 text-xs font-mono text-accent hover:text-accent/80 transition-colors">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface border border-gray-700 rounded-lg w-full max-w-4xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold uppercase tracking-wider">Iteration Comparison</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg font-mono transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Selectors */}
        <div className="flex gap-4 px-4 py-3 border-b border-gray-700">
          <div className="flex-1">
            <label className="text-xs font-mono text-gray-500 block mb-1">Left</label>
            <select
              value={leftId || ''}
              onChange={(e) => setLeftId(e.target.value)}
              className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200"
            >
              {evaluated.map(iter => (
                <option key={iter.id} value={iter.id}>
                  #{iter.iteration_number} — {iter.evaluation.scores.grand_total}/{GRAND_MAX}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1.5 text-gray-600 font-mono text-sm">vs</div>
          <div className="flex-1">
            <label className="text-xs font-mono text-gray-500 block mb-1">Right</label>
            <select
              value={rightId || ''}
              onChange={(e) => setRightId(e.target.value)}
              className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200"
            >
              {evaluated.map(iter => (
                <option key={iter.id} value={iter.id}>
                  #{iter.iteration_number} — {iter.evaluation.scores.grand_total}/{GRAND_MAX}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body — only render when both sides are selected */}
        {leftIter && rightIter && (
          <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">

            {/* ── Scores comparison ───────────────────────────────────── */}
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Scores</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-2 py-1 text-right text-gray-500 w-20">#{leftIter.iteration_number}</th>
                      <th className="px-3 py-1 text-center text-gray-500">Field</th>
                      <th className="px-2 py-1 text-left text-gray-500 w-20">#{rightIter.iteration_number}</th>
                      <th className="px-2 py-1 text-right text-gray-500 w-16">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Identity fields */}
                    {IDENTITY_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores?.identity?.[f.key] ?? null}
                        rightVal={rightScores?.identity?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Identity" leftVal={leftIdentity} rightVal={rightIdentity} max={40} />

                    {/* Location fields */}
                    {LOCATION_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores?.location?.[f.key] ?? null}
                        rightVal={rightScores?.location?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Location" leftVal={leftLocation} rightVal={rightLocation} max={20} />

                    {/* Motion fields */}
                    {MOTION_FIELDS.map(f => (
                      <ScoreRow
                        key={f.key}
                        label={f.label}
                        leftVal={leftScores?.motion?.[f.key] ?? null}
                        rightVal={rightScores?.motion?.[f.key] ?? null}
                        max={5}
                      />
                    ))}
                    <SubtotalRow label="Motion" leftVal={leftMotion} rightVal={rightMotion} max={15} />

                    {/* Grand total */}
                    <tr className="bg-surface-overlay/50">
                      <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${scoreColor(leftScores?.grand_total, GRAND_MAX)}`}>
                        {leftScores?.grand_total ?? '\u2014'}/{GRAND_MAX}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-200 text-xs font-bold uppercase tracking-wider">Grand Total</td>
                      <td className={`px-2 py-2 font-mono text-sm font-bold ${scoreColor(rightScores?.grand_total, GRAND_MAX)}`}>
                        {rightScores?.grand_total ?? '\u2014'}/{GRAND_MAX}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono text-sm font-bold ${deltaColor(
                        leftScores?.grand_total != null && rightScores?.grand_total != null
                          ? rightScores.grand_total - leftScores.grand_total
                          : null
                      )}`}>
                        {formatDelta(
                          leftScores?.grand_total != null && rightScores?.grand_total != null
                            ? rightScores.grand_total - leftScores.grand_total
                            : null
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Settings diff ───────────────────────────────────────── */}
            {settingsDiffs.length > 0 && (
              <div>
                <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                  Settings Diff
                  <span className="ml-2 text-accent normal-case tracking-normal">
                    {settingsDiffs.length} field{settingsDiffs.length !== 1 ? 's' : ''} differ
                  </span>
                </h4>
                <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                  {settingsDiffs.map(diff => (
                    <div key={diff.path} className="flex items-start gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0 text-right">
                        <span className={`font-mono text-xs break-all ${diff.leftValue !== undefined ? 'text-score-low' : 'text-gray-600'}`}>
                          {fmtVal(diff.leftValue)}
                        </span>
                      </div>
                      <div className="shrink-0 text-center min-w-[120px]">
                        <span className="text-xs font-mono text-gray-400">{diff.path}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-mono text-xs break-all ${diff.rightValue !== undefined ? 'text-accent' : 'text-gray-600'}`}>
                          {fmtVal(diff.rightValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {settingsDiffs.length === 0 && leftIter && rightIter && (
              <div>
                <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Settings Diff</h4>
                <p className="text-xs font-mono text-gray-600 italic">No differences in generation settings.</p>
              </div>
            )}

            {/* ── Attribution comparison ──────────────────────────────── */}
            <div>
              <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Attribution</h4>
              <div className="border border-gray-700 rounded divide-y divide-gray-700/30">
                {/* Rope */}
                <div className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0 text-right">
                    <span className="font-mono text-xs text-gray-300">
                      {leftAttr.rope ? (ROPE_LABELS[leftAttr.rope] || leftAttr.rope) : '\u2014'}
                    </span>
                  </div>
                  <div className="shrink-0 text-center min-w-[120px]">
                    <span className="text-xs font-mono text-gray-400">Attributed Rope</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-gray-300">
                      {rightAttr.rope ? (ROPE_LABELS[rightAttr.rope] || rightAttr.rope) : '\u2014'}
                    </span>
                  </div>
                </div>

                {/* Confidence */}
                <div className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0 text-right">
                    <span className="font-mono text-xs text-gray-300">
                      {leftAttr.confidence || '\u2014'}
                    </span>
                  </div>
                  <div className="shrink-0 text-center min-w-[120px]">
                    <span className="text-xs font-mono text-gray-400">Confidence</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-gray-300">
                      {rightAttr.confidence || '\u2014'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0 text-right">
                    <p className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
                      {leftNotes || '\u2014'}
                    </p>
                  </div>
                  <div className="shrink-0 text-center min-w-[120px]">
                    <span className="text-xs font-mono text-gray-400">Notes</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
                      {rightNotes || '\u2014'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tags ────────────────────────────────────────────────── */}
            {(leftTags.length > 0 || rightTags.length > 0) && (
              <div>
                <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Tags</h4>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {leftTags.length > 0 ? leftTags.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-surface-overlay text-gray-400 rounded text-xs font-mono">{t}</span>
                      )) : (
                        <span className="text-xs font-mono text-gray-600">{'\u2014'}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-center min-w-[120px]">
                    <span className="text-xs font-mono text-gray-400">Tags</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {rightTags.length > 0 ? rightTags.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-surface-overlay text-gray-400 rounded text-xs font-mono">{t}</span>
                      )) : (
                        <span className="text-xs font-mono text-gray-600">{'\u2014'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
