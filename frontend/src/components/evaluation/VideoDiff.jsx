import { useState, useEffect } from 'react';
import FileBrowserModal from '../forms/FileBrowserModal';
import { api } from '../../api';

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
  currentIterationId, previousIterationId,
  onCurrentPathSet, onPreviousPathSet
}) {
  const [browsing, setBrowsing] = useState(null); // 'current' | 'previous' | null
  const [outputDir, setOutputDir] = useState(null);

  // Fetch Wan2GP output directory for browse starting point
  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

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
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      ) : null}
      {/* Fallback / empty state — also shown if video fails to load */}
      <div
        className={`items-center justify-center h-32 rounded border border-dashed border-gray-700 bg-surface flex-col gap-1 ${path ? 'hidden' : 'flex'}`}
      >
        <span className="text-xs font-mono text-gray-600">{path ? 'Render not found yet' : 'No render loaded'}</span>
        {path && <span className="text-[10px] font-mono text-gray-700 break-all px-2 text-center">{path}</span>}
        <button onClick={onBrowse} className="text-xs font-mono text-gray-600 hover:text-accent mt-1">Browse</button>
      </div>
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
          initialPath={outputDir}
          onSelect={(path) => {
            // Persist the render path on the iteration record
            if (browsing === 'current') {
              if (onCurrentPathSet) onCurrentPathSet(path);
              if (currentIterationId) api.updateIteration(currentIterationId, { render_path: path }).catch(() => {});
            }
            if (browsing === 'previous') {
              if (onPreviousPathSet) onPreviousPathSet(path);
              if (previousIterationId) api.updateIteration(previousIterationId, { render_path: path }).catch(() => {});
            }
            setBrowsing(null);
          }}
          onClose={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
