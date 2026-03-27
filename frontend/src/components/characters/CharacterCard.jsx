import { useState } from 'react';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      onClick={handleCopy}
      className={`px-2 py-0.5 rounded text-xs font-mono cursor-pointer ${
        copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
      }`}
    >
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
      <span className="text-xs font-mono text-gray-500 block mb-1">Proven Settings</span>
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

export default function CharacterCard({ character, onUpdated, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const loraCount = character.lora_files?.length || 0;

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
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
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
                  // Show just filename, full path on hover
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
                    const { api } = await import('../../api');
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
                  const { api } = await import('../../api');
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
