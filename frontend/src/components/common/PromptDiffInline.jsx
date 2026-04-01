/**
 * Compact inline prompt diff — green for added phrases, red for removed.
 * Designed for text-xs font-mono inline display in iteration nodes.
 */
export default function PromptDiffInline({ diff, maxPhrases = 3 }) {
  if (!diff) return null;
  const { added, removed } = diff;
  if (added.length === 0 && removed.length === 0) return null;

  const items = [
    ...removed.slice(0, maxPhrases).map(p => ({ type: 'removed', phrase: p })),
    ...added.slice(0, maxPhrases).map(p => ({ type: 'added', phrase: p }))
  ];
  const overflow = (added.length + removed.length) - (maxPhrases * 2);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((item, i) => (
        <span
          key={`${item.type}-${i}`}
          className={`text-[10px] font-mono px-1 rounded ${
            item.type === 'added'
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-score-low line-through'
          }`}
        >
          {item.type === 'added' ? '+' : '-'}{item.phrase}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] font-mono text-gray-600">+{overflow} more</span>
      )}
    </span>
  );
}
