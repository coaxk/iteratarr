import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useEvalVideo } from '../useEvalVideo';

function iteration(overrides = {}) {
  return { id: 'iter-2', render_path: '/renders/iter_02.mp4', ...overrides };
}

function parent(overrides = {}) {
  return { id: 'iter-1', render_path: '/renders/iter_01.mp4', ...overrides };
}

describe('useEvalVideo', () => {
  it('sets currentVideoPath from iteration render_path', () => {
    const { result } = renderHook(() => useEvalVideo(iteration(), parent()));
    expect(result.current.currentVideoPath).toBe('/renders/iter_02.mp4');
  });

  it('sets previousVideoPath from parent iteration render_path', () => {
    const { result } = renderHook(() => useEvalVideo(iteration(), parent()));
    expect(result.current.previousVideoPath).toBe('/renders/iter_01.mp4');
  });

  it('sets previousVideoPath to null when parentIteration is null', () => {
    const { result } = renderHook(() => useEvalVideo(iteration(), null));
    expect(result.current.previousVideoPath).toBeNull();
  });

  it('sets currentVideoPath to null when iteration render_path is null', () => {
    const { result } = renderHook(() => useEvalVideo(iteration({ render_path: null }), parent()));
    expect(result.current.currentVideoPath).toBeNull();
  });

  it('resets comparison state on iteration id change', () => {
    const { result, rerender } = renderHook(({ iter }) => useEvalVideo(iter, parent()), {
      initialProps: { iter: iteration({ id: 'iter-2' }) }
    });

    act(() => {
      result.current.setComparisonVideoPath('/renders/compare.mp4');
      result.current.setComparisonIter({ id: 'iter-x' });
    });
    expect(result.current.comparisonVideoPath).toBe('/renders/compare.mp4');

    rerender({ iter: iteration({ id: 'iter-3', render_path: '/renders/iter_03.mp4' }) });
    expect(result.current.comparisonVideoPath).toBeNull();
    expect(result.current.comparisonIter).toBeNull();
  });

  it('updates currentVideoPath when iteration id changes', () => {
    const { result, rerender } = renderHook(({ iter }) => useEvalVideo(iter, parent()), {
      initialProps: { iter: iteration({ id: 'iter-1', render_path: '/a.mp4' }) }
    });
    expect(result.current.currentVideoPath).toBe('/a.mp4');

    rerender({ iter: iteration({ id: 'iter-2', render_path: '/b.mp4' }) });
    expect(result.current.currentVideoPath).toBe('/b.mp4');
  });
});

