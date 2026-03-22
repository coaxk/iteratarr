import { useState, useEffect } from 'react';
import { api } from '../../api';

/**
 * FileBrowserModal -- modal file/directory browser for selecting files from
 * the local filesystem (via the backend /api/browser endpoint).
 *
 * Props:
 *   onSelect(filePath) -- called with the full path when a file is confirmed
 *   onClose            -- called to dismiss the modal
 *   title              -- modal header text (default: "Browse Files")
 *   filter             -- file extension filter like ".mp4" (optional)
 */
export default function FileBrowserModal({ onSelect, onClose, title = 'Browse Files', filter }) {
  const [currentPath, setCurrentPath] = useState(null);
  const [parentPath, setParentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDirectory = async (path) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    try {
      const data = await api.browseFiles(path);
      setCurrentPath(data.path);
      setParentPath(data.parent);

      // Apply extension filter to files if provided
      let filtered = data.entries;
      if (filter) {
        const ext = filter.toLowerCase();
        filtered = data.entries.filter(
          e => e.type === 'directory' || e.name.toLowerCase().endsWith(ext)
        );
      }
      setEntries(filtered);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(null); // Load default directory (project_base_dir)
  }, []);

  const handleEntryClick = (entry) => {
    if (entry.type === 'directory') {
      const dirPath = currentPath
        ? `${currentPath.replace(/\\/g, '/')}/${entry.name}`
        : entry.name;
      loadDirectory(dirPath);
    } else {
      setSelectedFile(entry);
    }
  };

  const handleEntryDoubleClick = (entry) => {
    if (entry.type === 'file') {
      const filePath = `${currentPath.replace(/\\/g, '/')}/${entry.name}`;
      onSelect(filePath);
    }
  };

  const handleConfirm = () => {
    if (selectedFile && currentPath) {
      const filePath = `${currentPath.replace(/\\/g, '/')}/${selectedFile.name}`;
      onSelect(filePath);
    }
  };

  // Build breadcrumb segments from the current path
  const breadcrumbs = [];
  if (currentPath) {
    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    let accumulated = '';
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      // On Windows, first part like "C:" needs the slash
      const fullPath = parts[0].includes(':') && accumulated === parts[0]
        ? `${accumulated}/`
        : accumulated;
      breadcrumbs.push({ label: part, path: fullPath });
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) + ' ' +
           d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-gray-700 rounded-lg w-[700px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-mono text-gray-200 font-bold">{title}</h3>
            {filter && (
              <p className="text-xs font-mono text-gray-500 mt-0.5">
                Showing {filter} files
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-gray-700/50 flex items-center gap-1 overflow-x-auto">
          {parentPath && (
            <button
              onClick={() => loadDirectory(parentPath)}
              className="text-xs font-mono text-gray-500 hover:text-accent flex-shrink-0"
            >
              ..
            </button>
          )}
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1 flex-shrink-0">
              {idx > 0 && <span className="text-xs text-gray-600">/</span>}
              <button
                onClick={() => loadDirectory(crumb.path)}
                className="text-xs font-mono text-gray-400 hover:text-accent"
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-2 min-h-[300px]">
          {loading && (
            <p className="text-xs font-mono text-gray-500 p-4">Loading...</p>
          )}

          {error && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2 m-2">
              <p className="text-xs font-mono text-score-low">{error}</p>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <p className="text-xs font-mono text-gray-500 p-4">No matching entries in this directory</p>
          )}

          {!loading && !error && entries.map((entry) => (
            <button
              key={entry.name}
              onClick={() => handleEntryClick(entry)}
              onDoubleClick={() => handleEntryDoubleClick(entry)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors ${
                selectedFile?.name === entry.name
                  ? 'bg-accent/20 border border-accent/50'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              {/* Icon/type indicator */}
              <span className={`text-xs font-mono flex-shrink-0 w-10 ${
                entry.type === 'directory' ? 'text-gray-300' : 'text-gray-200'
              }`}>
                {entry.type === 'directory' ? '[DIR]' : ''}
              </span>

              {/* Name */}
              <span className={`text-sm font-mono flex-1 truncate ${
                entry.type === 'directory' ? 'text-gray-300' : 'text-gray-200'
              }`}>
                {entry.name}
              </span>

              {/* Date + Size (files only) */}
              {entry.type === 'file' && entry.modified && (
                <span className="text-xs font-mono text-gray-600 flex-shrink-0">
                  {formatDate(entry.modified)}
                </span>
              )}
              {entry.type === 'file' && entry.size != null && (
                <span className="text-xs font-mono text-gray-500 flex-shrink-0 w-16 text-right">
                  {formatSize(entry.size)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          <span className="text-xs font-mono text-gray-500 truncate max-w-[60%]">
            {selectedFile ? `${currentPath?.replace(/\\/g, '/')}/${selectedFile.name}` : 'No file selected'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedFile}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
