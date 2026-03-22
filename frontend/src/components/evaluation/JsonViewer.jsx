import { useState } from 'react';

export default function JsonViewer({ label, json, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  if (!json) return null;

  const jsonText = typeof json === 'string' ? json : JSON.stringify(json, null, 2);

  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-gray-700 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span>{label}</span>
        <div className="flex items-center gap-2">
          {open && (
            <span
              onClick={handleCopy}
              className={`px-2 py-0.5 rounded text-xs font-mono cursor-pointer ${
                copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
              }`}
            >
              {copied ? 'Copied' : 'Copy'}
            </span>
          )}
          <span className="text-gray-600">{open ? '\u25BC' : '\u25B6'}</span>
        </div>
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs font-mono text-gray-400 overflow-x-auto max-h-64 overflow-y-auto select-all whitespace-pre-wrap border-t border-gray-700/50">
          {jsonText}
        </pre>
      )}
    </div>
  );
}
