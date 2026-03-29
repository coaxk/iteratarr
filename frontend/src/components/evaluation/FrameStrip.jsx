import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [extracting, setExtracting] = useState(false);
  const [expandedFrame, setExpandedFrame] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [outputDir, setOutputDir] = useState(null);
  const [csExported, setCsExported] = useState(null);
  const thumbsRef = useRef(null);
  const queryClient = useQueryClient();

  // Attach wheel listener with passive: false so preventDefault works
  // Uses callback ref to handle element availability after frames load
  const wheelHandlerRef = useRef(null);
  const setThumbsRef = useCallback((el) => {
    // Clean up old listener
    if (wheelHandlerRef.current?.el) {
      wheelHandlerRef.current.el.removeEventListener('wheel', wheelHandlerRef.current.handler);
    }
    thumbsRef.current = el;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollBy({ left: (e.deltaY > 0 ? 1 : -1) * 120, behavior: 'smooth' });
    };
    el.addEventListener('wheel', handler, { passive: false });
    wheelHandlerRef.current = { el, handler };
  }, []);

  // Fetch Wan2GP output dir for browse starting point
  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

  // TanStack Query for frames — polls until frames found, then stops
  const { data: frameData, isLoading: loading, error: frameError } = useQuery({
    queryKey: ['frames', iterationId],
    queryFn: async () => {
      const data = await api.listFrames(iterationId);
      if (data.frames?.length > 0) return data;
      // No frames yet — try extracting if render path exists
      if (renderPathProp) {
        try {
          const result = await api.extractFrames(renderPathProp, iterationId, 4);
          if (result.frames?.length > 0) {
            return { frames: result.frames, frames_dir: result.frames_dir, contact_sheet: null };
          }
        } catch { /* render not ready yet */ }
      }
      return { frames: [], frames_dir: null, contact_sheet: null };
    },
    enabled: !!iterationId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.frames?.length > 0 ? false : 20000; // stop polling once frames found
    },
    staleTime: 10000,
  });

  const frames = frameData?.frames || [];
  const framesDir = frameData?.frames_dir || null;
  const error = frameError?.message || null;

  // Load contact sheet from frame data
  useEffect(() => {
    if (frameData?.contact_sheet) setCsExported(frameData.contact_sheet);
  }, [frameData?.contact_sheet]);

  const handleExtract = async (path) => {
    if (!path) return;
    setExtracting(true);
    try {
      await api.extractFrames(path, iterationId, 4);
      queryClient.invalidateQueries({ queryKey: ['frames', iterationId] });
    } catch (err) {
      alert(`Extract failed: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleBrowseSelect = (filePath) => {
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
                // Delete old frames from server, invalidate query, then browse
                try { await fetch(`/api/frames/${iterationId}`, { method: 'DELETE' }); } catch {}
                queryClient.invalidateQueries({ queryKey: ['frames', iterationId] });
                setShowBrowser(true);
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
            <div ref={setThumbsRef} className="flex gap-1 overflow-hidden flex-1 min-w-0">
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

      {/* Browse for render / polling status */}
      {frames.length === 0 && !extracting && (
        <div className="space-y-2">
          {renderPathProp && !error && (
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Waiting for render... checking every 20s
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
