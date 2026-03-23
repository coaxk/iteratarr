import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import SeedCard from './SeedCard';

/**
 * SeedScreening — main "Step 0" component for comparing renders across
 * multiple seeds before committing to the iteration loop.
 *
 * Features:
 * - Setup form: paste base JSON, choose seed count, optional manual seeds
 * - Generate screening JSONs via API
 * - Contact sheet grid: 2-3 column responsive grid of SeedCards
 * - Polling: checks for render files every 10s
 * - Click to expand: frame strip + video player + "Select This Seed" button
 * - Reference images section at top (optional)
 *
 * Props:
 *   clip           — clip record from the store
 *   onSeedSelected — callback when user selects a seed and iter_01 is created
 *   onBack         — callback to go back to clip detail
 */
export default function SeedScreening({ clip, onSeedSelected, onBack }) {
  // Setup state
  const [baseJsonText, setBaseJsonText] = useState('');
  const [seedCount, setSeedCount] = useState(6);
  const [manualSeeds, setManualSeeds] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  // Screening results state
  const [screenRecords, setScreenRecords] = useState([]);
  const [hasScreening, setHasScreening] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedSeed, setSelectedSeed] = useState(null);
  const [selecting, setSelecting] = useState(false);

  // Render status
  const [renderStatus, setRenderStatus] = useState(null);
  const [renderConfirm, setRenderConfirm] = useState(null);

  // Reference images
  const [referenceImages, setReferenceImages] = useState([]);

  // Polling
  const pollRef = useRef(null);

  // Load existing screening records on mount
  useEffect(() => {
    loadScreenRecords();
  }, [clip.id]);

  // Poll for render completion every 10s when we have unrendered screens
  useEffect(() => {
    if (!hasScreening) return;

    const hasUnrendered = screenRecords.some(r => !r.frames || r.frames.length === 0);
    if (!hasUnrendered) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(() => {
      checkRenders();
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasScreening, screenRecords]);

  const loadScreenRecords = async () => {
    try {
      const records = await api.getSeedScreen(clip.id);
      if (records.length > 0) {
        setScreenRecords(records);
        setHasScreening(true);
        const selected = records.find(r => r.selected);
        if (selected) setSelectedSeed(selected.seed);
      }
    } catch { /* no screening yet */ }
  };

  const checkRenders = async () => {
    // For each record without frames, try to extract them
    const updated = [...screenRecords];
    let changed = false;

    for (let i = 0; i < updated.length; i++) {
      const record = updated[i];
      if (record.frames && record.frames.length > 0) continue;

      try {
        // Try extracting frames — if the render exists, this will succeed
        const result = await api.extractFrames(record.render_path, record.id, 4);
        if (result.frames && result.frames.length > 0) {
          updated[i] = { ...record, frames: result.frames };
          // Persist frames to the seed_screen record
          await api.updateSeedScreen(clip.id, record.id, { frames: result.frames });
          changed = true;
        }
      } catch { /* render not ready yet */ }
    }

    if (changed) {
      setScreenRecords(updated);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);

    try {
      // Parse base JSON
      let baseJson;
      try {
        baseJson = JSON.parse(baseJsonText);
      } catch {
        setGenerateError('Invalid JSON. Paste a valid Wan2GP generation JSON.');
        setGenerating(false);
        return;
      }

      // Parse manual seeds if provided
      let seeds = [];
      if (manualSeeds.trim()) {
        seeds = manualSeeds.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(s => !isNaN(s));
      }

      const result = await api.generateSeedScreen(clip.id, {
        base_json: baseJson,
        seeds,
        count: seedCount
      });

      // Reload screen records from API to get full records
      await loadScreenRecords();
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectSeed = async (seed) => {
    setSelecting(true);
    try {
      const iteration = await api.selectSeed(clip.id, { seed });
      setSelectedSeed(seed);
      if (onSeedSelected) onSeedSelected(iteration);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setSelecting(false);
    }
  };

  const handleRate = async (screenId, rating) => {
    try {
      await api.updateSeedScreen(clip.id, screenId, { rating });
      setScreenRecords(prev => prev.map(r =>
        r.id === screenId ? { ...r, rating } : r
      ));
    } catch { /* rating failed silently */ }
  };

  const handleDelete = async (screenId) => {
    try {
      await api.deleteSeedScreen(clip.id, screenId);
      setScreenRecords(prev => prev.filter(r => r.id !== screenId));
      if (expandedId === screenId) setExpandedId(null);
    } catch (err) {
      setGenerateError(`Delete failed: ${err.message}`);
    }
  };

  const handleRender = async (jsonPath, screenId) => {
    try {
      await api.submitRender(jsonPath);
      setRenderConfirm(screenId);
      setTimeout(() => setRenderConfirm(null), 3000);
    } catch (err) {
      setRenderStatus(`Render failed: ${err.message}`);
      setTimeout(() => setRenderStatus(null), 5000);
    }
  };

  const handleReferenceImage = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReferenceImages(prev => [...prev, { name: file.name, src: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeReference = (idx) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== idx));
  };

  const frameSrc = (screenId, filename) => `/api/frames/${screenId}/${filename}`;

  const expandedRecord = expandedId ? screenRecords.find(r => r.id === expandedId) : null;

  // --- Render ---

  // Setup form (no screening yet)
  if (!hasScreening) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-xs font-mono text-gray-500 hover:text-accent transition-colors">
          &larr; Back
        </button>

        <div className="border border-gray-700 rounded p-4 space-y-4">
          <h3 className="text-sm font-mono text-gray-200 font-bold">Seed Screening Setup</h3>
          <p className="text-xs font-mono text-gray-500">
            Generate multiple renders with different seeds to find the best starting point for your iteration loop.
            Paste a Wan2GP generation JSON, choose how many seeds to test, then render them in Wan2GP.
          </p>

          {/* Base JSON input */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Base Generation JSON</label>
            <textarea
              value={baseJsonText}
              onChange={(e) => setBaseJsonText(e.target.value)}
              placeholder='Paste Wan2GP generation JSON here...'
              rows={8}
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 resize-y"
            />
          </div>

          {/* Seed count */}
          <div className="flex gap-4">
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Number of Seeds</label>
              <input
                type="number"
                min={1}
                max={12}
                value={seedCount}
                onChange={(e) => setSeedCount(Math.min(12, Math.max(1, parseInt(e.target.value) || 6)))}
                className="w-20 bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-mono text-gray-500 block mb-1">Manual Seeds (optional, comma-separated)</label>
              <input
                type="text"
                value={manualSeeds}
                onChange={(e) => setManualSeeds(e.target.value)}
                placeholder="544083690, 123456789, ..."
                className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
              />
              <span className="text-xs font-mono text-gray-600">If provided, these seeds will be used instead of random ones</span>
            </div>
          </div>

          {/* Error */}
          {generateError && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{generateError}</p>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || !baseJsonText.trim()}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Screening JSONs'}
          </button>
        </div>
      </div>
    );
  }

  // Contact sheet view (screening in progress)
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs font-mono text-gray-500 hover:text-accent transition-colors">
        &larr; Back
      </button>

      {/* Header with render controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono text-gray-200 font-bold">
          Seed Screening: {clip.name}
          <span className="ml-2 text-xs font-normal text-gray-500">
            {screenRecords.length} seeds
            {screenRecords.filter(r => r.frames?.length > 0).length > 0 && (
              <> — {screenRecords.filter(r => r.frames?.length > 0).length} rendered</>
            )}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {selectedSeed && (
            <span className="text-xs font-mono text-accent font-bold">
              Selected: {selectedSeed}
            </span>
          )}
          {screenRecords.some(r => !r.frames || r.frames.length === 0) && (
            <button
              onClick={async () => {
                const unrendered = screenRecords.filter(r => !r.frames || r.frames.length === 0);
                const paths = unrendered.map(r => r.json_path);
                try {
                  await api.submitBatchPaths(paths);
                  setRenderStatus(`Submitted ${paths.length} renders to Wan2GP`);
                  setTimeout(() => setRenderStatus(null), 5000);
                } catch (err) {
                  setRenderStatus(`Render failed: ${err.message}`);
                }
              }}
              className="px-3 py-1.5 bg-score-high text-black text-xs font-mono font-bold rounded hover:bg-green-400 transition-colors"
            >
              Render All in Wan2GP
            </button>
          )}
        </div>
      </div>

      {/* Render status banner */}
      {renderStatus && (
        <div className="border border-score-high/50 bg-score-high/10 rounded px-3 py-2">
          <p className="text-xs font-mono text-score-high">{renderStatus}</p>
        </div>
      )}

      {/* Guidance — where are the JSONs, what to do next */}
      {screenRecords.length > 0 && screenRecords.some(r => !r.frames || r.frames.length === 0) && (
        <div className="border border-accent/30 bg-accent/5 rounded p-3 space-y-2">
          <p className="text-xs font-mono text-accent font-bold">Load these JSONs into Wan2GP to render:</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {screenRecords.filter(r => !r.frames || r.frames.length === 0).map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400 shrink-0">Seed {r.seed}:</span>
                <span className="text-xs font-mono text-gray-300 break-all select-all flex-1">{r.json_path}</span>
                <button
                  onClick={async () => { await navigator.clipboard.writeText(r.json_path); }}
                  className="px-1.5 py-0.5 rounded text-xs font-mono bg-surface-overlay text-gray-600 hover:text-gray-400 shrink-0"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs font-mono text-gray-500">Renders will auto-detect when complete. Checking every 10 seconds.</p>
        </div>
      )}

      {/* Reference images */}
      <div className="border border-gray-700 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">Reference Images</span>
          <label className="text-xs font-mono text-gray-500 hover:text-accent cursor-pointer transition-colors">
            + Add
            <input type="file" accept="image/*" multiple onChange={handleReferenceImage} className="hidden" />
          </label>
        </div>
        {referenceImages.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {referenceImages.map((img, idx) => (
              <div key={idx} className="flex-shrink-0 relative group">
                <img src={img.src} alt={img.name} className="h-20 w-auto rounded border border-gray-700" />
                <button
                  onClick={() => removeReference(idx)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 border border-gray-600 rounded-full text-xs text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-mono text-gray-600 italic">No reference images added. Optional — helps with visual comparison.</p>
        )}
      </div>

      {/* Error */}
      {generateError && (
        <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
          <p className="text-xs font-mono text-score-low">{generateError}</p>
        </div>
      )}

      {/* Contact sheet grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {screenRecords.map(record => (
          <SeedCard
            key={record.id}
            record={record}
            onSelect={handleSelectSeed}
            onRate={handleRate}
            onExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
            onDelete={handleDelete}
            onRender={handleRender}
            isSelected={record.seed === selectedSeed}
            expanded={expandedId === record.id}
            frameSrc={frameSrc}
            renderConfirm={renderConfirm}
          />
        ))}
      </div>

      {/* Expanded view */}
      {expandedRecord && (
        <div className="border border-gray-700 rounded p-4 space-y-3 bg-surface-raised">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-gray-200 font-bold">Seed: {expandedRecord.seed}</span>
            <button
              onClick={() => setExpandedId(null)}
              className="text-xs font-mono text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>

          {/* Frame strip */}
          {expandedRecord.frames && expandedRecord.frames.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {expandedRecord.frames.map((filename, idx) => (
                <img
                  key={filename}
                  src={frameSrc(expandedRecord.id, filename)}
                  alt={`Frame ${idx + 1}`}
                  className="h-24 w-auto rounded border border-gray-700"
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 rounded border border-dashed border-gray-700">
              <span className="text-xs font-mono text-accent animate-pulse">Waiting for render...</span>
            </div>
          )}

          {/* Video player */}
          {expandedRecord.frames && expandedRecord.frames.length > 0 && (
            <video
              key={expandedRecord.render_path}
              src={`/api/video?path=${encodeURIComponent(expandedRecord.render_path)}`}
              controls
              loop
              muted
              className="w-full rounded border border-gray-700 bg-black"
              style={{ maxHeight: '300px' }}
            />
          )}

          {/* Select this seed button */}
          <button
            onClick={() => handleSelectSeed(expandedRecord.seed)}
            disabled={selecting || expandedRecord.seed === selectedSeed}
            className={`w-full py-2 rounded text-sm font-mono font-bold transition-colors ${
              expandedRecord.seed === selectedSeed
                ? 'bg-accent/20 text-accent'
                : 'bg-accent text-black hover:bg-accent/90 disabled:opacity-50'
            }`}
          >
            {selecting ? 'Creating iteration...' : expandedRecord.seed === selectedSeed ? 'Seed Selected' : 'Select This Seed'}
          </button>
        </div>
      )}

      {/* Polling status indicator */}
      {screenRecords.some(r => !r.frames || r.frames.length === 0) && (
        <div className="flex items-center gap-2 text-xs font-mono text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Polling for renders every 10s
        </div>
      )}
    </div>
  );
}
