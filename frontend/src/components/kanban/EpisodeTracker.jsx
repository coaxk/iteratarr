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

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading clips...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const grouped = {};
  for (const col of COLUMNS) grouped[col] = [];
  for (const clip of (clips || [])) {
    const status = clip.status || 'not_started';
    if (grouped[status]) grouped[status].push(clip);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Episode Tracker</h2>
        <button
          onClick={() => setShowCreateClip(true)}
          className="px-3 py-1.5 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90"
        >
          + New Clip
        </button>
      </div>

      {/* Kanban columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 overflow-x-auto">
          {COLUMNS.map(col => {
            const status = CLIP_STATUSES[col];
            return (
              <div key={col} className="flex-shrink-0 w-56">
                <div className="flex items-center gap-2 mb-3">
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
                              <ClipCard clip={clip} onClick={onSelectClip} isDragging={snapshot.isDragging} />
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
      </DragDropContext>

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
