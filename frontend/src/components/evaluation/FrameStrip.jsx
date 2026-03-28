import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import FileBrowserModal from '../forms/FileBrowserModal';
import CopyButton from '../common/CopyButton';

/**
 * FrameStrip — horizontal strip of thumbnail frames extracted from a rendered MP4.
 * Fetches available frames for the given iteration. If none exist, offers an
 * "Extract Frames" button that prompts for the video path and triggers extraction.
 *
 * Props:
 *   iterationId — the iteration UUID to fetch/extract frames for
 */
export default function FrameStrip({ iterationId, renderPath: renderPathProp, iterationStatus }) {
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [videoPath, setVideoPath] = useState('');
  const [frameCount, setFrameCount] = useState(4);
  const [expandedFrame, setExpandedFrame] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [framesDir, setFramesDir] = useState(null);
  const [outputDir, setOutputDir] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [csExported, setCsExported] = useState(null);
  const thumbsRef = useRef(null);
  const MAX_POLLS = 40; // 40 * 15s = 10 minutes

  // Attach wheel listener with passive: false so preventDefault works
  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollBy({ left: (e.deltaY > 0 ? 1 : -1) * 120, behavior: 'smooth' });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  // Fetch Wan2GP output dir for browse starting point
  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

  const tryExtract = async () => {
    if (!renderPathProp || !iterationId) return false;
    try {
      const result = await api.extractFrames(renderPathProp, iterationId, frameCount);
      if (result.frames?.length > 0) {
        setFrames(result.frames);
        if (result.frames_dir) setFramesDir(result.frames_dir);
        setVideoPath(renderPathProp);
        return true;
      }
    } catch {
      // File doesn't exist yet — that's fine
    }
    return false;
  };

  useEffect(() => {
    if (!iterationId) return;
    setLoading(true);
    setError(null);
    setFrames([]);
    setExpandedFrame(null);

    let cancelled = false;
    let interval = null;

    api.listFrames(iterationId)
      .then(async (data) => {
        if (cancelled) return;
        if (data.frames?.length > 0) {
          setFrames(data.frames);
          if (data.frames_dir) setFramesDir(data.frames_dir);
          // Load existing contact sheet from disk if available
          if (data.contact_sheet) {
            setCsExported(data.contact_sheet);
          }
        } else if (renderPathProp) {
          const extracted = await tryExtract();
          if (!extracted && !cancelled) {
            // Render not ready yet — poll every 15s
            // If iteration is queued/rendering, poll indefinitely (queue may take hours)
            // Otherwise timeout after 10 min
            let polls = 0;
            interval = setInterval(async () => {
              if (cancelled) return;
              polls++;
              setPollCount(polls);
              if (polls >= MAX_POLLS) {
                // Check if iteration is in queue before giving up
                try {
                  const qs = await api.getIterationQueueStatus(iterationId);
                  if (qs.in_queue && (qs.status === 'queued' || qs.status === 'rendering')) {
                    // Still in queue — keep polling, reset counter
                    polls = 0;
                    return;
                  }
                } catch {}
                clearInterval(interval);
                setError('Render not detected after 10 minutes. Use Extract Frames manually once the render completes.');
                return;
              }
              const done = await tryExtract();
              if (done) clearInterval(interval);
            }, 15000);
          }
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [iterationId, renderPathProp]);

  const handleExtract = async (path) => {
    const target = path || videoPath.trim();
    if (!target) return;
    setExtracting(true);
    setError(null);
    try {
      const result = await api.extractFrames(target, iterationId, frameCount);
      setFrames(result.frames || []);
      if (result.frames_dir) setFramesDir(result.frames_dir);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleBrowseSelect = (filePath) => {
    setVideoPath(filePath);
    setShowBrowser(false);
    handleExtract(filePath);
  };

  const frameSrc = (filename) => `/api/frames/${iterationId}/${filename}`;

  if (loading) {
    return (
      <div className="border border-gray-700 rounded p-3">
        <p className="text-xs font-mono text-gray-500">Loading frames...</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-700 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">
          Render Frames
        </span>
        {frames.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-600">{frames.length} frames</span>
            <button
              onClick={async () => {
                // Delete old frames from server, then browse for new render
                try { await fetch(`/api/frames/${iterationId}`, { method: 'DELETE' }); } catch {}
                setFrames([]); setFramesDir(null); setShowBrowser(true);
              }}
              className="text-xs font-mono text-gray-600 hover:text-accent"
            >
              Re-extract
            </button>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
          <p className="text-xs font-mono text-score-low">{error}</p>
        </div>
      )}

      {/* Frame thumbnails with nav arrows */}
      {frames.length > 0 && (() => {
        const scrollBy = (dir) => {
          if (thumbsRef.current) thumbsRef.current.scrollBy({ left: dir * 120, behavior: 'smooth' });
        };
        return (
          <div className="flex items-center gap-1">
            <button onClick={() => scrollBy(-1)} className="shrink-0 text-gray-600 hover:text-accent text-xs font-mono px-1">←</button>
            <div ref={thumbsRef} className="flex gap-1 overflow-hidden flex-1 min-w-0">
              {frames.map((filename, idx) => (
                <button
                  key={filename}
                  onClick={() => setExpandedFrame(expandedFrame === filename ? null : filename)}
                  className="flex-shrink-0 group relative"
                >
                  <img
                    src={frameSrc(filename)}
                    alt={`Frame ${idx + 1}`}
                    className={`h-20 w-auto rounded border transition-all ${
                      expandedFrame === filename
                        ? 'border-accent ring-1 ring-accent/50'
                        : 'border-gray-700 group-hover:border-gray-500'
                    }`}
                  />
                  <span className="absolute bottom-0.5 right-1 text-xs font-mono text-gray-400 bg-black/70 px-1 rounded">
                    {idx + 1}
                  </span>
                </button>
              ))}
              {/* Contact sheet thumbnail — clickable into lightbox */}
              {csExported ? (
                <button
                  onClick={() => setExpandedFrame(expandedFrame === '__cs__' ? null : '__cs__')}
                  className="flex-shrink-0"
                >
                  <img
                    src={`/api/contactsheet/${csExported.filename}`}
                    alt="Contact sheet"
                    title="Click to expand"
                    className={`h-20 w-auto rounded border-2 transition-all ${
                      expandedFrame === '__cs__'
                        ? 'border-accent ring-1 ring-accent/50'
                        : 'border-accent/50 hover:border-accent'
                    }`}
                  />
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const result = await api.createContactSheet({ frame_id: iterationId });
                      setCsExported(result);
                    } catch {}
                  }}
                  className="h-20 w-16 flex-shrink-0 rounded border border-dashed border-gray-600 hover:border-accent flex items-center justify-center text-gray-600 hover:text-accent transition-colors"
                  title="Generate contact sheet"
                >
                  <span className="text-xs font-mono">CS</span>
                </button>
              )}
            </div>
            <button onClick={() => scrollBy(1)} className="shrink-0 text-gray-600 hover:text-accent text-xs font-mono px-1">→</button>
          </div>
        );
      })()}

      {/* Expanded frame / contact sheet view with navigation */}
      {expandedFrame && (() => {
        // Build navigation list: all frames + contact sheet
        const navItems = [...frames];
        if (csExported) navItems.push('__cs__');
        const currentIdx = navItems.indexOf(expandedFrame);
        const isCs = expandedFrame === '__cs__';

        return (
          <div className="relative">
            <img
              src={isCs ? `/api/contactsheet/${csExported.filename}` : frameSrc(expandedFrame)}
              alt={isCs ? 'Contact sheet' : 'Expanded frame'}
              className="w-full rounded border border-gray-700"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={() => { if (currentIdx > 0) setExpandedFrame(navItems[currentIdx - 1]); }}
                disabled={currentIdx <= 0}
                className="bg-black/70 text-gray-400 hover:text-gray-200 disabled:text-gray-600 rounded px-2 py-0.5 text-xs font-mono"
              >
                ← Prev
              </button>
              <span className="bg-black/70 text-gray-400 rounded px-2 py-0.5 text-xs font-mono">
                {isCs ? 'CS' : `${currentIdx + 1}/${frames.length}`}
              </span>
              <button
                onClick={() => { if (currentIdx < navItems.length - 1) setExpandedFrame(navItems[currentIdx + 1]); }}
                disabled={currentIdx >= navItems.length - 1}
                className="bg-black/70 text-gray-400 hover:text-gray-200 disabled:text-gray-600 rounded px-2 py-0.5 text-xs font-mono"
              >
                Next →
              </button>
              <button
                onClick={() => setExpandedFrame(null)}
                className="bg-black/70 text-gray-400 hover:text-gray-200 rounded px-2 py-0.5 text-xs font-mono"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* Frames directory — copyable path for Claude web upload */}
      {framesDir && frames.length > 0 && (
        <div className="flex items-center gap-2 bg-surface rounded border border-accent/30 px-2 py-1.5">
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">Frames saved to:</span>
          <span className="text-xs font-mono text-accent break-all flex-1 select-all">{framesDir}</span>
          <CopyButton text={framesDir} title="Copy frames folder path" />
          <button
            onClick={async () => {
              try {
                const result = await api.createContactSheet({ frame_id: iterationId });
                setCsExported(result);
                await navigator.clipboard.writeText(result.path);
                setTimeout(() => setCsExported(null), 3000);
              } catch {}
            }}
            className={`px-1.5 py-0.5 rounded text-xs font-mono shrink-0 ${
              csExported ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
            } transition-colors`}
            title="Export frames as contact sheet (single image)"
          >
            {csExported ? 'Exported' : 'Contact sheet'}
          </button>
        </div>
      )}

      {/* Selected path display */}
      {videoPath && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-surface border border-gray-600 rounded">
          <span className="text-xs font-mono text-gray-400 truncate flex-1">{videoPath}</span>
          {extracting && <span className="text-xs font-mono text-accent">Extracting...</span>}
        </div>
      )}

      {/* Browse for render / polling status */}
      {frames.length === 0 && !extracting && (
        <div className="space-y-2">
          {pollCount > 0 && !error && (
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Waiting for render... checked {pollCount} time{pollCount !== 1 ? 's' : ''} ({Math.round(pollCount * 15 / 60)}m)
            </div>
          )}
          <button
            onClick={() => setShowBrowser(true)}
            className="w-full py-2 border border-dashed border-gray-600 rounded text-xs font-mono text-gray-500 hover:text-accent hover:border-accent/50 transition-colors"
          >
            Browse for Render
          </button>
        </div>
      )}

      {/* File browser modal */}
      {showBrowser && (
        <FileBrowserModal
          title="Select Render File"
          filter=".mp4"
          initialPath={outputDir}
          onSelect={handleBrowseSelect}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
