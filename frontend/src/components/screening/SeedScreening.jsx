import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { getAutoRender } from '../../hooks/useAutoRender';
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
function LightboxViewer({ frames, index, frameSrc, onClose, onNavigate }) {
  const prev = (index - 1 + frames.length) % frames.length;
  const next = (index + 1) % frames.length;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(prev);
      if (e.key === 'ArrowRight') onNavigate(next);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, prev, next]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Previous arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate(prev); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl font-mono transition-colors z-10"
      >
        ‹
      </button>

      {/* Frame image — as large as possible */}
      <img
        src={frameSrc(frames[index])}
        alt={`Frame ${index + 1} of ${frames.length}`}
        className="max-w-[95vw] max-h-[95vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate(next); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl font-mono transition-colors z-10"
      >
        ›
      </button>

      {/* Frame counter + close */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-mono text-gray-400">
        Frame {index + 1} / {frames.length}
      </div>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-mono"
      >
        ×
      </button>
      <span className="absolute bottom-4 text-xs font-mono text-gray-600">Arrow keys to navigate · Esc to close</span>
    </div>
  );
}

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
  const [queueConfirm, setQueueConfirm] = useState(null);

  // Reference images
  const [referenceImages, setReferenceImages] = useState([]);
  const [showRefImages, setShowRefImages] = useState(true);

  // Lightbox for full-size frame viewing
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Add more seeds
  const [showAddSeeds, setShowAddSeeds] = useState(false);

  // Reference image lightbox
  const [refLightboxIndex, setRefLightboxIndex] = useState(null);

  // Contact sheets cache — keyed by record ID
  const [contactSheets, setContactSheets] = useState({});

  // Polling
  const pollRef = useRef(null);

  // Load existing screening records on mount
  useEffect(() => {
    loadScreenRecords();
  }, [clip.id]);

  // Poll for render completion — 20s when unrendered seeds exist, stops when all done
  // Note: keeping setInterval here because checkRenders mutates local screenRecords state
  // Full TanStack migration requires refactoring screenRecords to query-managed state
  const hasUnrendered = hasScreening && screenRecords.some(r => !r.frames || r.frames.length === 0);
  useEffect(() => {
    if (!hasUnrendered) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(checkRenders, 20000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [hasUnrendered]);

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

      // Auto-submit all generated seed renders to Wan2GP if auto-render is enabled
      if (getAutoRender() && result.records?.length > 0) {
        const paths = result.records.map(r => r.json_path).filter(Boolean);
        if (paths.length > 0) {
          try {
            await api.submitBatchPaths(paths);
            setRenderStatus(`Auto-submitted ${paths.length} seed renders to Wan2GP`);
            setTimeout(() => setRenderStatus(null), 5000);
          } catch (err) {
            setRenderStatus(`Auto-render failed: ${err.message}`);
            setTimeout(() => setRenderStatus(null), 5000);
          }
        }
      }
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectSeed = async (seed) => {
    // Unselect — just clear local state, no API call
    if (seed === null) {
      setSelectedSeed(null);
      return;
    }
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

  const handleAddToQueue = async (record) => {
    try {
      await api.addToQueue({
        json_path: record.json_path,
        clip_name: `${clip.name} — Seed ${record.seed}`,
        iteration_id: null,
        seed: record.seed,
        source: 'screening'
      });
      setQueueConfirm(record.id);
      setTimeout(() => setQueueConfirm(null), 3000);
    } catch (err) {
      setRenderStatus(`Queue failed: ${err.message}`);
      setTimeout(() => setRenderStatus(null), 5000);
    }
  };

  // Load persisted reference images from clip record
  useEffect(() => {
    if (clip.reference_images?.length > 0) {
      setReferenceImages(clip.reference_images);
    }
  }, [clip.id]);

  const saveReferenceImages = async (images) => {
    try {
      await api.updateClip(clip.id, { reference_images: images });
    } catch { /* save failed silently */ }
  };

  const handleReferenceImage = (e) => {
    const files = Array.from(e.target.files);
    const newImages = [];
    let loaded = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newImages.push({ name: file.name, src: ev.target.result });
        loaded++;
        if (loaded === files.length) {
          setReferenceImages(prev => {
            const updated = [...prev, ...newImages];
            saveReferenceImages(updated);
            return updated;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeReference = (idx) => {
    setReferenceImages(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      saveReferenceImages(updated);
      return updated;
    });
  };

  // Auto-generate contact sheet when expanding a record with frames
  useEffect(() => {
    if (expandedId && !contactSheets[expandedId]) {
      const record = screenRecords.find(r => r.id === expandedId);
      if (record?.frames?.length > 0) {
        api.createContactSheet({ frame_id: expandedId, metadata: { seed: record.seed } })
          .then(result => {
            console.log('[ContactSheet] Generated:', result.filename);
            setContactSheets(prev => ({ ...prev, [expandedId]: result.filename }));
          })
          .catch(err => console.error('[ContactSheet] Failed:', err.message));
      }
    }
  }, [expandedId]);

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

          {/* LoRA reminder */}
          {baseJsonText.trim() && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded px-3 py-2">
              <p className="text-xs font-mono text-amber-400">
                Check your <span className="font-bold">activated_loras</span> — make sure the right LoRA pair (high + low) is selected for this character before generating.
              </p>
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
          <button
            onClick={() => setShowAddSeeds(!showAddSeeds)}
            className="px-3 py-1.5 border border-gray-700 text-gray-400 text-xs font-mono rounded hover:text-accent hover:border-accent/30 transition-colors"
          >
            {showAddSeeds ? 'Cancel' : '+ Add Seeds'}
          </button>
          {selectedSeed && (
            <span className="text-xs font-mono text-accent font-bold">
              Selected: {selectedSeed}
            </span>
          )}
          {screenRecords.some(r => !r.frames || r.frames.length === 0) && (
            <>
              <button
                onClick={async () => {
                  const unrendered = screenRecords.filter(r => !r.frames || r.frames.length === 0);
                  try {
                    for (const r of unrendered) {
                      await api.addToQueue({
                        json_path: r.json_path,
                        clip_name: `${clip.name} — Seed ${r.seed}`,
                        seed: r.seed,
                        source: 'screening'
                      });
                    }
                    setRenderStatus(`Added ${unrendered.length} seeds to render queue`);
                    setTimeout(() => setRenderStatus(null), 5000);
                  } catch (err) {
                    setRenderStatus(`Queue failed: ${err.message}`);
                  }
                }}
                className="px-3 py-1.5 border border-gray-600 text-gray-300 text-xs font-mono font-bold rounded hover:border-accent hover:text-accent transition-colors"
              >
                Queue All
              </button>
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
                Render All Now
              </button>
            </>
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
          <p className="text-xs font-mono text-accent font-bold">Pending renders — load in Wan2GP or use Render buttons:</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {screenRecords.filter(r => !r.frames || r.frames.length === 0).map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400 shrink-0">Seed {r.seed}:</span>
                <span className="text-xs font-mono text-gray-300 break-all select-all flex-1 truncate" title={r.json_path}>{r.json_path}</span>
                <button
                  onClick={async () => { await navigator.clipboard.writeText(r.json_path); }}
                  className="px-1.5 py-0.5 rounded text-xs font-mono bg-surface-overlay text-gray-600 hover:text-gray-400 shrink-0"
                  title="Copy JSON path to clipboard"
                >
                  Copy
                </button>
                <button
                  onClick={() => handleAddToQueue(r)}
                  className={`px-1.5 py-0.5 rounded text-xs font-mono shrink-0 transition-colors ${
                    queueConfirm === r.id
                      ? 'bg-accent/20 text-accent'
                      : 'bg-surface-overlay text-gray-400 border border-gray-600 hover:border-accent hover:text-accent'
                  }`}
                  title="Add to render queue for batch processing"
                >
                  {queueConfirm === r.id ? 'Queued' : 'Queue'}
                </button>
                <button
                  onClick={() => handleRender(r.json_path, r.id)}
                  className="px-1.5 py-0.5 rounded text-xs font-mono bg-accent text-black hover:bg-accent/90 shrink-0"
                  title="Submit this seed to Wan2GP for rendering now"
                >
                  Render
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="px-1 py-0.5 rounded text-xs font-mono text-gray-600 hover:text-score-low shrink-0"
                  title="Remove this seed from screening"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs font-mono text-gray-500">Renders will auto-detect when complete. Checking every 10 seconds.</p>
        </div>
      )}

      {/* Add more seeds — inline form */}
      {showAddSeeds && (
        <div className="border border-accent/30 bg-accent/5 rounded p-3 space-y-3">
          <h4 className="text-xs font-mono text-accent font-bold">Add More Seeds</h4>
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Base Generation JSON</label>
            <textarea
              value={baseJsonText}
              onChange={(e) => setBaseJsonText(e.target.value)}
              placeholder='Paste Wan2GP generation JSON here...'
              rows={4}
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 resize-y"
            />
          </div>
          <div className="flex gap-4">
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Count</label>
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
              <label className="text-xs font-mono text-gray-500 block mb-1">Manual Seeds (optional)</label>
              <input
                type="text"
                value={manualSeeds}
                onChange={(e) => setManualSeeds(e.target.value)}
                placeholder="544083690, 123456789, ..."
                className="w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600"
              />
            </div>
          </div>
          <button
            onClick={async () => {
              await handleGenerate();
              setShowAddSeeds(false);
            }}
            disabled={generating || !baseJsonText.trim()}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      )}

      {/* Reference photos — collapsible, for comparing renders against the real person */}
      <div className="border border-gray-700/50 rounded px-3 py-2">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowRefImages(!showRefImages)} className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors">
            {showRefImages ? '\u25BC' : '\u25B6'} Reference Photos {referenceImages.length > 0 ? `(${referenceImages.length})` : ''}
          </button>
          <label className="text-xs font-mono text-gray-600 hover:text-accent cursor-pointer transition-colors">
            + Add
            <input type="file" accept="image/*" multiple onChange={handleReferenceImage} className="hidden" />
          </label>
        </div>
        {showRefImages && referenceImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
            {referenceImages.map((img, idx) => (
              <div key={idx} className="flex-shrink-0 relative group">
                <img
                  src={img.src}
                  alt={img.name}
                  className="h-16 w-auto rounded border border-gray-700 cursor-pointer hover:border-accent transition-colors"
                  onClick={() => setRefLightboxIndex(idx)}
                />
                <button
                  onClick={() => removeReference(idx)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 border border-gray-600 rounded-full text-xs text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  x
                </button>
              </div>
            ))}
          </div>
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

          {/* Frame strip with copy path */}
          {expandedRecord.frames && expandedRecord.frames.length > 0 ? (
            <div className="space-y-1">
              <div className="flex gap-2 overflow-x-auto pb-1 items-end scrollbar-hide">
                {expandedRecord.frames.map((filename, idx) => (
                  <img
                    key={filename}
                    src={frameSrc(expandedRecord.id, filename)}
                    alt={`Frame ${idx + 1}`}
                    title={`Frame ${idx + 1} — click to view full size`}
                    className="h-40 w-auto rounded border border-gray-700 hover:border-accent cursor-pointer transition-colors"
                    onClick={() => setLightboxIndex(idx)}
                  />
                ))}
                {/* Contact sheet — auto-generated, click to save for Tenzing */}
                {contactSheets[expandedRecord.id] && (
                  <div className="flex-shrink-0 relative">
                    <a
                      href={`/api/contactsheet/${contactSheets[expandedRecord.id]}`}
                      download={contactSheets[expandedRecord.id]}
                      title="Click to download — then drag to Tenzing"
                      className="block"
                    >
                      <img
                        src={`/api/contactsheet/${contactSheets[expandedRecord.id]}`}
                        alt="Contact sheet"
                        className="h-40 w-auto rounded border-2 border-accent cursor-pointer hover:brightness-110 transition-all"
                      />
                    </a>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const result = await api.createContactSheet({ frame_id: expandedRecord.id, metadata: { seed: expandedRecord.seed } });
                          const framesData = await api.listFrames(expandedRecord.id);
                          const dir = framesData.frames_dir || result.path.replace(/[/\\][^/\\]+$/, '');
                          await navigator.clipboard.writeText(dir);
                        } catch {}
                      }}
                      className="absolute bottom-1 left-1 text-xs font-mono bg-black/80 text-accent px-1.5 py-0.5 rounded hover:bg-black transition-colors"
                      title="Copy contact sheet path for Tenzing"
                    >
                      Copy path
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-600">Frames:</span>
                <button
                  onClick={async () => {
                    // Get the actual disk path from the frames API
                    try {
                      const data = await api.listFrames(expandedRecord.id);
                      if (data.frames_dir) {
                        await navigator.clipboard.writeText(data.frames_dir);
                      }
                    } catch {}
                  }}
                  className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
                  title="Copy frames folder path — paste into Claude web file picker to upload for AI evaluation"
                >
                  Copy folder path for Claude
                </button>
              </div>
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

      {/* Lightbox overlay — full-screen frame viewer with arrow navigation */}
      {lightboxIndex !== null && expandedRecord?.frames?.length > 0 && (
        <LightboxViewer
          frames={expandedRecord.frames}
          index={lightboxIndex}
          frameSrc={(filename) => frameSrc(expandedRecord.id, filename)}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {/* Reference photo lightbox */}
      {refLightboxIndex !== null && referenceImages.length > 0 && (
        <LightboxViewer
          frames={referenceImages}
          index={refLightboxIndex}
          frameSrc={(img) => img.src}
          onClose={() => setRefLightboxIndex(null)}
          onNavigate={setRefLightboxIndex}
        />
      )}
    </div>
  );
}
