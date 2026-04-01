import { useState } from 'react';
import CopyButton from '../common/CopyButton';

export default function JsonViewer({ label, json, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!json) return null;

  const jsonText = typeof json === 'string' ? json : JSON.stringify(json, null, 2);

  return (
    <div className="border border-gray-700 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span>{label}</span>
        <div className="flex items-center gap-2">
          {open && <CopyButton text={jsonText} compact />}
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
