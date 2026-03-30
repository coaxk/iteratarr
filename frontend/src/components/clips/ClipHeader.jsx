export default function ClipHeader({ clip, status, meta, onBack }) {
  const {
    currentGoal, editingGoal, goalDraft, goalSaving,
    startEditGoal, setGoalDraft, handleGoalSave, handleGoalCancel,
    currentClipName, renamingClip, clipNameDraft, setClipNameDraft,
    startRename, cancelRename, handleRenameSave,
  } = meta;

  return (
    <>
      <button
        onClick={onBack}
        className="text-xs font-mono text-gray-500 hover:text-accent transition-colors"
      >
        &larr; Back to Episode Tracker
      </button>

      <div className="border border-gray-700 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          {renamingClip ? (
            <div className="flex items-center gap-2">
              <input
                value={clipNameDraft}
                onChange={(e) => setClipNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSave();
                  if (e.key === 'Escape') cancelRename();
                }}
                autoFocus
                className="bg-surface border border-gray-600 rounded px-2 py-1 text-lg font-mono text-gray-200"
              />
              <button
                onClick={handleRenameSave}
                className="px-2 py-1 bg-accent text-black text-xs font-mono font-bold rounded"
              >
                Save
              </button>
              <button
                onClick={cancelRename}
                className="text-xs font-mono text-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h2
              className="text-lg font-mono text-gray-200 cursor-pointer hover:text-accent transition-colors"
              onClick={startRename}
              title="Click to rename"
            >
              {currentClipName}
            </h2>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono ${status.color} text-black font-bold`}>
            {status.label}
          </span>
        </div>

        <div className="flex gap-4 text-xs font-mono text-gray-400">
          {clip.location && <span>Location: {clip.location}</span>}
          {clip.characters?.length > 0 && (
            <span className="flex items-center gap-1">
              Characters:{' '}
              {clip.characters.map((c, i) => (
                <span key={`${c}-${i}`} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs font-mono">
                  {c}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Creative brief / goal */}
        <div className="mt-3">
          {editingGoal ? (
            <div className="space-y-2">
              <textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="What does 'done' look like? Action, character requirements, location, mood, must-avoid..."
                rows={3}
                autoFocus
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder:text-gray-600 resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleGoalSave}
                  disabled={goalSaving}
                  className="px-3 py-1 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
                >
                  {goalSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleGoalCancel}
                  className="px-3 py-1 text-xs font-mono text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : currentGoal ? (
            <div className="flex items-start gap-2">
              <div className="text-xs font-mono text-gray-400 border-l-2 border-accent/30 pl-3 flex-1 whitespace-pre-wrap">
                {currentGoal}
              </div>
              <button
                onClick={startEditGoal}
                className="shrink-0 text-xs font-mono text-gray-500 hover:text-accent transition-colors"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={startEditGoal}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors italic"
            >
              Add creative brief...
            </button>
          )}
        </div>
      </div>
    </>
  );
}
