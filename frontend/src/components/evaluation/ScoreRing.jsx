export default function ScoreRing({ score, max, threshold }) {
  const pct = score / max;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct * circumference);
  const color = score >= threshold ? '#22c55e' : pct < 0.5 ? '#ef4444' : '#d97706';

  return (
    <div className="relative w-28 h-28" title={`${score}/${max} (${Math.round(pct * 100)}%) — Lock threshold: ${threshold}/${max}`}>
      <svg viewBox="0 0 100 100" className="transform -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="6" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-300" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-mono font-bold" style={{ color }}>{score}</span>
        <span className="text-xs font-mono text-gray-500">/{max}</span>
      </div>
    </div>
  );
}
