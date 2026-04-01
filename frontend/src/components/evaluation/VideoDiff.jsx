import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import FileBrowserModal from '../forms/FileBrowserModal';
import FrameStrip from './FrameStrip';
import { api } from '../../api';

/**
 * VideoPanel — single video player with polling for render completion.
 * When path is set but file doesn't exist yet, polls every 30s until it appears.
 */
function VideoPanel({ label, path, side, onBrowse, iterationId }) {
  const videoSrc = path ? `/api/video?path=${encodeURIComponent(path)}` : null;

  // Stable cache-buster per path — computed once when path changes, not on every render.
  // Using Date.now() in the render path caused key={src} to remount the <video> element
  // on every re-render, forcing the browser to abort and restart video loading (4-5s freeze).
  const cacheBusterRef = useRef({});
  if (path && !cacheBusterRef.current[path]) {
    cacheBusterRef.current[path] = Date.now();
  }

  // Check if video file exists — polls only until found, then stops.
  // staleTime: Infinity prevents refetches on re-render once video is confirmed present,
  // which avoids repeated renderComplete calls and re-render cascades.
  const { data: loaded } = useQuery({
    queryKey: ['video-exists', path],
    queryFn: async () => {
      if (!path) return false;
      const res = await fetch(`/api/video?path=${encodeURIComponent(path)}`, { method: 'HEAD' });
      if (res.ok) {
        // Record render completion (fires once — query won't refetch after this)
        if (iterationId) api.renderComplete(iterationId, new Date().toISOString()).catch(() => {});
        return true;
      }
      return false;
    },
    enabled: !!path,
    refetchInterval: (query) => query.state.data === true ? false : 15000, // stop polling once found
    staleTime: Infinity, // video presence doesn't change — never re-check once confirmed
  });

  const waiting = path && loaded === false;
  const src = videoSrc && cacheBusterRef.current[path] ? `${videoSrc}&_t=${cacheBusterRef.current[path]}` : videoSrc;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500">{label}</span>
        <button
          onClick={onBrowse}
          className="text-xs font-mono text-gray-500 hover:text-accent"
        >
          Browse
        </button>
      </div>
      {path ? (
        <>
          {loaded && (
            <video
              key={src}
              src={src}
              controls
              loop
              muted
              className="w-full rounded border border-gray-700 bg-black"
              style={{ maxHeight: '240px' }}
            />
          )}
          {!loaded && (
            <div className="flex items-center justify-center h-32 rounded border border-dashed border-gray-700 bg-surface flex-col gap-1">
              {waiting ? (
                <>
                  <span className="text-xs font-mono text-accent animate-pulse">Waiting for render to complete...</span>
                  <span className="text-xs font-mono text-gray-700 break-all px-2 text-center">{path.split(/[/\\]/).pop()}</span>
                  <span className="text-xs font-mono text-gray-600">Checking every 10s — will auto-load when ready</span>
                  <span className="text-xs font-mono text-gray-700">checking every 15s</span>
                </>
              ) : (
                <>
                  <span className="text-xs font-mono text-gray-600">Render not found yet</span>
                  <span className="text-xs font-mono text-gray-700 break-all px-2 text-center">{path.split(/[/\\]/).pop()}</span>
                </>
              )}
              <button onClick={onBrowse} className="text-xs font-mono text-gray-600 hover:text-accent mt-1">Browse</button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-32 rounded border border-dashed border-gray-700 bg-surface flex-col gap-1">
          <span className="text-xs font-mono text-gray-600">No render loaded</span>
          <button onClick={onBrowse} className="text-xs font-mono text-gray-600 hover:text-accent mt-1">Browse</button>
        </div>
      )}
    </div>
  );
}

export default function VideoDiff({
  currentVideoPath, previousVideoPath,
  currentLabel = 'Current', previousLabel = 'Previous',
  currentIterationId, previousIterationId,
  onCurrentPathSet, onPreviousPathSet,
  allIterations, onPreviousIterationChange
}) {
  const [browsing, setBrowsing] = useState(null);
  const [outputDir, setOutputDir] = useState(null);
  const currentIteration = allIterations?.find(i => i.id === currentIterationId) || null;
  const previousIteration = allIterations?.find(i => i.id === previousIterationId) || null;

  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

  // Build list of iterations with render paths for the comparison slider
  const iterationsWithRenders = allIterations
    ? allIterations.filter(i => i.render_path && i.id !== currentIterationId).sort((a, b) => a.iteration_number - b.iteration_number)
    : [];

  const handlePrevIterChange = (iterNum) => {
    const iter = iterationsWithRenders.find(i => i.iteration_number === iterNum);
    if (iter && onPreviousIterationChange) {
      onPreviousIterationChange(iter);
    }
  };

  return (
    <div className="border border-gray-700 rounded p-3 space-y-2">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">Render Comparison</span>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <VideoPanel
            label={previousLabel}
            path={previousVideoPath}
            side="previous"
            iterationId={previousIterationId}
            onBrowse={() => setBrowsing('previous')}
          />
          {previousIterationId && (
            <FrameStrip
              key={`prev-${previousIterationId}`}
              iterationId={previousIterationId}
              renderPath={previousVideoPath}
              iteration={previousIteration}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <VideoPanel
            label={currentLabel}
            path={currentVideoPath}
            side="current"
            iterationId={currentIterationId}
            onBrowse={() => setBrowsing('current')}
          />
          {currentIterationId && (
            <FrameStrip
              key={`cur-${currentIterationId}`}
              iterationId={currentIterationId}
              renderPath={currentVideoPath}
              iteration={currentIteration}
            />
          )}
        </div>
      </div>

      {/* Iteration slider for left (comparison) video */}
      {iterationsWithRenders.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600 shrink-0">Compare with:</span>
          <div className="flex items-center gap-1 flex-1">
            {iterationsWithRenders.map(iter => (
              <button
                key={iter.id}
                onClick={() => handlePrevIterChange(iter.iteration_number)}
                className={`px-1.5 py-0.5 text-xs font-mono rounded ${
                  iter.id === previousIterationId
                    ? 'bg-accent text-black font-bold'
                    : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
                }`}
              >
                #{iter.iteration_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {browsing && (
        <FileBrowserModal
          title={`Select ${browsing === 'current' ? 'Current' : 'Previous'} Render`}
          filter=".mp4"
          initialPath={outputDir}
          onSelect={(path) => {
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
