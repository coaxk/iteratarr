/**
 * ScoreSlider — range input 1-5 with colour shifting and ghost markers
 * from previous iterations.
 *
 * Props:
 *   label     — slider label text
 *   value     — current score (1-5)
 *   onChange  — callback when value changes
 *   readOnly  — disable interaction
 *   ghosts    — array of { iterNum, score } from parent chain (max 3 + baseline)
 */
export default function ScoreSlider({ label, value, onChange, readOnly, ghosts }) {
  const pct = ((value - 1) / 4) * 100;
  const color = pct < 40 ? 'text-score-low' : pct < 70 ? 'text-score-mid' : 'text-score-high';

  // Ghost colour based on trend vs current value
  const ghostColor = (ghostScore) => {
    if (ghostScore < value) return '#22c55e40'; // improving — faint green
    if (ghostScore > value) return '#ef444440'; // regressing — faint red
    return '#66666660'; // same — grey
  };

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-40 text-xs font-mono text-gray-400 text-right shrink-0">{label}</span>
      <div className="flex-1 relative">
        <input
          type="range" min={1} max={5} step={1} value={value}
          onChange={readOnly ? undefined : (e) => onChange(Number(e.target.value))}
          disabled={readOnly}
          className={`w-full h-1.5 rounded-full appearance-none bg-gray-700 ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ accentColor: pct < 40 ? '#ef4444' : pct < 70 ? '#d97706' : '#22c55e' }}
        />
        {/* Ghost markers from previous iterations */}
        {ghosts?.map((ghost, idx) => {
          const leftPct = ((ghost.score - 1) / 4) * 100;
          // Slight vertical offset when ghosts stack at same position
          const stackCount = ghosts.filter((g, i) => i < idx && g.score === ghost.score).length;
          return (
            <div
              key={ghost.iterNum}
              className="absolute pointer-events-auto group"
              style={{
                left: `${leftPct}%`,
                top: `${-2 - (stackCount * 6)}px`,
                transform: 'translateX(-50%)'
              }}
            >
              <div
                className="w-2 h-2 rounded-full border"
                style={{
                  backgroundColor: ghostColor(ghost.score),
                  borderColor: ghostColor(ghost.score).replace('40', '80')
                }}
              />
              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-surface-overlay border border-gray-600 rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-300 whitespace-nowrap">
                  iter_{String(ghost.iterNum).padStart(2, '0')}: {ghost.score}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <span className={`w-6 text-right text-sm font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
