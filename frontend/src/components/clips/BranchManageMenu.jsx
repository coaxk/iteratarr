import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { BRANCH_STATUSES } from '../../constants';

/**
 * BranchManageMenu — dropdown for managing a single branch.
 * Allows rename, status change (stall/abandon), and delete (if empty).
 *
 * Props:
 *   clipId    — parent clip ID
 *   branchId  — branch to manage
 *   onClose   — callback to close the menu
 *   onUpdated — callback after any change (triggers refetch)
 */
export default function BranchManageMenu({ clipId, branchId, onClose, onUpdated }) {
  const [branch, setBranch] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    api.getBranch(clipId, branchId).then(b => {
      setBranch(b);
      setNameDraft(b.name);
    }).catch(() => onClose());
  }, [branchId]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!branch) return null;

  const statusInfo = BRANCH_STATUSES[branch.status] || BRANCH_STATUSES.active;

  const handleRename = async () => {
    if (!nameDraft.trim()) return;
    try {
      await api.updateBranch(clipId, branchId, { name: nameDraft.trim() });
      setRenaming(false);
      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await api.updateBranch(clipId, branchId, { status: newStatus });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteBranch(clipId, branchId);
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  // Available status transitions based on current status
  const transitions = [];
  if (branch.status === 'active') {
    transitions.push({ status: 'stalled', label: 'Mark Stalled', desc: 'Progress has plateaued' });
    transitions.push({ status: 'abandoned', label: 'Abandon', desc: 'Give up on this seed' });
  }
  if (branch.status === 'stalled') {
    transitions.push({ status: 'active', label: 'Reactivate', desc: 'Resume iteration' });
    transitions.push({ status: 'abandoned', label: 'Abandon', desc: 'Give up on this seed' });
  }
  if (branch.status === 'abandoned') {
    transitions.push({ status: 'active', label: 'Reactivate', desc: 'Give it another try' });
  }
  if (branch.status === 'superseded') {
    transitions.push({ status: 'active', label: 'Reactivate', desc: 'Continue despite another branch being locked' });
  }

  return (
    <div
      ref={menuRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-gray-700 rounded-lg p-4 space-y-3 w-80 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-mono text-gray-200 font-bold">Manage Branch</h4>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm font-mono">×</button>
        </div>

        {/* Branch info */}
        <div className="text-xs font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Seed:</span>
            <span className="text-gray-300">{branch.seed}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status:</span>
            <span className={statusInfo.textColor}>{statusInfo.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Iterations:</span>
            <span className="text-gray-300">{branch.iteration_count || 0}</span>
          </div>
          {branch.best_score && (
            <div className="flex justify-between">
              <span className="text-gray-500">Best Score:</span>
              <span className="text-gray-300">{branch.best_score}/75</span>
            </div>
          )}
        </div>

        {/* Rename */}
        {renaming ? (
          <div className="flex gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
              className="flex-1 bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200"
            />
            <button onClick={handleRename} className="px-2 py-1 bg-accent text-black text-xs font-mono font-bold rounded">Save</button>
            <button onClick={() => setRenaming(false)} className="px-2 py-1 text-xs font-mono text-gray-500">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="w-full text-left px-3 py-1.5 rounded text-xs font-mono text-gray-400 hover:text-gray-200 hover:bg-surface-overlay transition-colors"
          >
            Rename branch
          </button>
        )}

        {/* Status transitions */}
        {transitions.map(t => (
          <button
            key={t.status}
            onClick={() => handleStatusChange(t.status)}
            className="w-full text-left px-3 py-1.5 rounded text-xs font-mono text-gray-400 hover:text-gray-200 hover:bg-surface-overlay transition-colors"
            title={t.desc}
          >
            {t.label}
            <span className="text-gray-600 ml-2">— {t.desc}</span>
          </button>
        ))}

        {/* Delete — empty branches or abandoned branches */}
        {((branch.iteration_count || 0) === 0 || branch.status === 'abandoned') && (
          <button
            onClick={() => {
              const count = branch.iteration_count || 0;
              if (count > 0) {
                if (!window.confirm(`Delete branch "${branch.name || branch.seed}" and its ${count} iteration${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
              }
              handleDelete();
            }}
            className="w-full text-left px-3 py-1.5 rounded text-xs font-mono text-score-low hover:bg-score-low/10 transition-colors"
          >
            Delete branch{(branch.iteration_count || 0) > 0 ? ` (${branch.iteration_count} iteration${branch.iteration_count !== 1 ? 's' : ''})` : ''}
          </button>
        )}

        {error && (
          <p className="text-xs font-mono text-score-low">{error}</p>
        )}
      </div>
    </div>
  );
}
