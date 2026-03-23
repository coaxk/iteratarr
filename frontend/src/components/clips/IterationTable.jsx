import { useState, useMemo } from 'react';
import { ROPES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../../constants';

// Build a short label lookup: rope_3_lora_multipliers -> "Rope 3"
const ROPE_SHORT_LABELS = Object.fromEntries(
  ROPES.map(r => {
    const match = r.label.match(/^(Rope \w+|Bonus|Multiple)/);
    return [r.id, match ? match[1] : r.id];
  })
);

// Full label lookup for title attribute
const ROPE_FULL_LABELS = Object.fromEntries(ROPES.map(r => [r.id, r.label]));

// Compute category totals from an evaluation's score sub-object
function sumFields(scoreGroup, fields) {
  if (!scoreGroup) return null;
  return fields.reduce((s, f) => s + (scoreGroup[f.key] || 0), 0);
}

// Format ISO date as "23 Mar 03:47"
function formatDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (isNaN(d)) return '\u2014';
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${hh}:${mm}`;
}

// Score colour class based on value / max ratio
function scoreColor(value, max) {
  if (value === null || value === undefined) return 'text-gray-600';
  const pct = value / max;
  // red < 37/75 (~0.493), amber < 56/75 (~0.747), green >= 56/75
  if (value < max * 0.493) return 'text-score-low';
  if (value < max * 0.747) return 'text-score-mid';
  return 'text-score-high';
}

const COLUMNS = [
  { key: 'iteration_number', label: '#', width: 'w-10' },
  { key: 'grand_total', label: 'Score', width: 'w-20' },
  { key: 'identity_total', label: 'Identity', width: 'w-20' },
  { key: 'location_total', label: 'Location', width: 'w-20' },
  { key: 'motion_total', label: 'Motion', width: 'w-20' },
  { key: 'rope', label: 'Rope', width: 'w-24' },
  { key: 'scoring_source', label: 'Source', width: 'w-20' },
  { key: 'created_at', label: 'Date', width: 'w-28' },
];

export default function IterationTable({ iterations, selectedId, onSelect }) {
  const [sortKey, setSortKey] = useState('iteration_number');
  const [sortAsc, setSortAsc] = useState(true);

  if (!iterations?.length) return <p className="text-gray-500 text-xs font-mono">No iterations yet</p>;

  // Derive sortable row data
  const rows = useMemo(() => iterations.map(iter => {
    const ev = iter.evaluation;
    const scores = ev?.scores;
    const identityTotal = sumFields(scores?.identity, IDENTITY_FIELDS);
    const locationTotal = sumFields(scores?.location, LOCATION_FIELDS);
    const motionTotal = sumFields(scores?.motion, MOTION_FIELDS);
    return {
      iter,
      iteration_number: iter.iteration_number,
      grand_total: scores?.grand_total ?? null,
      identity_total: identityTotal,
      location_total: locationTotal,
      motion_total: motionTotal,
      rope: ev?.attribution?.rope || null,
      scoring_source: ev?.scoring_source || null,
      created_at: iter.created_at || null,
    };
  }), [iterations]);

  // Sort rows
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      // Nulls always sort last
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      // String comparison for rope, scoring_source, created_at
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortAsc ? cmp : -cmp;
      }
      // Numeric
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`${col.width} px-2 py-1.5 text-left text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none transition-colors`}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-accent">{sortAsc ? '\u25B2' : '\u25BC'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const isSelected = row.iter.id === selectedId;
            const hasEval = row.grand_total !== null;
            return (
              <tr
                key={row.iter.id}
                onClick={() => onSelect(row.iter)}
                className={`border-b border-gray-700/50 cursor-pointer transition-colors hover:bg-surface-overlay ${
                  isSelected ? 'bg-accent/10 border-l-2 border-l-accent/30' : ''
                }`}
              >
                {/* # */}
                <td className="px-2 py-1.5 text-gray-400">#{row.iteration_number}</td>

                {/* Score — grand_total/75 */}
                <td className={`px-2 py-1.5 font-bold ${hasEval ? scoreColor(row.grand_total, 75) : 'text-gray-600'}`}>
                  {hasEval ? `${row.grand_total}/75` : '\u2014'}
                </td>

                {/* Identity total/40 */}
                <td className={`px-2 py-1.5 ${row.identity_total !== null ? scoreColor(row.identity_total, 40) : 'text-gray-600'}`}>
                  {row.identity_total !== null ? `${row.identity_total}/40` : '\u2014'}
                </td>

                {/* Location total/20 */}
                <td className={`px-2 py-1.5 ${row.location_total !== null ? scoreColor(row.location_total, 20) : 'text-gray-600'}`}>
                  {row.location_total !== null ? `${row.location_total}/20` : '\u2014'}
                </td>

                {/* Motion total/15 */}
                <td className={`px-2 py-1.5 ${row.motion_total !== null ? scoreColor(row.motion_total, 15) : 'text-gray-600'}`}>
                  {row.motion_total !== null ? `${row.motion_total}/15` : '\u2014'}
                </td>

                {/* Rope — short label, full name on hover */}
                <td className="px-2 py-1.5 text-gray-300 truncate max-w-[6rem]" title={row.rope ? ROPE_FULL_LABELS[row.rope] || row.rope : ''}>
                  {row.rope ? ROPE_SHORT_LABELS[row.rope] || row.rope : '\u2014'}
                </td>

                {/* Source badge */}
                <td className="px-2 py-1.5">
                  {row.scoring_source ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      row.scoring_source === 'ai_assisted'
                        ? 'bg-purple-900/40 text-purple-300'
                        : 'bg-gray-700/60 text-gray-400'
                    }`}>
                      {row.scoring_source === 'ai_assisted' ? 'AI' : 'Manual'}
                    </span>
                  ) : '\u2014'}
                </td>

                {/* Date */}
                <td className="px-2 py-1.5 text-gray-500">{formatDate(row.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
