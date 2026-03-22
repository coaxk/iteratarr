import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import FileBrowserModal from '../forms/FileBrowserModal';

/**
 * FrameStrip — horizontal strip of thumbnail frames extracted from a rendered MP4.
 * Fetches available frames for the given iteration. If none exist, offers an
 * "Extract Frames" button that prompts for the video path and triggers extraction.
 *
 * Props:
 *   iterationId — the iteration UUID to fetch/extract frames for
 */
export default function FrameStrip({ iterationId, renderPath: renderPathProp }) {
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [videoPath, setVideoPath] = useState('');
  const [frameCount, setFrameCount] = useState(4);
  const [expandedFrame, setExpandedFrame] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [framesDir, setFramesDir] = useState(null);
  const [copiedDir, setCopiedDir] = useState(false);
  const [outputDir, setOutputDir] = useState(null);

  // Fetch Wan2GP output dir for browse starting point
  useEffect(() => {
    api.getConfigPaths().then(p => setOutputDir(p.wan2gp_output_dir)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!iterationId) return;
    setLoading(true);
    setError(null);
    setFrames([]);
    setExpandedFrame(null);

    api.listFrames(iterationId)
      .then(async (data) => {
        if (data.frames?.length > 0) {
          setFrames(data.frames);
          if (data.frames_dir) setFramesDir(data.frames_dir);
        } else if (renderPathProp) {
          // No frames yet but render path is known — auto-extract
          try {
            const result = await api.extractFrames(renderPathProp, iterationId, frameCount);
            setFrames(result.frames || []);
            if (result.frames_dir) setFramesDir(result.frames_dir);
            if (renderPathProp) setVideoPath(renderPathProp);
          } catch {
            // Render file doesn't exist yet — that's fine, user hasn't rendered
          }
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
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

      {/* Frame thumbnails */}
      {frames.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
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
              <span className="absolute bottom-0.5 right-1 text-[10px] font-mono text-gray-400 bg-black/70 px-1 rounded">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Expanded frame view with navigation */}
      {expandedFrame && (
        <div className="relative">
          <img
            src={frameSrc(expandedFrame)}
            alt="Expanded frame"
            className="w-full rounded border border-gray-700"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              onClick={() => {
                const idx = frames.indexOf(expandedFrame);
                if (idx > 0) setExpandedFrame(frames[idx - 1]);
              }}
              disabled={frames.indexOf(expandedFrame) === 0}
              className="bg-black/70 text-gray-400 hover:text-gray-200 disabled:text-gray-600 rounded px-2 py-0.5 text-xs font-mono"
            >
              ← Prev
            </button>
            <span className="bg-black/70 text-gray-400 rounded px-2 py-0.5 text-xs font-mono">
              {frames.indexOf(expandedFrame) + 1}/{frames.length}
            </span>
            <button
              onClick={() => {
                const idx = frames.indexOf(expandedFrame);
                if (idx < frames.length - 1) setExpandedFrame(frames[idx + 1]);
              }}
              disabled={frames.indexOf(expandedFrame) === frames.length - 1}
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
      )}

      {/* Frames directory — copyable path for Claude web upload */}
      {framesDir && frames.length > 0 && (
        <div className="flex items-center gap-2 bg-surface rounded border border-accent/30 px-2 py-1.5">
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">Frames saved to:</span>
          <span className="text-xs font-mono text-accent break-all flex-1 select-all">{framesDir}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(framesDir);
              setCopiedDir(true);
              setTimeout(() => setCopiedDir(false), 1500);
            }}
            className={`px-2 py-0.5 rounded text-xs font-mono flex-shrink-0 ${
              copiedDir ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
            }`}
          >
            {copiedDir ? 'Copied' : 'Copy'}
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

      {/* Browse for render button */}
      {frames.length === 0 && !extracting && (
        <button
          onClick={() => setShowBrowser(true)}
          className="w-full py-2 border border-dashed border-gray-600 rounded text-xs font-mono text-gray-500 hover:text-accent hover:border-accent/50 transition-colors"
        >
          Browse for Render
        </button>
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
