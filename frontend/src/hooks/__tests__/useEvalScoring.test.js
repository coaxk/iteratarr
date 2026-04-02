import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEvalScoring } from '../useEvalScoring';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../../constants';

function buildScores(val = 3) {
  const identity = Object.fromEntries(IDENTITY_FIELDS.map(f => [f.key, val]));
  const location = Object.fromEntries(LOCATION_FIELDS.map(f => [f.key, val]));
  const motion = Object.fromEntries(MOTION_FIELDS.map(f => [f.key, val]));
  return { identity, location, motion };
}

function buildIteration(id = 'iter-1', evaluation = null) {
  return { id, evaluation };
}

describe('useEvalScoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default state for unevaluated iteration', () => {
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null)));

    expect(result.current.identity.face_match).toBe(3);
    expect(result.current.location.location_correct).toBe(3);
    expect(result.current.motion.action_executed).toBe(3);
    expect(result.current.grandTotal).toBe(45);
    expect(result.current.canLock).toBe(false);
    expect(result.current.scoringSource).toBe('manual');
    expect(result.current.aiScores).toBeNull();
    expect(result.current.notes).toBe('');
    expect(result.current.attribution).toEqual({});
  });

  it('syncs scoring state from evaluated iteration', () => {
    const scores = buildScores(4);
    scores.identity.frame_consistency = 5;
    const evaluation = {
      scores,
      attribution: { rope: 'rope_1_prompt_position', lowest_element: 'camera_movement' },
      qualitative_notes: 'Good likeness',
      ai_scores: buildScores(3),
      scoring_source: 'vision_api'
    };

    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', evaluation)));

    expect(result.current.identity).toEqual(scores.identity);
    expect(result.current.location).toEqual(scores.location);
    expect(result.current.motion).toEqual(scores.motion);
    expect(result.current.attribution).toEqual(evaluation.attribution);
    expect(result.current.notes).toBe('Good likeness');
    expect(result.current.scoringSource).toBe('vision_api');
    const total = [...Object.values(scores.identity), ...Object.values(scores.location), ...Object.values(scores.motion)]
      .reduce((s, v) => s + v, 0);
    expect(result.current.grandTotal).toBe(total);
  });

  it('resets to defaults when iteration id changes to unevaluated', () => {
    const evaluation = { scores: buildScores(5), attribution: {}, qualitative_notes: 'x', ai_scores: null, scoring_source: 'manual' };
    const { result, rerender } = renderHook(({ iteration }) => useEvalScoring(iteration), {
      initialProps: { iteration: buildIteration('iter-1', evaluation) }
    });

    expect(result.current.grandTotal).toBe(75);
    rerender({ iteration: buildIteration('iter-2', null) });

    expect(result.current.identity.face_match).toBe(3);
    expect(result.current.location.location_correct).toBe(3);
    expect(result.current.motion.action_executed).toBe(3);
    expect(result.current.grandTotal).toBe(45);
  });

  it('recalculates grandTotal when scores change', () => {
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null)));
    expect(result.current.grandTotal).toBe(45);

    act(() => {
      result.current.setIdentity(prev => ({ ...prev, face_match: 5 }));
    });
    expect(result.current.grandTotal).toBe(47);
  });

  it('toggles canLock around the lock threshold', () => {
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null)));

    act(() => {
      result.current.setIdentity(buildScores(5).identity);
      result.current.setLocation(buildScores(5).location);
      result.current.setMotion(buildScores(5).motion);
    });
    expect(result.current.grandTotal).toBe(75);
    expect(result.current.canLock).toBe(true);

    act(() => {
      result.current.setMotion(prev => ({ ...prev, action_executed: 1 }));
    });
    expect(result.current.grandTotal).toBe(71);
    expect(result.current.canLock).toBe(true);

    act(() => {
      result.current.setIdentity(buildScores(4).identity);
      result.current.setLocation(buildScores(4).location);
      result.current.setMotion(buildScores(4).motion);
      result.current.setMotion(prev => ({ ...prev, action_executed: 1 }));
    });
    expect(result.current.grandTotal).toBe(57);
    expect(result.current.canLock).toBe(false);
  });

  it('calls onScoreChange when total changes', () => {
    const onScoreChange = vi.fn();
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null), { onScoreChange }));

    expect(onScoreChange).toHaveBeenCalledWith(45);
    act(() => {
      result.current.setLocation(prev => ({ ...prev, geometry_correct: 5 }));
    });
    expect(onScoreChange).toHaveBeenLastCalledWith(47);
  });

  it('importScores populates all scoring fields and metadata', () => {
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null)));
    const imported = {
      scores: buildScores(4),
      attribution: { rope: 'rope_1' },
      qualitative_notes: 'AI notes',
      scoring_source: 'vision_api'
    };

    act(() => {
      result.current.importScores(imported);
    });

    expect(result.current.identity).toEqual(imported.scores.identity);
    expect(result.current.location).toEqual(imported.scores.location);
    expect(result.current.motion).toEqual(imported.scores.motion);
    expect(result.current.aiScores).toEqual(imported.scores);
    expect(result.current.attribution).toEqual(imported.attribution);
    expect(result.current.notes).toBe('AI notes');
    expect(result.current.scoringSource).toBe('vision_api');
  });

  it('calls onUnsavedScoresChange with true when ai scores are imported on unevaluated iteration', async () => {
    const onUnsavedScoresChange = vi.fn();
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null), { onUnsavedScoresChange }));

    act(() => {
      result.current.importScores({ scores: buildScores(4), attribution: {}, qualitative_notes: '', scoring_source: 'vision_api' });
    });

    await waitFor(() => {
      expect(onUnsavedScoresChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('adds beforeunload listener when ai scores exist and iteration is not evaluated', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useEvalScoring(buildIteration('iter-1', null)));

    act(() => {
      result.current.importScores({ scores: buildScores(4), attribution: {}, qualitative_notes: '', scoring_source: 'vision_api' });
    });

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
  });

  it('does not add beforeunload listener for evaluated iteration', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const evaluation = { scores: buildScores(4), attribution: {}, qualitative_notes: '', ai_scores: buildScores(4), scoring_source: 'manual' };
    renderHook(() => useEvalScoring(buildIteration('iter-1', evaluation)));

    await waitFor(() => {
      expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
  });
});

