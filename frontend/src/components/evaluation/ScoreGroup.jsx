import ScoreSlider from './ScoreSlider';

/**
 * ScoreGroup — group of score sliders with subtotal.
 *
 * Props:
 *   title       — group heading
 *   fields      — array of { key, label }
 *   scores      — object of { key: score }
 *   onChange     — callback (key, value)
 *   readOnly    — disable interaction
 *   historyScores — array of { iterNum, scores: { key: score } } from parent chain
 */
export default function ScoreGroup({ title, fields, scores, onChange, readOnly, historyScores }) {
  const total = fields.reduce((sum, f) => sum + (scores[f.key] || 1), 0);
  const max = fields.length * 5;
  const pct = total / max;

  // Build ghost array for a specific field from the history
  const getGhosts = (fieldKey) => {
    if (!historyScores?.length) return undefined;
    return historyScores
      .filter(h => h.scores[fieldKey] !== undefined)
      .map(h => ({ iterNum: h.iterNum, score: h.scores[fieldKey] }));
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">{title}</h4>
        <span className={`text-sm font-mono font-bold ${
          pct < 0.5 ? 'text-score-low' : pct < 0.75 ? 'text-score-mid' : 'text-score-high'
        }`}>
          {total}/{max}
        </span>
      </div>
      {fields.map(f => (
        <ScoreSlider
          key={f.key}
          label={f.label}
          value={scores[f.key] || 1}
          onChange={readOnly ? undefined : (val) => onChange(f.key, val)}
          readOnly={readOnly}
          ghosts={getGhosts(f.key)}
        />
      ))}
    </div>
  );
}
