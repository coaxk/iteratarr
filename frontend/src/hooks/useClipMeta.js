import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useClipMeta(clip) {
  const queryClient = useQueryClient();

  // Goal / creative brief
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(clip.goal || '');
  const [goalSaving, setGoalSaving] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(clip.goal || '');

  // Clip name
  const [renamingClip, setRenamingClip] = useState(false);
  const [currentClipName, setCurrentClipName] = useState(clip.name);
  const [clipNameDraft, setClipNameDraft] = useState(clip.name);

  // Re-sync all local derived state when the clip identity changes
  useEffect(() => {
    setCurrentGoal(clip.goal || '');
    setGoalDraft(clip.goal || '');
    setCurrentClipName(clip.name);
    setClipNameDraft(clip.name);
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoalSave = async () => {
    setGoalSaving(true);
    try {
      await api.updateClip(clip.id, { goal: goalDraft });
      setCurrentGoal(goalDraft);
      setEditingGoal(false);
    } catch (err) {
      console.error('Failed to save goal:', err);
    } finally {
      setGoalSaving(false);
    }
  };

  const handleGoalCancel = () => {
    setGoalDraft(currentGoal);
    setEditingGoal(false);
  };

  const handleRenameSave = async () => {
    try {
      await api.updateClip(clip.id, { name: clipNameDraft });
      // Update local name immediately so ClipHeader reflects it without waiting for cache refetch
      setCurrentClipName(clipNameDraft);
      // Invalidate clips cache so EpisodeTracker list updates — fixes prop mutation bug
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      setRenamingClip(false);
    } catch (err) {
      console.error('Failed to rename clip:', err);
    }
  };

  return {
    // Goal
    currentGoal,
    editingGoal,
    goalDraft,
    goalSaving,
    startEditGoal: () => setEditingGoal(true),
    setGoalDraft,
    handleGoalSave,
    handleGoalCancel,
    // Clip name
    currentClipName,
    renamingClip,
    clipNameDraft,
    setClipNameDraft,
    startRename: () => setRenamingClip(true),
    cancelRename: () => setRenamingClip(false),
    handleRenameSave,
  };
}
