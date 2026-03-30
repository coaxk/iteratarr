import { useState } from 'react';
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
  const [clipNameDraft, setClipNameDraft] = useState(clip.name);

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
    renamingClip,
    clipNameDraft,
    setClipNameDraft,
    startRename: () => setRenamingClip(true),
    cancelRename: () => setRenamingClip(false),
    handleRenameSave,
  };
}
