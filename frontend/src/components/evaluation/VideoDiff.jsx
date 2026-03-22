import { useState } from 'react';
import FileBrowserModal from '../forms/FileBrowserModal';

/**
 * VideoDiff — side-by-side video comparison display.
 * Left: previous iteration's render. Right: current iteration's render.
 * Videos served from local filesystem via the backend file serving.
 *
 * Props:
 *   currentVideoPath  — path to current iteration's render (may be null)
 *   previousVideoPath — path to parent iteration's render (may be null)
 *   currentLabel      — e.g. "Iteration #3"
 *   previousLabel     — e.g. "Iteration #2"
 *   onCurrentPathSet  — callback when user browses for current render
 *   onPreviousPathSet — callback when user browses for previous render
 */
export default function VideoDiff({
  currentVideoPath, previousVideoPath,
  currentLabel = 'Current', previousLabel = 'Previous',
  onCurrentPathSet, onPreviousPathSet
}) {
  const [browsing, setBrowsing] = useState(null); // 'current' | 'previous' | null

  // Serve video via backend — encode the path as a query param
  const videoSrc = (path) => path ? `/api/video?path=${encodeURIComponent(path)}` : null;

  const VideoPanel = ({ label, path, side, onBrowse }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500">{label}</span>
        {!path && (
          <button
            onClick={onBrowse}
            className="text-xs font-mono text-gray-500 hover:text-accent"
          >
            Browse
          </button>
        )}
      </div>
      {path ? (
        <video
          src={videoSrc(path)}
          controls
          loop
          muted
          className="w-full rounded border border-gray-700 bg-black"
          style={{ maxHeight: '240px' }}
        />
      ) : (
        <div className="flex items-center justify-center h-32 rounded border border-dashed border-gray-700 bg-surface">
          <span className="text-xs font-mono text-gray-600">No render loaded</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="border border-gray-700 rounded p-3 space-y-2">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">Render Comparison</span>
      <div className="flex gap-3">
        <VideoPanel
          label={previousLabel}
          path={previousVideoPath}
          side="previous"
          onBrowse={() => setBrowsing('previous')}
        />
        <VideoPanel
          label={currentLabel}
          path={currentVideoPath}
          side="current"
          onBrowse={() => setBrowsing('current')}
        />
      </div>

      {browsing && (
        <FileBrowserModal
          title={`Select ${browsing === 'current' ? 'Current' : 'Previous'} Render`}
          filter=".mp4"
          onSelect={(path) => {
            if (browsing === 'current' && onCurrentPathSet) onCurrentPathSet(path);
            if (browsing === 'previous' && onPreviousPathSet) onPreviousPathSet(path);
            setBrowsing(null);
          }}
          onClose={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
