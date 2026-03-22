export default function ScoreSlider({ label, value, onChange, readOnly }) {
  const pct = ((value - 1) / 4) * 100;
  const color = pct < 40 ? 'text-score-low' : pct < 70 ? 'text-score-mid' : 'text-score-high';

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-40 text-xs font-mono text-gray-400 text-right shrink-0">{label}</span>
      <input
        type="range" min={1} max={5} step={1} value={value}
        onChange={readOnly ? undefined : (e) => onChange(Number(e.target.value))}
        disabled={readOnly}
        className={`flex-1 h-1.5 rounded-full appearance-none bg-gray-700 ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ accentColor: pct < 40 ? '#ef4444' : pct < 70 ? '#d97706' : '#22c55e' }}
      />
      <span className={`w-6 text-right text-sm font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
