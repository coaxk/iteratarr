import { useState, useEffect } from 'react';

/**
 * SeedCard — individual card in the seed screening contact sheet.
 * Shows thumbnail (or waiting state), seed number with copy, star rating,
 * render/delete buttons, frame strip, and select button.
 *
 * Props:
 *   record       — seed_screen record from the API
 *   onSelect     — callback when user clicks "Select"
 *   onRate       — callback(screenId, rating) when user rates
 *   onExpand     — callback when user clicks to expand
 *   onDelete     — callback(screenId) when user clicks delete
 *   onRender     — callback(jsonPath) when user clicks render
 *   isSelected   — whether this seed is the selected one
 *   expanded     — whether this card is currently expanded
 *   frameSrc     — function(screenId, filename) to build frame image URL
 *   renderConfirm — screenId that just submitted a render (for brief confirmation)
 */
export default function SeedCard({ record, onSelect, onRate, onExpand, onDelete, onRender, isSelected, expanded, frameSrc, renderConfirm }) {
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
    if (onSelect) onSelect(isSelected ? null : record.seed);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(record.id);
  };

  const handleRender = (e) => {
    e.stopPropagation();
    if (onRender) onRender(record.json_path, record.id);
  };

  const hasFrames = record.frames && record.frames.length > 0;
  const thumbnail = hasFrames ? frameSrc(record.id, record.frames[0]) : null;
  const showRenderConfirm = renderConfirm === record.id;

  return (
    <div
      onClick={onExpand}
      className={`border rounded p-2 cursor-pointer transition-all relative group ${
        isSelected
          ? 'border-accent ring-1 ring-accent/50 bg-accent/5'
          : 'border-gray-700 hover:border-gray-500 bg-surface'
      }`}
    >
      {/* Delete button — top-right corner */}
      <button
        onClick={handleDelete}
        className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded text-xs font-mono bg-surface-overlay text-gray-500 hover:text-score-low hover:bg-score-low/10 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete seed screen"
      >
        x
      </button>

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
            {showRenderConfirm ? (
              <span className="text-xs font-mono text-score-high animate-pulse">Render submitted</span>
            ) : (
              <span className="text-xs font-mono text-accent animate-pulse">Waiting for render...</span>
            )}
            <span className="text-xs font-mono text-gray-700">{record.render_path?.split(/[/\\]/).pop()}</span>
          </div>
        )}
        {isSelected && (
          <div className="absolute top-1 right-1 bg-accent text-black text-xs font-mono font-bold px-1.5 py-0.5 rounded">
            Selected
          </div>
        )}
      </div>

      {/* Frame strip — small thumbnails under the video */}
      {hasFrames && record.frames.length > 1 && (
        <div className="flex gap-1 overflow-x-auto mb-2 pb-0.5">
          {record.frames.map((filename, idx) => (
            <img
              key={filename}
              src={frameSrc(record.id, filename)}
              title={`Frame ${idx + 1} — click to expand`}
              alt={`Frame ${idx + 1}`}
              className="h-10 w-auto rounded border border-gray-700 flex-shrink-0 cursor-pointer hover:border-gray-500 transition-colors"
              onClick={(e) => { e.stopPropagation(); }}
            />
          ))}
        </div>
      )}

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

      {/* Action buttons row */}
      <div className="flex gap-1.5">
        {/* Render button — only shown when no frames exist */}
        {!hasFrames && (
          <button
            onClick={handleRender}
            disabled={showRenderConfirm}
            className={`flex-1 py-1 rounded text-xs font-mono font-bold transition-colors ${
              showRenderConfirm
                ? 'bg-score-high/20 text-score-high'
                : 'bg-accent text-black hover:bg-accent/90'
            }`}
          >
            {showRenderConfirm ? 'Submitted' : 'Render'}
          </button>
        )}

        {/* Select button */}
        <button
          onClick={handleSelect}
          className={`flex-1 py-1 rounded text-xs font-mono font-bold transition-colors ${
            isSelected
              ? 'bg-accent/20 text-accent hover:bg-score-low/20 hover:text-score-low'
              : 'bg-surface-overlay text-gray-400 hover:bg-accent hover:text-black'
          }`}
        >
          {isSelected ? 'Unselect' : 'Select'}
        </button>
      </div>
    </div>
  );
}
