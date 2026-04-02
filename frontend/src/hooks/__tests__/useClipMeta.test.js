import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClipMeta } from '../useClipMeta';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    updateClip: vi.fn(() => Promise.resolve({}))
  }
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
}

function clip(overrides = {}) {
  return {
    id: 'clip-1',
    name: 'Mick Doohan - Baseline',
    goal: 'Achieve realistic likeness',
    ...overrides
  };
}

describe('useClipMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes state from clip values', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    expect(result.current.currentGoal).toBe('Achieve realistic likeness');
    expect(result.current.currentClipName).toBe('Mick Doohan - Baseline');
    expect(result.current.editingGoal).toBe(false);
    expect(result.current.renamingClip).toBe(false);
  });

  it('startEditGoal sets editingGoal true', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    act(() => result.current.startEditGoal());
    expect(result.current.editingGoal).toBe(true);
  });

  it('setGoalDraft updates draft without changing currentGoal', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    act(() => result.current.setGoalDraft('new goal text'));
    expect(result.current.goalDraft).toBe('new goal text');
    expect(result.current.currentGoal).toBe('Achieve realistic likeness');
  });

  it('handleGoalCancel reverts draft and exits edit mode', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    act(() => {
      result.current.startEditGoal();
      result.current.setGoalDraft('temp');
    });
    act(() => result.current.handleGoalCancel());
    expect(result.current.goalDraft).toBe('Achieve realistic likeness');
    expect(result.current.editingGoal).toBe(false);
  });

  it('handleGoalSave success updates goal state and calls API', async () => {
    api.updateClip.mockResolvedValueOnce({});
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });

    act(() => {
      result.current.startEditGoal();
      result.current.setGoalDraft('New goal');
    });

    await act(async () => {
      await result.current.handleGoalSave();
    });

    await waitFor(() => {
      expect(result.current.goalSaving).toBe(false);
      expect(result.current.currentGoal).toBe('New goal');
      expect(result.current.editingGoal).toBe(false);
      expect(result.current.goalSaved).toBe(true);
    });

    expect(api.updateClip).toHaveBeenCalledWith('clip-1', { goal: 'New goal' });
  });

  it('handleGoalSave error returns saving to false and leaves goal unchanged', async () => {
    api.updateClip.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });

    act(() => {
      result.current.startEditGoal();
      result.current.setGoalDraft('Will fail');
    });

    await act(async () => {
      await result.current.handleGoalSave();
    });

    expect(result.current.goalSaving).toBe(false);
    expect(result.current.currentGoal).toBe('Achieve realistic likeness');
    expect(result.current.goalSaved).toBe(false);
  });

  it('clears goalSaved after timeout', async () => {
    vi.useFakeTimers();
    api.updateClip.mockResolvedValueOnce({});
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });

    act(() => result.current.setGoalDraft('Saved goal'));
    await act(async () => {
      await result.current.handleGoalSave();
    });
    expect(result.current.goalSaved).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.goalSaved).toBe(false);
  });

  it('startRename and cancelRename toggle renamingClip', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    act(() => result.current.startRename());
    expect(result.current.renamingClip).toBe(true);
    act(() => result.current.cancelRename());
    expect(result.current.renamingClip).toBe(false);
  });

  it('setClipNameDraft updates clipNameDraft', () => {
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });
    act(() => result.current.setClipNameDraft('New Name'));
    expect(result.current.clipNameDraft).toBe('New Name');
  });

  it('handleRenameSave success updates currentClipName and calls API', async () => {
    api.updateClip.mockResolvedValueOnce({});
    const { result } = renderHook(() => useClipMeta(clip()), { wrapper: createWrapper() });

    act(() => {
      result.current.startRename();
      result.current.setClipNameDraft('Renamed Clip');
    });

    await act(async () => {
      await result.current.handleRenameSave();
    });

    expect(result.current.currentClipName).toBe('Renamed Clip');
    expect(result.current.renamingClip).toBe(false);
    expect(api.updateClip).toHaveBeenCalledWith('clip-1', { name: 'Renamed Clip' });
  });

  it('re-syncs state when clip id changes', () => {
    const { result, rerender } = renderHook(({ c }) => useClipMeta(c), {
      wrapper: createWrapper(),
      initialProps: { c: clip({ id: 'a', name: 'A', goal: 'GA' }) }
    });

    act(() => {
      result.current.startEditGoal();
      result.current.startRename();
    });

    rerender({ c: clip({ id: 'b', name: 'B', goal: 'GB' }) });
    expect(result.current.currentGoal).toBe('GB');
    expect(result.current.currentClipName).toBe('B');
    expect(result.current.editingGoal).toBe(false);
    expect(result.current.renamingClip).toBe(false);
  });

  it('handles null goal as empty string', () => {
    const { result } = renderHook(() => useClipMeta(clip({ goal: null })), { wrapper: createWrapper() });
    expect(result.current.currentGoal).toBe('');
    expect(result.current.goalDraft).toBe('');
  });
});
