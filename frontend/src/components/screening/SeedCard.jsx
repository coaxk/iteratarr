import { useState, useEffect } from 'react';

/**
 * SeedCard — individual card in the seed screening contact sheet.
 * Shows thumbnail (or waiting state), seed number with copy, star rating, and select button.
 *
 * Props:
 *   record       — seed_screen record from the API
 *   onSelect     — callback when user clicks "Select"
 *   onRate       — callback(screenId, rating) when user rates
 *   onExpand     — callback when user clicks to expand
 *   isSelected   — whether this seed is the selected one
 *   expanded     — whether this card is currently expanded
 *   frameSrc     — function(screenId, filename) to build frame image URL
 */
export default function SeedCard({ record, onSelect, onRate, onExpand, isSelected, expanded, frameSrc }) {
  const [copied, setCopied] = useState(false);
  const [hoveredStar, setHoveredStar] = useState(0);

  const handleCopySeed = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(String(record.seed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRate = (e, star) => {
    e.stopPropagation();
    if (onRate) onRate(record.id, star);
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    if (onSelect) onSelect(record.seed);
  };

  const hasFrames = record.frames && record.frames.length > 0;
  const thumbnail = hasFrames ? frameSrc(record.id, record.frames[0]) : null;

  return (
    <div
      onClick={onExpand}
      className={`border rounded p-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-accent ring-1 ring-accent/50 bg-accent/5'
          : 'border-gray-700 hover:border-gray-500 bg-surface'
      }`}
    >
      {/* Thumbnail or waiting state */}
      <div className="aspect-video bg-black rounded overflow-hidden mb-2 relative">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`Seed ${record.seed}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <span className="text-xs font-mono text-accent animate-pulse">Waiting for render...</span>
            <span className="text-xs font-mono text-gray-700">{record.render_path?.split(/[/\\]/).pop()}</span>
          </div>
        )}
        {isSelected && (
          <div className="absolute top-1 right-1 bg-accent text-black text-xs font-mono font-bold px-1.5 py-0.5 rounded">
            Selected
          </div>
        )}
      </div>

      {/* Seed number with copy */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-mono text-gray-200 font-bold">Seed: {record.seed}</span>
        <button
          onClick={handleCopySeed}
          className={`px-1.5 py-0.5 rounded text-xs font-mono ${
            copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
          }`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-0.5 mb-1.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={(e) => handleRate(e, star)}
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            className="text-sm leading-none transition-colors"
          >
            <span className={
              star <= (hoveredStar || record.rating || 0)
                ? 'text-amber-400'
                : 'text-gray-600'
            }>
              {star <= (hoveredStar || record.rating || 0) ? '\u2605' : '\u2606'}
            </span>
          </button>
        ))}
      </div>

      {/* Select button */}
      <button
        onClick={handleSelect}
        disabled={isSelected}
        className={`w-full py-1 rounded text-xs font-mono font-bold transition-colors ${
          isSelected
            ? 'bg-accent/20 text-accent cursor-default'
            : 'bg-surface-overlay text-gray-400 hover:bg-accent hover:text-black'
        }`}
      >
        {isSelected ? 'Selected' : 'Select'}
      </button>
    </div>
  );
}
