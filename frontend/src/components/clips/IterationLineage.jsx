import { useRef, useEffect, useCallback } from 'react';

export default function IterationLineage({ iterations, selectedId, onSelect, forkPoints = new Set(), showBranchId = false }) {
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  if (!iterations?.length) return <p className="text-gray-500 text-xs font-mono">No iterations yet</p>;

  const canScroll = iterations.length > 6;

  const scrollBy = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
  };

  // Attach wheel listener with passive: false so preventDefault works
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e) => { e.preventDefault(); e.stopPropagation(); scrollBy(e.deltaY > 0 ? 1 : -1); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Auto-scroll selected iteration into view
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedId]);

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
          const hasTags = iter.tags && iter.tags.length > 0;

          return (
            <div
              key={iter.id}
              ref={isSelected ? selectedRef : null}
              className="flex items-center shrink-0"
            >
              <button
                onClick={() => onSelect(iter)}
                className={`relative flex flex-col items-center px-3 py-2 rounded border-2 ${borderColor} ${
                  isSelected ? 'bg-surface-overlay' : 'bg-surface'
                } hover:border-accent/70 transition-colors group`}
                title={hasTags ? iter.tags.join(', ') : undefined}
              >
                {/* Fork point indicator */}
                {forkPoints.has(iter.id) && (
                  <span className="absolute -top-2 -left-2 text-purple-300 text-sm font-bold bg-surface rounded-full w-4 h-4 flex items-center justify-center border border-purple-500/50" title="Fork point — a branch was created from this iteration">⑂</span>
                )}
                {/* Tag indicator dot */}
                {hasTags && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent/70 border border-surface" />
                )}
                {showBranchId && iter.seed_used && (
                  <span className="text-xs font-mono text-gray-600 truncate max-w-[60px]" title={`Seed: ${iter.seed_used}`}>
                    {String(iter.seed_used).slice(-4)}
                  </span>
                )}
                <span className="text-xs font-mono text-gray-400">#{iter.iteration_number}</span>
                {score !== undefined && (
                  <span className={`text-sm font-mono font-bold ${
                    pct < 0.5 ? 'text-score-low' : pct < 0.75 ? 'text-score-mid' : 'text-score-high'
                  }`}>
                    {score}/75
                  </span>
                )}
                {!iter.evaluation && iter.status !== 'pending' && (
                  <span className="text-[10px] font-mono text-amber-400 animate-pulse" title="Rendered — awaiting scoring">score</span>
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
