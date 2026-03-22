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

export default function CharacterCard({ character }) {
  const [expanded, setExpanded] = useState(false);

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

          {/* LoRA files */}
          {loraCount > 0 && (
            <div>
              <span className="text-xs font-mono text-gray-500 block mb-1">LoRA Files</span>
              <div className="space-y-1">
                {character.lora_files.map((file, i) => (
                  <div key={i} className="text-xs font-mono text-gray-400 bg-surface rounded px-3 py-1.5 border border-gray-700/50 truncate">
                    {file}
                  </div>
                ))}
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
          {character.notes && (
            <div>
              <span className="text-xs font-mono text-gray-500 block mb-1">Notes</span>
              <p className="text-xs font-mono text-gray-400 whitespace-pre-wrap">{character.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
