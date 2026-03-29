import { useEffect, useState, useRef } from 'react';
import { api } from '../../api';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span onClick={handleCopy} className={`px-2 py-0.5 rounded text-xs font-mono cursor-pointer ${copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'}`}>
      {copied ? 'Copied' : 'Copy'}
    </span>
  );
}

function MonoBlock({ label, text }) {
  if (!text) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="px-3 py-2 text-xs font-mono text-gray-400 bg-surface rounded border border-gray-700/50 overflow-x-auto max-h-48 overflow-y-auto select-all whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

function ProvenSettings({ settings }) {
  if (!settings || Object.keys(settings).length === 0) return null;
  return (
    <div>
      <span className="text-xs font-mono text-gray-500 block mb-1">Proven Settings <span className="text-gray-700">(auto-updated when iterations are locked)</span></span>
      <div className="bg-surface rounded border border-gray-700/50 divide-y divide-gray-700/50">
        {Object.entries(settings).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-mono text-gray-400">{key}</span>
            <span className="text-xs font-mono text-accent">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReferencePhotos({ characterId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    api.getCharacterPhotos(characterId).then(data => {
      setPhotos(data.photos || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [characterId]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const photosData = [];
    for (const file of files.slice(0, 5)) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      photosData.push({ filename: file.name, data: base64 });
    }
    try {
      await api.uploadCharacterPhotos(characterId, photosData);
      const data = await api.getCharacterPhotos(characterId);
      setPhotos(data.photos || []);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
  };

  const handleDelete = async (filename) => {
    try {
      await api.deleteCharacterPhoto(characterId, filename);
      setPhotos(photos.filter(p => p.filename !== filename));
    } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-gray-500">Reference Photos <span className="text-gray-700">(for Vision API identity scoring)</span></span>
        <button onClick={() => fileRef.current?.click()} className="text-xs font-mono text-accent hover:text-accent/80">+ Upload</button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
      </div>
      {loading ? (
        <span className="text-xs font-mono text-gray-600">Loading...</span>
      ) : photos.length === 0 ? (
        <button onClick={() => fileRef.current?.click()} className="w-full py-3 border border-dashed border-gray-700 rounded text-xs font-mono text-gray-600 hover:text-accent hover:border-accent/30 transition-colors">
          Upload 3-5 reference photos for identity scoring
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map(p => (
            <div key={p.filename} className="relative shrink-0 group">
              <img src={p.url} alt={p.filename} className="h-16 w-auto rounded border border-gray-700" />
              <button
                onClick={() => handleDelete(p.filename)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-surface-raised border border-gray-600 text-gray-500 hover:text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >×</button>
            </div>
          ))}
          {photos.length < 5 && (
            <button onClick={() => fileRef.current?.click()} className="h-16 w-12 shrink-0 rounded border border-dashed border-gray-700 hover:border-accent flex items-center justify-center text-gray-600 hover:text-accent text-xs">+</button>
          )}
        </div>
      )}
    </div>
  );
}

function CharacterStatus({ character, clipCount }) {
  if (clipCount === 0) return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-600/20 text-gray-500">Untested</span>;
  if (character.best_score >= 65) return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-400/15 text-green-400">Production Ready</span>;
  if (character.best_score > 0) return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent">In Progress</span>;
  return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-400">Screening</span>;
}

function SeedStatsBlock({ seedStats }) {
  if (!seedStats || seedStats.count === 0) {
    return (
      <div className="border border-dashed border-gray-700 rounded px-3 py-2">
        <span className="text-xs font-mono text-gray-600">No seeds tested yet for this character.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500">Seeds Tested</span>
        <span className="text-xs font-mono text-gray-600">
          {seedStats.count} total · {seedStats.provenCount} proven
        </span>
      </div>
      <div className="space-y-1.5">
        {seedStats.items.map(seed => (
          <div key={seed.seed} className="flex items-center justify-between text-xs font-mono bg-surface border border-gray-700/50 rounded px-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-300 font-bold">Seed {seed.seed}</span>
              {seed.locked_count > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-green-400/15 text-green-400">Proven</span>
              )}
              {seed.locked_count === 0 && seed.selected_count > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">Selected</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-gray-500">{seed.evaluated_count} eval</span>
              <span className={seed.best_score != null ? 'text-accent font-bold' : 'text-gray-600'}>
                {seed.best_score != null ? `${seed.best_score}/75` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
      {seedStats.count > seedStats.items.length && (
        <span className="text-xs font-mono text-gray-600">Showing top {seedStats.items.length} by best score.</span>
      )}
    </div>
  );
}

export default function CharacterCard({ character, clipCount = 0, seedStats = null, onUpdated, onDeleted, onNavigateToClip }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [testing, setTesting] = useState(false);
  const [baselineJson, setBaselineJson] = useState(null);
  const [jsonCopied, setJsonCopied] = useState(false);

  const loraCount = character.lora_files?.length || 0;
  const canTest = !!character.locked_identity_block && loraCount > 0;

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await api.testCharacter(character.id);
      if (result.existing) {
        alert(`Baseline clip already exists: ${result.clip.name}`);
      }
      if (onNavigateToClip) onNavigateToClip(result.clip);
      onUpdated?.();
    } catch (err) {
      alert(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleGenerateJson = async () => {
    try {
      const result = await api.generateBaselineJson(character.id);
      setBaselineJson(result);
    } catch (err) {
      alert(`Generate failed: ${err.message}`);
    }
  };

  return (
    <div className="bg-surface-raised rounded border border-gray-700 hover:border-accent/50 transition-colors">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-mono text-gray-200 truncate">{character.name}</span>
          <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded shrink-0">
            {character.trigger_word}
          </span>
          <CharacterStatus character={character} clipCount={clipCount} />
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {seedStats?.count > 0 && (
            <span className="text-xs font-mono text-gray-600">
              {seedStats.count} seed{seedStats.count !== 1 ? 's' : ''}
            </span>
          )}
          {clipCount > 0 && (
            <span className="text-xs font-mono text-gray-600">{clipCount} clip{clipCount !== 1 ? 's' : ''}</span>
          )}
          {character.reference_photo_count > 0 && (
            <span className="text-xs font-mono text-gray-600">{character.reference_photo_count} ref</span>
          )}
          {loraCount > 0 && (
            <span className="text-xs font-mono text-gray-500">{loraCount} LoRA{loraCount !== 1 ? 's' : ''}</span>
          )}
          {character.best_score != null && (
            <span className="text-xs font-mono font-bold text-accent">{character.best_score}</span>
          )}
          <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-700/50">
          {/* Action buttons — prominent */}
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={!canTest || testing}
              className={`flex-1 py-2 rounded text-sm font-mono font-bold transition-colors ${
                canTest
                  ? 'bg-accent text-black hover:bg-accent/90'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
              title={!canTest ? 'Add identity block and LoRA files first' : 'Create baseline test clip and start screening'}
            >
              {testing ? 'Creating...' : 'Test This Character'}
            </button>
            <button
              onClick={handleGenerateJson}
              disabled={!character.locked_identity_block}
              className="flex-1 py-2 rounded text-sm font-mono font-bold bg-surface-overlay text-gray-300 border border-gray-600 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!character.locked_identity_block ? 'Add identity block first' : 'Generate Wan2GP-ready baseline JSON'}
            >
              Generate Baseline JSON
            </button>
          </div>

          {/* Guidance for incomplete characters */}
          {!canTest && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded px-3 py-2">
              <p className="text-xs font-mono text-amber-400">
                {!character.locked_identity_block && !loraCount ? 'Add identity block and LoRA files to enable testing.' :
                 !character.locked_identity_block ? 'Add identity block to enable testing.' :
                 'Add LoRA files to enable testing.'}
              </p>
            </div>
          )}

          {/* Generated baseline JSON */}
          {baselineJson && (
            <div className="border border-accent/30 bg-accent/5 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-accent font-bold">Baseline JSON Generated</span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(JSON.stringify(baselineJson.json, null, 2));
                    setJsonCopied(true);
                    setTimeout(() => setJsonCopied(false), 2000);
                  }}
                  className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${jsonCopied ? 'bg-score-high/20 text-score-high' : 'bg-accent text-black hover:bg-accent/90'}`}
                >
                  {jsonCopied ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <p className="text-xs font-mono text-gray-500">{baselineJson.note}</p>
              <p className="text-xs font-mono text-gray-600">Seed: {baselineJson.seed} — paste into seed screener or cold JSON fork</p>
            </div>
          )}

          {/* Reference Photos */}
          <ReferencePhotos characterId={character.id} />

          {/* Trigger word — prominent */}
          <div>
            <span className="text-xs font-mono text-gray-500 block mb-1">Trigger Word</span>
            <span className="text-sm font-mono text-accent font-bold">{character.trigger_word}</span>
          </div>

          {/* LoRA files with directory path */}
          {loraCount > 0 && (
            <div>
              <span className="text-xs font-mono text-gray-500 block mb-1">LoRA Files</span>
              {character.lora_dir && (
                <div className="flex items-center gap-2 mb-1.5 bg-surface rounded border border-gray-700/50 px-3 py-1.5">
                  <span className="text-xs font-mono text-gray-600 shrink-0">DIR:</span>
                  <span className="text-xs font-mono text-gray-400 truncate flex-1 select-all">{character.lora_dir}</span>
                  <CopyButton text={character.lora_dir} />
                </div>
              )}
              <div className="space-y-1">
                {character.lora_files.map((file, i) => {
                  const filename = file.includes('/') || file.includes('\\') ? file.split(/[/\\]/).pop() : file;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-surface rounded px-3 py-1.5 border border-gray-700/50" title={file}>
                      <span className="truncate flex-1">{filename}</span>
                      <CopyButton text={file} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Identity block */}
          <MonoBlock label="Locked Identity Block" text={character.locked_identity_block} />

          {/* Negative block */}
          <MonoBlock label="Locked Negative Block" text={character.locked_negative_block} />

          {/* Proven settings */}
          <ProvenSettings settings={character.proven_settings} />

          {/* Seed evidence */}
          <SeedStatsBlock seedStats={seedStats} />

          {/* Notes */}
          {character.notes && !editing && (
            <div>
              <span className="text-xs font-mono text-gray-500 block mb-1">Notes</span>
              <p className="text-xs font-mono text-gray-400 whitespace-pre-wrap">{character.notes}</p>
            </div>
          )}

          {/* Edit form */}
          {editing ? (
            <div className="space-y-2 border-t border-gray-700/50 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-mono text-gray-500 block mb-0.5">Name</label>
                  <input value={editData.name ?? character.name} onChange={e => setEditData(d => ({...d, name: e.target.value}))}
                    className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200" />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-500 block mb-0.5">Trigger Word</label>
                  <input value={editData.trigger_word ?? character.trigger_word} onChange={e => setEditData(d => ({...d, trigger_word: e.target.value}))}
                    className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200" />
                </div>
              </div>
              <div>
                <label className="text-xs font-mono text-gray-500 block mb-0.5">LoRA Directory</label>
                <input value={editData.lora_dir ?? character.lora_dir ?? ''} onChange={e => setEditData(d => ({...d, lora_dir: e.target.value}))}
                  className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-500 block mb-0.5">Notes</label>
                <textarea value={editData.notes ?? character.notes ?? ''} onChange={e => setEditData(d => ({...d, notes: e.target.value}))} rows={2}
                  className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={async () => {
                  try {
                    await api.updateCharacter(character.id, editData);
                    setEditing(false);
                    setEditData({});
                    onUpdated?.();
                  } catch (err) { alert(err.message); }
                }} className="px-3 py-1 bg-accent text-black text-xs font-mono font-bold rounded">Save</button>
                <button onClick={() => { setEditing(false); setEditData({}); }} className="px-3 py-1 text-xs font-mono text-gray-500">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 border-t border-gray-700/50 pt-3">
              <button onClick={() => setEditing(true)}
                className="px-3 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 border border-gray-700 rounded transition-colors">
                Edit
              </button>
              <button onClick={async () => {
                if (!window.confirm(`Delete character "${character.name}"? This cannot be undone.`)) return;
                try {
                  await api.deleteCharacter(character.id);
                  onDeleted?.();
                } catch (err) { alert(err.message); }
              }}
                className="px-3 py-1 text-xs font-mono text-gray-600 hover:text-score-low border border-gray-700 hover:border-score-low/30 rounded transition-colors">
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
