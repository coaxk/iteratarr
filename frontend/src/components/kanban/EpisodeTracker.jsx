import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { CLIP_STATUSES } from '../../constants';
import ClipCard from './ClipCard';
import CreateClipModal from '../forms/CreateClipModal';

const COLUMNS = ['not_started', 'screening', 'in_progress', 'evaluating', 'locked', 'in_queue'];

export default function EpisodeTracker({ onSelectClip }) {
  const { data: clips, loading, error, refetch } = useApi(() => api.listClips(), []);
  const [showCreateClip, setShowCreateClip] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [characterFilter, setCharacterFilter] = useState(null);

  const handleDeleteClip = async (clip) => {
    if (deleteConfirm?.id === clip.id) {
      // Second click — actually delete
      try {
        await api.deleteClip(clip.id, true);
        setDeleteConfirm(null);
        refetch();
      } catch (err) {
        console.error('Delete failed:', err);
        setDeleteConfirm(null);
      }
    } else {
      // First click — show confirmation
      setDeleteConfirm(clip);
    }
  };

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId;
    try {
      await api.updateClip(draggableId, { status: newStatus });
      refetch();
    } catch (err) {
      console.error('Failed to update clip status:', err);
    }
  };

  const handleRestore = async (clipId, toStatus = 'not_started') => {
    setRestoring(clipId);
    try {
      await api.updateClip(clipId, { status: toStatus });
      refetch();
    } catch (err) {
      console.error('Restore failed:', err);
    } finally {
      setRestoring(null);
    }
  };

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading clips...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  // Extract unique characters for filter
  const allCharacters = [...new Set((clips || []).flatMap(c => c.characters || []))].sort();

  // Filter and group clips
  const filtered = characterFilter
    ? (clips || []).filter(c => (c.characters || []).includes(characterFilter))
    : (clips || []);

  const grouped = {};
  for (const col of COLUMNS) grouped[col] = [];
  const archivedClips = [];
  for (const clip of filtered) {
    const status = clip.status || 'not_started';
    if (status === 'archived') {
      archivedClips.push(clip);
    } else if (grouped[status]) {
      grouped[status].push(clip);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Episode Tracker</h2>
          <p className="text-xs font-mono text-gray-600 mt-0.5">Drag clips between columns to update status. Click a clip to open it.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Character filter pills */}
          {allCharacters.length > 1 && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => setCharacterFilter(null)}
                className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                  !characterFilter ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                All
              </button>
              {allCharacters.map(char => (
                <button
                  key={char}
                  onClick={() => setCharacterFilter(characterFilter === char ? null : char)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                    characterFilter === char ? 'bg-accent/20 text-accent' : 'text-gray-600 hover:text-gray-300'
                  }`}
                >
                  {char}
                </button>
              ))}
            </div>
          )}
          {archivedClips.length > 0 && (
            <button
              onClick={() => setShowArchive(!showArchive)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                showArchive
                  ? 'bg-gray-600 text-gray-200'
                  : 'border border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              Archived ({archivedClips.length})
            </button>
          )}
          <button
            onClick={() => setShowCreateClip(true)}
            className="px-3 py-1.5 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90"
          >
            + New Clip
          </button>
        </div>
      </div>

      {/* Empty state */}
      {(!clips || clips.length === 0) && (
        <div className="border border-dashed border-gray-700 rounded-lg p-8 text-center">
          <p className="text-sm font-mono text-gray-400 mb-2">No clips yet</p>
          <p className="text-xs font-mono text-gray-600 mb-4">Create your first clip to start the iteration loop. Each clip represents one video segment in your production.</p>
          <button
            onClick={() => setShowCreateClip(true)}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90"
          >
            + Create First Clip
          </button>
        </div>
      )}

      {/* Archive view */}
      {showArchive && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono text-gray-200 font-bold">Archived Clips</h3>
            <button
              onClick={() => setShowArchive(false)}
              className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
            >
              Back to Tracker
            </button>
          </div>
          {archivedClips.length === 0 ? (
            <p className="text-xs font-mono text-gray-600">No archived clips</p>
          ) : (
            <div className="space-y-2">
              {archivedClips.map(clip => (
                <div key={clip.id} className="flex items-center justify-between bg-surface border border-gray-700 rounded p-3">
                  <div>
                    <span className="text-sm font-mono text-gray-300">{clip.name}</span>
                    <div className="flex gap-3 text-xs font-mono text-gray-600 mt-0.5">
                      {clip.location && <span>{clip.location}</span>}
                      {clip.characters?.length > 0 && <span>{clip.characters.join(', ')}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(clip.id, 'not_started')}
                      disabled={restoring === clip.id}
                      className="px-3 py-1 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
                    >
                      {restoring === clip.id ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      onClick={() => handleDeleteClip(clip)}
                      className="px-3 py-1 text-xs font-mono text-gray-600 hover:text-score-low transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2 flex items-center justify-between">
          <p className="text-xs font-mono text-score-low">
            Delete "{deleteConfirm.name}"? Click × again to confirm.
          </p>
          <button onClick={() => setDeleteConfirm(null)} className="text-xs font-mono text-gray-500 hover:text-gray-300">
            Cancel
          </button>
        </div>
      )}

      {/* Kanban columns — hidden when viewing archive */}
      {!showArchive && <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 min-w-0">
          {COLUMNS.map(col => {
            const status = CLIP_STATUSES[col];
            return (
              <div key={col} className="flex-1 min-w-0">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full ${status.color}`} />
                  <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider">{status.label}</h3>
                  <span className="text-xs font-mono text-gray-600">{grouped[col].length}</span>
                </div>
                <Droppable droppableId={col}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 min-h-[100px] transition-colors rounded ${snapshot.isDraggingOver ? 'bg-accent/5' : ''}`}
                    >
                      {grouped[col].map((clip, index) => (
                        <Draggable key={clip.id} draggableId={clip.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <ClipCard
                                clip={clip}
                                onClick={onSelectClip}
                                onDelete={handleDeleteClip}
                                onArchive={async (c) => { await api.updateClip(c.id, { status: 'archived' }); refetch(); }}
                                isDragging={snapshot.isDragging}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>}

      {/* Create Clip Modal */}
      {showCreateClip && (
        <CreateClipModal
          onCreated={() => { setShowCreateClip(false); refetch(); }}
          onClose={() => setShowCreateClip(false)}
        />
      )}
    </div>
  );
}
