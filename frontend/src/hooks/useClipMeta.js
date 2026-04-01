import { useReducer, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

const ACTIONS = {
  SYNC: 'sync',
  START_EDIT_GOAL: 'start_edit_goal',
  UPDATE_GOAL_DRAFT: 'update_goal_draft',
  GOAL_SAVING: 'goal_saving',
  GOAL_SAVED: 'goal_saved',
  GOAL_SAVE_DONE: 'goal_save_done',
  CANCEL_GOAL: 'cancel_goal',
  CLEAR_SAVED: 'clear_saved',
  START_RENAME: 'start_rename',
  UPDATE_NAME_DRAFT: 'update_name_draft',
  RENAME_SAVED: 'rename_saved',
  CANCEL_RENAME: 'cancel_rename',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SYNC:
      return {
        ...state,
        currentGoal: action.goal || '',
        goalDraft: action.goal || '',
        currentClipName: action.name,
        clipNameDraft: action.name,
        editingGoal: false,
        renamingClip: false,
        goalSaving: false,
        goalSaved: false,
      };
    case ACTIONS.START_EDIT_GOAL:
      return { ...state, editingGoal: true };
    case ACTIONS.UPDATE_GOAL_DRAFT:
      return { ...state, goalDraft: action.value };
    case ACTIONS.GOAL_SAVING:
      return { ...state, goalSaving: true };
    case ACTIONS.GOAL_SAVED:
      return {
        ...state,
        goalSaving: false,
        editingGoal: false,
        currentGoal: state.goalDraft,
        goalSaved: true,
      };
    case ACTIONS.GOAL_SAVE_DONE:
      return { ...state, goalSaving: false };
    case ACTIONS.CANCEL_GOAL:
      return { ...state, editingGoal: false, goalDraft: state.currentGoal };
    case ACTIONS.CLEAR_SAVED:
      return { ...state, goalSaved: false };
    case ACTIONS.START_RENAME:
      return { ...state, renamingClip: true };
    case ACTIONS.UPDATE_NAME_DRAFT:
      return { ...state, clipNameDraft: action.value };
    case ACTIONS.RENAME_SAVED:
      return { ...state, renamingClip: false, currentClipName: state.clipNameDraft };
    case ACTIONS.CANCEL_RENAME:
      return { ...state, renamingClip: false };
    default:
      return state;
  }
}

export function useClipMeta(clip) {
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(reducer, {
    currentGoal: clip.goal || '',
    goalDraft: clip.goal || '',
    goalSaving: false,
    goalSaved: false,
    editingGoal: false,
    currentClipName: clip.name,
    clipNameDraft: clip.name,
    renamingClip: false,
  });

  // Re-sync when clip identity changes
  useEffect(() => {
    dispatch({ type: ACTIONS.SYNC, goal: clip.goal, name: clip.name });
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoalSave = async () => {
    dispatch({ type: ACTIONS.GOAL_SAVING });
    try {
      await api.updateClip(clip.id, { goal: state.goalDraft });
      dispatch({ type: ACTIONS.GOAL_SAVED });
      setTimeout(() => dispatch({ type: ACTIONS.CLEAR_SAVED }), 2000);
    } catch (err) {
      console.error('Failed to save goal:', err);
      dispatch({ type: ACTIONS.GOAL_SAVE_DONE });
    }
  };

  const handleRenameSave = async () => {
    try {
      await api.updateClip(clip.id, { name: state.clipNameDraft });
      dispatch({ type: ACTIONS.RENAME_SAVED });
      queryClient.invalidateQueries({ queryKey: ['clips'] });
    } catch (err) {
      console.error('Failed to rename clip:', err);
    }
  };

  return {
    // Goal
    currentGoal: state.currentGoal,
    editingGoal: state.editingGoal,
    goalDraft: state.goalDraft,
    goalSaving: state.goalSaving,
    goalSaved: state.goalSaved,
    startEditGoal: () => dispatch({ type: ACTIONS.START_EDIT_GOAL }),
    setGoalDraft: (value) => dispatch({ type: ACTIONS.UPDATE_GOAL_DRAFT, value }),
    handleGoalSave,
    handleGoalCancel: () => dispatch({ type: ACTIONS.CANCEL_GOAL }),
    // Clip name
    currentClipName: state.currentClipName,
    renamingClip: state.renamingClip,
    clipNameDraft: state.clipNameDraft,
    setClipNameDraft: (value) => dispatch({ type: ACTIONS.UPDATE_NAME_DRAFT, value }),
    startRename: () => dispatch({ type: ACTIONS.START_RENAME }),
    cancelRename: () => dispatch({ type: ACTIONS.CANCEL_RENAME }),
    handleRenameSave,
  };
}
