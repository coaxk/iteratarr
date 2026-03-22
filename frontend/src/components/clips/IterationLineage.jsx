import { useRef } from 'react';

export default function IterationLineage({ iterations, selectedId, onSelect }) {
  const scrollRef = useRef(null);

  if (!iterations?.length) return <p className="text-gray-500 text-xs font-mono">No iterations yet</p>;

  const canScroll = iterations.length > 6;

  const scrollBy = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex items-center gap-1">
      {canScroll && (
        <button onClick={() => scrollBy(-1)}
          className="shrink-0 px-1 py-3 text-gray-600 hover:text-accent font-mono text-sm">
          &lsaquo;
        </button>
      )}
      <div ref={scrollRef} className="flex items-center gap-2 overflow-x-auto py-2 scrollbar-hide flex-1">
        {iterations.map((iter, i) => {
          const isSelected = iter.id === selectedId;
          const isLocked = iter.status === 'locked';
          const score = iter.evaluation?.scores?.grand_total;
          const pct = score ? score / 75 : 0;
          const borderColor = isLocked ? 'border-score-high' : isSelected ? 'border-accent' : 'border-gray-600';

          return (
            <div key={iter.id} className="flex items-center shrink-0">
              <button
                onClick={() => onSelect(iter)}
                className={`flex flex-col items-center px-3 py-2 rounded border-2 ${borderColor} ${
                  isSelected ? 'bg-surface-overlay' : 'bg-surface'
                } hover:border-accent/70 transition-colors`}
              >
                <span className="text-xs font-mono text-gray-400">#{iter.iteration_number}</span>
                {score !== undefined && (
                  <span className={`text-sm font-mono font-bold ${
                    pct < 0.5 ? 'text-score-low' : pct < 0.75 ? 'text-score-mid' : 'text-score-high'
                  }`}>
                    {score}/75
                  </span>
                )}
                {isLocked && <span className="text-xs text-score-high font-mono font-bold">LOCKED</span>}
              </button>
              {i < iterations.length - 1 && (
                <span className="text-gray-600 mx-1 font-mono">&rarr;</span>
              )}
            </div>
          );
        })}
      </div>
      {canScroll && (
        <button onClick={() => scrollBy(1)}
          className="shrink-0 px-1 py-3 text-gray-600 hover:text-accent font-mono text-sm">
          &rsaquo;
        </button>
      )}
    </div>
  );
}
