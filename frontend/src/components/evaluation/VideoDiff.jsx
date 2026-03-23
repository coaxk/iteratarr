import { useState, useEffect } from 'react';
import FileBrowserModal from '../forms/FileBrowserModal';
import { api } from '../../api';

/**
 * VideoPanel — single video player with polling for render completion.
 * When path is set but file doesn't exist yet, polls every 30s until it appears.
 */
function VideoPanel({ label, path, side, onBrowse, iterationId }) {
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const videoSrc = path ? `/api/video?path=${encodeURIComponent(path)}` : null;

  // Check if file exists at path by hitting the video endpoint with HEAD-like request
  const checkExists = async () => {
    if (!path) return false;
    try {
      const res = await fetch(`/api/video?path=${encodeURIComponent(path)}`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  };

  // On mount and path change — check immediately, only poll if not found
  useEffect(() => {
    if (!path) return;
    setLoaded(false);
    setWaiting(false);
    setPollCount(0);

    let cancelled = false;
    let interval = null;

    checkExists().then(exists => {
      if (cancelled) return;
      if (exists) {
        setLoaded(true);
      } else {
        // File doesn't exist yet — start polling
        setWaiting(true);
        interval = setInterval(async () => {
          if (cancelled) return;
          setPollCount(c => c + 1);
          const found = await checkExists();
          if (found && !cancelled) {
            setLoaded(true);
            setWaiting(false);
            clearInterval(interval);
            // Record render completion for telemetry
            if (iterationId) {
              api.renderComplete(iterationId, new Date().toISOString()).catch(() => {});
            }
          }
        }, 10000);
      }
    });

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [path]);

  const src = videoSrc ? `${videoSrc}&_t=${pollCount}` : null;

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
                  {pollCount > 0 && <span className="text-xs font-mono text-gray-700">checked {pollCount}x</span>}
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
  onCurrentPathSet, onPreviousPathSet
}) {
  const [browsing, setBrowsing] = useState(null);
  const [outputDir, setOutputDir] = useState(null);

  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

  return (
    <div className="border border-gray-700 rounded p-3 space-y-2">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">Render Comparison</span>
      <div className="flex gap-3">
        <VideoPanel
          label={previousLabel}
          path={previousVideoPath}
          side="previous"
          iterationId={previousIterationId}
          onBrowse={() => setBrowsing('previous')}
        />
        <VideoPanel
          label={currentLabel}
          path={currentVideoPath}
          side="current"
          iterationId={currentIterationId}
          onBrowse={() => setBrowsing('current')}
        />
      </div>

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
